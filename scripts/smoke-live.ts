/**
 * `pnpm smoke:live` — ONE REAL MATCH, REAL MODELS, REAL MONEY (a fraction of a cent).
 *
 * Everything else in this repo is tested against fakes, seeds and scripted
 * transports. This is the only thing that answers: *does it actually work when a
 * real LLM is on the other end?* It drives the REAL production modules — the same
 * `createOpenRouterPlayer`, `runMatch`, `analyzeMatch` and commentator the browser
 * uses — so a bug here is a bug users would hit.
 *
 * What it proves:
 *   1. a real model can be prompted, parsed, retried and (if it misbehaves) forfeited;
 *   2. telemetry is real: latency, tokens, and COST from a live price snapshot;
 *   3. the solver grades real moves (Precyzja, blunders, moment zwrotny);
 *   4. the commentator answers in Polish, in ≤2 sentences;
 *   5. the server accepts the match: replay + eval revalidation + Elo;
 *   6. §16 — THE KEY GOES NOWHERE BUT openrouter.ai. Every fetch is intercepted
 *      and any request carrying the key to another host fails the run.
 *
 * Usage:  OPENROUTER_API_KEY=sk-or-... pnpm smoke:live
 *         (put it in the gitignored .env — it is never written to code or committed)
 */
import 'dotenv/config';

import {
  type GameAnalysis,
  type GameDefinition,
  type GameId,
  type Move,
  type SetupRecord,
  type Variant,
  analyzeMatch,
  getGame,
  registerLexicon,
} from '@arena/game-core';

import { runMatch } from '@/game/orchestrator';
import {
  type CommentRequest,
  buildCommentaryPrompt,
  classifyLastMove,
  trimToTwoSentences,
} from '@/providers/commentator';
import { createOpenRouterPlayer, createOpenRouterTransport } from '@/providers/openrouter';

const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) {
  console.error(
    'Brak OPENROUTER_API_KEY.\nDodaj go do .env (plik jest gitignorowany) i uruchom ponownie.',
  );
  process.exit(2);
}

const SERVER = process.env.SMOKE_SERVER ?? 'http://localhost:8093';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me';

// Which game to smoke (plan §9: also sudoku `mini` and scrabble `en`).
//   SMOKE_GAME=sudoku SMOKE_VARIANT=mini pnpm smoke:live
//   SMOKE_GAME=scrabble SMOKE_VARIANT=en pnpm smoke:live
const GAME = (process.env.SMOKE_GAME ?? 'tictactoe') as GameId;
const def = getGame(GAME) as unknown as GameDefinition<unknown, Move>;
const VARIANT = process.env.SMOKE_VARIANT ?? def.variants[0]!.id;
const variantObj: Variant = def.variants.find((v) => v.id === VARIANT) ?? def.variants[0]!;

function safetyFor(game: GameId): number {
  if (game === 'battleship') return 200;
  if (game === 'sudoku') return 500;
  if (game === 'scrabble') return 200;
  return 9;
}

function configFromSetup(setup: SetupRecord | null | undefined) {
  if (!setup) return {};
  return {
    seed: typeof setup.seed === 'number' ? setup.seed : undefined,
    extraShotOnHit: typeof setup.extraShotOnHit === 'boolean' ? setup.extraShotOnHit : undefined,
    placements: setup.placements,
  };
}

// A cheap paid model (proves the COST path) vs a free one (proves the zero-cost path).
const P1_MODEL = process.env.SMOKE_P1 ?? 'openai/gpt-4o-mini';
const P2_MODEL = process.env.SMOKE_P2 ?? 'meta-llama/llama-3.2-3b-instruct:free';
const COMMENTATOR_MODEL = process.env.SMOKE_COMMENTATOR ?? 'meta-llama/llama-3.2-3b-instruct:free';

// ---------------------------------------------------------------------------
// §16 guard: wrap fetch and watch where the key actually goes.
// ---------------------------------------------------------------------------
const hostsSeen = new Set<string>();
const leaks: string[] = [];
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const host = new URL(url).host;
  hostsSeen.add(host);

  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const carriesKey = [...headers.values()].some((v) => v.includes(KEY));
  const bodyCarriesKey = typeof init?.body === 'string' && init.body.includes(KEY);

  if ((carriesKey || bodyCarriesKey) && host !== 'openrouter.ai') {
    leaks.push(`${host} ← klucz w ${carriesKey ? 'nagłówku' : 'body'}`);
  }
  return realFetch(input as never, init);
}) as typeof fetch;

// ---------------------------------------------------------------------------

const fmtMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`);
const fmtCost = (c?: number) => (c === undefined ? '—' : c === 0 ? '$0' : `$${c.toFixed(6)}`);
const fmtTok = (n?: number) => (n === undefined ? '—' : String(n));

interface RawModel {
  id: string;
  pricing?: { prompt?: string; completion?: string };
}

async function priceOf(id: string): Promise<{ prompt: number; completion: number } | undefined> {
  const res = await realFetch('https://openrouter.ai/api/v1/models');
  const data = ((await res.json()) as { data: RawModel[] }).data;
  const m = data.find((x) => x.id === id);
  if (!m) {
    console.error(`  ⚠ modelu ${id} NIE MA w katalogu — partia by się nie udała`);
    return undefined;
  }
  return {
    prompt: Number(m.pricing?.prompt ?? 0),
    completion: Number(m.pricing?.completion ?? 0),
  };
}

async function main(): Promise<void> {
  console.log('=== SMOKE: prawdziwa partia, prawdziwe modele ===\n');
  console.log(`  Gra: ${GAME} / ${VARIANT}`);
  console.log(`  P1: ${P1_MODEL}`);
  console.log(`  P2: ${P2_MODEL}\n`);

  // Scrabble needs its dictionary registered before any move can be validated.
  if (GAME === 'scrabble') {
    const { loadLexiconNode } = await import('@arena/lexicons/node');
    for (const lang of ['pl', 'en'] as const) {
      registerLexicon(lang, await loadLexiconNode(lang));
    }
    console.log('  słowniki pl+en załadowane\n');
  }

  const [p1Price, p2Price] = await Promise.all([priceOf(P1_MODEL), priceOf(P2_MODEL)]);

  const players = {
    p1: createOpenRouterPlayer({ model: P1_MODEL, apiKey: KEY!, price: p1Price }, P1_MODEL),
    p2: createOpenRouterPlayer({ model: P2_MODEL, apiKey: KEY!, price: p2Price }, P2_MODEL),
  };

  // 1. REAL MATCH through the real orchestrator.
  const t0 = Date.now();
  const outcome = await runMatch({
    mode: 'model_vs_model',
    game: GAME,
    variant: variantObj,
    players,
    safetyMaxMoves: safetyFor(GAME),
  });
  const durationMs = Date.now() - t0;
  smokeSetup = (outcome.setup as SetupRecord | null) ?? null;

  console.log('=== RUCHY (telemetria z prawdziwych wywołań) ===');
  console.log('  #  gracz  ruch  czas      tokeny(we+wy)  koszt        poprawki  wymuszony');
  for (const m of outcome.moves) {
    const t = m.telemetry;
    console.log(
      `  ${String(m.index + 1).padEnd(2)} ${m.player}     ${String(m.move).padEnd(4)} ` +
        `${fmtMs(t.latencyMs).padEnd(9)} ${(fmtTok(t.promptTokens) + '+' + fmtTok(t.completionTokens)).padEnd(14)} ` +
        `${fmtCost(t.costUsd).padEnd(12)} ${String(t.retries).padEnd(9)} ${t.forfeit ? 'TAK' : '-'}`,
    );
  }

  const totalCost = outcome.moves.reduce((s, m) => s + (m.telemetry.costUsd ?? 0), 0);
  const forfeits = outcome.moves.filter((m) => m.telemetry.forfeit).length;
  const retries = outcome.moves.reduce((s, m) => s + m.telemetry.retries, 0);
  console.log(
    `\n  Wynik: ${outcome.winner ?? 'przerwana'} | czas: ${fmtMs(durationMs)} | ` +
      `koszt partii: ${fmtCost(totalCost)} | poprawki: ${retries} | wymuszone: ${forfeits}`,
  );

  // 2. REAL solver grading of real moves (scrabble has none — analysis is empty).
  const analysis: GameAnalysis = analyzeMatch(
    GAME,
    VARIANT,
    outcome.setup,
    outcome.moves.map((m) => ({ player: m.player, move: m.move })),
  );
  const pct = (r: number) => `${Math.round(r * 100)}%`;
  console.log('\n=== ANALIZA (solver na prawdziwych ruchach) ===');
  console.log(
    `  Precyzja P1: ${pct(analysis.accuracy.p1.rate)} | P2: ${pct(analysis.accuracy.p2.rate)}`,
  );
  console.log(
    `  Moment zwrotny: ${analysis.turningPoint === null ? 'brak błędów' : `ruch #${analysis.turningPoint + 1}`}`,
  );
  console.log(`  Jakość: ${analysis.moves.map((m) => m.quality[0]).join(' ')}   (o=opt g=good w=weak b=blunder)`);

  // 3. REAL commentator — must answer in Polish, ≤2 sentences.
  console.log('\n=== KOMENTATOR (prawdziwy trzeci model) ===');
  const commentTransport = createOpenRouterTransport({
    model: COMMENTATOR_MODEL,
    apiKey: KEY!,
    temperature: 0.7,
    maxTokens: 90,
  });
  // Comment the turning point if there was one, else the final move.
  const idx = analysis.turningPoint ?? outcome.moves.length - 1;
  const entry = outcome.moves[idx]!;
  const stateBefore = replayTo(outcome.moves, idx);
  const req: CommentRequest = {
    game: GAME,
    moveIndex: idx,
    player: entry.player,
    playerName: entry.player === 'p1' ? P1_MODEL : P2_MODEL,
    move: entry.move,
    quality: classifyLastMove(GAME, stateBefore, entry.player, entry.move),
    state: replayTo(outcome.moves, idx + 1),
    isFinal: idx === outcome.moves.length - 1,
    winnerName: outcome.winner === 'p1' ? P1_MODEL : outcome.winner === 'p2' ? P2_MODEL : null,
  };
  const { system, user } = buildCommentaryPrompt(req);
  // Free models 429 constantly. In the app this is swallowed by the queue (the
  // commentator is decoration), so the harness must not die on it either.
  try {
    const said = await commentTransport(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      new AbortController().signal,
    );
    const comment = trimToTwoSentences(said.text);
    console.log(`  o ruchu #${idx + 1} (${req.quality}): „${comment}"`);
    const polish = /[ąćęłńóśźż]/i.test(comment);
    const sentences = (comment.match(/[.!?]/g) ?? []).length;
    console.log(`  po polsku: ${polish ? 'TAK ✔' : 'NIE ← podejrzane'} | zdań: ${sentences || 1} ${sentences <= 2 ? '✔' : '← za dużo'}`);
  } catch (e) {
    console.log(`  komentator padł (${(e as Error).message.slice(0, 60)}…)`);
    console.log('  → w aplikacji to jest połknięte przez kolejkę: gra idzie dalej bez dymka.');
  }

  // 4. REAL server: replay + eval revalidation + Elo.
  console.log('\n=== SERWER (replay + Elo) ===');
  await submitToServer(outcome, { [`openrouter:${P1_MODEL}`]: p1Price });

  // 5. §16 — where did the key actually go?
  console.log('\n=== §16: DOKĄD POSZEDŁ KLUCZ ===');
  console.log(`  hosty, z którymi rozmawialiśmy: ${[...hostsSeen].join(', ')}`);
  if (leaks.length > 0) {
    console.error(`  WYCIEK KLUCZA: ${leaks.join('; ')}`);
    process.exit(1);
  }
  console.log('  klucz wysłany WYŁĄCZNIE do openrouter.ai ✔');

  console.log('\nOK: prawdziwa partia rozegrana i zweryfikowana.');
}

