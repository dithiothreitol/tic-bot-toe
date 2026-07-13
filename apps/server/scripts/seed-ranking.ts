/**
 * Owner-only ranking seeder — gives a fresh deployment a non-empty leaderboard
 * and working "Compare" view WITHOUT weakening the public anti-bot layer.
 *
 * It plays REAL model-vs-model games (real OpenRouter calls on the owner's key)
 * and persists each through the SAME server path a browser save uses —
 * `submitResult` — which replays the match, recomputes move quality and Elo, and
 * rejects anything that does not check out. The only thing skipped is the HTTP
 * front (JWT + Turnstile): that gate exists to stop anonymous bots hitting the
 * public endpoint, and this runs server-side, invoked by the owner, on real
 * games. Nothing here is exposed as a route.
 *
 * Run (inside the server's docker network, DATABASE_URL + OPENROUTER_API_KEY set):
 *   tsx apps/server/scripts/seed-ranking.ts
 *
 * Env:
 *   DATABASE_URL         Postgres to seed.
 *   OPENROUTER_API_KEY   Owner's key (pays for the games; free ids also work).
 *   SEED_MODELS          Comma list of OpenRouter ids (default below).
 *   SEED_GAMES_PER_PAIR  Games per ordered model pair (default 2).
 */
import {
  type GameDefinition,
  type GameId,
  type Move,
  type MoveResult,
  type MoveTelemetry,
  type PlayerSide,
  type Variant,
  TICTACTOE_VARIANTS,
  getGame,
} from '@arena/game-core';
import { randomUUID } from 'node:crypto';

import { createDb } from '../src/db/client';
import { type ResultMove, type ResultPayload, submitResult } from '../src/db/results';

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const API_KEY = process.env.OPENROUTER_API_KEY ?? '';
// Cheap PAID ids by default — the reliable path. NOTE: the account must hold
// OpenRouter credits, or paid models 402. Free `:free` ids need no credits but
// are heavily rate-limited upstream (429, ~24s back-off), so they cannot sustain
// a round-robin — override SEED_MODELS with them only for a token smoke test.
// At ~$0.0001 per tic-tac-toe game, a couple of dollars seeds thousands.
const MODELS = (process.env.SEED_MODELS ??
  'openai/gpt-4o-mini,google/gemini-2.0-flash-001,meta-llama/llama-3.1-8b-instruct')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const GAMES_PER_PAIR = Number(process.env.SEED_GAMES_PER_PAIR ?? 2);
/** Spacing between model calls — free endpoints are rate-limited (429). */
const MOVE_DELAY_MS = Number(process.env.SEED_MOVE_DELAY_MS ?? 700);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const OPENROUTER = 'https://openrouter.ai/api/v1';

interface Price {
  prompt: number;
  completion: number;
}

/** Public catalog → USD/token per model, for real cost telemetry + priceSnapshot. */
async function fetchPrices(): Promise<Map<string, Price>> {
  const res = await fetch(`${OPENROUTER}/models`);
  const data = (await res.json()) as {
    data?: Array<{ id: string; pricing?: { prompt?: string; completion?: string } }>;
  };
  const map = new Map<string, Price>();
  for (const m of data.data ?? []) {
    map.set(m.id, {
      prompt: Number(m.pricing?.prompt ?? 0) || 0,
      completion: Number(m.pricing?.completion ?? 0) || 0,
    });
  }
  return map;
}