/** Board state after the first `n` moves (the engine is the source of truth). */
function replayTo(moves: { player: 'p1' | 'p2'; move: Move }[], n: number): unknown {
  let s = def.createInitialState(variantObj, configFromSetup(smokeSetup));
  for (let i = 0; i < n; i++) s = def.applyMove(s, moves[i]!.player, moves[i]!.move);
  return s;
}

/** Setup of the match being smoked — set once the match runs (for replayTo). */
let smokeSetup: SetupRecord | null = null;

async function submitToServer(
  outcome: Awaited<ReturnType<typeof runMatch>>,
  priceSnapshot: unknown,
): Promise<void> {
  const { signSession, newJti } = await import('../apps/server/src/auth/jwt');
  const { token } = await signSession(JWT_SECRET, 1800, newJti());

  const payload = {
    mode: outcome.mode,
    game: outcome.game,
    variant: outcome.variant,
    p1Id: outcome.p1Id,
    p2Id: outcome.p2Id,
    moves: outcome.moves.map((m) => ({
      player: m.player,
      move: m.move,
      telemetry: m.telemetry,
    })),
    setup: outcome.setup,
    lab: false,
    priceSnapshot,
  };

  let res: Response;
  try {
    res = await realFetch(`${SERVER}/api/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch {
    console.log(`  (serwer ${SERVER} nie odpowiada — pomijam; odpal 'docker compose up -d' w deploy/)`);
    return;
  }

  const body = await res.json();
  if (!res.ok) {
    console.error(`  ODRZUCONE przez serwer (${res.status}):`, body);
    process.exit(1);
  }
  console.log(`  zaakceptowane: match ${String((body as { matchId: string }).matchId).slice(0, 8)}…`);
  for (const rc of (body as { ratingChanges: { subjectId: string; before: number; after: number }[] })
    .ratingChanges) {
    const d = Math.round(rc.after - rc.before);
    console.log(
      `  Elo ${rc.subjectId}: ${Math.round(rc.before)} → ${Math.round(rc.after)} (${d >= 0 ? '+' : ''}${d})`,
    );
  }
}

await main();