/** One model turn. Mirrors the web runLlmMove: retry an illegal move, then forfeit. */
async function llmMove(
  model: string,
  price: Price | undefined,
  system: string,
  user: string,
  def: GameDefinition<unknown, Move>,
  legal: Move[],
): Promise<MoveResult> {
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  let latencyMs = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let sawTokens = false;

  for (let attempt = 0; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const start = Date.now();
    let text: string | null = null;
    try {
      const res = await fetch(`${OPENROUTER}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
          'X-Title': 'tic-bot-toe seed',
        },
        body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 60 }),
        signal: controller.signal,
      });
      if (res.ok) {
        const j = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        text = j.choices?.[0]?.message?.content ?? '';
        if (j.usage?.prompt_tokens !== undefined) {
          promptTokens += j.usage.prompt_tokens;
          sawTokens = true;
        }
        if (j.usage?.completion_tokens !== undefined) {
          completionTokens += j.usage.completion_tokens;
          sawTokens = true;
        }
      }
    } catch {
      /* network / timeout — a failed attempt */
    } finally {
      clearTimeout(timer);
      latencyMs += Math.max(0, Date.now() - start);
    }

    if (text !== null) {
      const move = def.parseMove(text, legal);
      if (move !== null) {
        const telemetry: MoveTelemetry = { latencyMs, retries: attempt, forfeit: false };
        if (sawTokens) {
          telemetry.promptTokens = promptTokens;
          telemetry.completionTokens = completionTokens;
          if (price) telemetry.costUsd = promptTokens * price.prompt + completionTokens * price.completion;
        }
        return { move, telemetry };
      }
      messages.push({ role: 'assistant', content: text });
      messages.push({
        role: 'user',
        content: `That was not a valid move. Choose ONLY from: ${legal.join(', ')}. Respond with ONLY the required JSON object.`,
      });
    }
    // Back off between attempts too — a failed try is often a 429.
    if (attempt < 3) await sleep(MOVE_DELAY_MS);
  }

  // Exhausted retries → random legal move, flagged as our forfeit.
  const move = legal[Math.floor(Math.random() * legal.length)] ?? legal[0]!;
  return { move, telemetry: { latencyMs, retries: 3, forfeit: true } };
}

async function playGame(
  game: GameId,
  variant: Variant,
  p1: string,
  p2: string,
  prices: Map<string, Price>,
): Promise<ResultPayload> {
  const def = getGame(game) as GameDefinition<unknown, Move>;
  let state = def.createInitialState(variant, {});
  const moves: ResultMove[] = [];
  const modelOf: Record<PlayerSide, string> = { p1, p2 };

  while (def.status(state) === 'playing' && moves.length < 9) {
    const side = def.currentPlayer(state);
    const view = def.viewFor(state, side);
    const legal = def.legalMoves(state, side);
    const { system, user } = def.renderPrompt(view, legal);
    const res = await llmMove(modelOf[side], prices.get(modelOf[side]), system, user, def, legal);
    state = def.applyMove(state, side, res.move);
    // No `eval` on purpose — the server recomputes it and rejects a mismatch.
    moves.push({ player: side, move: res.move, telemetry: res.telemetry });
    await sleep(MOVE_DELAY_MS);
  }

  const priceSnapshot: Record<string, Price> = {};
  for (const m of [p1, p2]) {
    const pr = prices.get(m);
    if (pr) priceSnapshot[`openrouter:${m}`] = pr;
  }

  return {
    mode: 'model_vs_model',
    game,
    variant: variant.id,
    p1Id: `openrouter:${p1}`,
    p2Id: `openrouter:${p2}`,
    moves,
    setup: def.serializeSetup(state),
    priceSnapshot,
  };
}

async function main(): Promise<void> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL not set');
  if (!API_KEY) throw new Error('OPENROUTER_API_KEY not set');

  const prices = await fetchPrices();
  const unknown = MODELS.filter((m) => !prices.has(m));
  if (unknown.length) console.warn(`[seed] not in catalog, playing anyway: ${unknown.join(', ')}`);

  const { db, close } = createDb(DATABASE_URL);
  const variant = TICTACTOE_VARIANTS[0];

  // Round-robin so every pair shares games → the Compare view has data.
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < MODELS.length; i++) {
    for (let j = 0; j < MODELS.length; j++) {
      if (i !== j) pairs.push([MODELS[i], MODELS[j]]);
    }
  }

  let saved = 0;
  let ranked = 0;
  for (const [p1, p2] of pairs) {
    for (let g = 0; g < GAMES_PER_PAIR; g++) {
      const payload = await playGame('tictactoe', variant, p1, p2, prices);
      const r = await submitResult(db, randomUUID(), payload, null, {});
      if (r.ok) {
        saved++;
        if (r.ranked) ranked++;
        console.log(`[seed] ${p1} vs ${p2} → ${r.winner} (ranked=${r.ranked}) ${r.matchId}`);
      } else {
        console.log(`[seed] ${p1} vs ${p2} → REJECTED ${r.code} ${r.reason}`);
      }
    }
  }

  console.log(`[seed] done: ${saved} saved, ${ranked} ranked, of ${pairs.length * GAMES_PER_PAIR} attempted`);
  await close();
}

main().catch((e) => {
  console.error('[seed] fatal:', e);
  process.exit(1);
});
