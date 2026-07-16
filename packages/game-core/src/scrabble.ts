/**
 * Scrabble / "Word Battle" engine (plan §5). Two variants — `pl` and `en` —
 * differing only in tile set and dictionary; the board and rules are shared.
 *
 * Hidden information (SPEC §5): `viewFor` returns the player's OWN rack, the
 * board, and counts — never the opponent's rack nor the bag's contents/order.
 * Enforced by a snapshot test.
 *
 * The legal-move set is not enumerable (tens of thousands of placements), so the
 * engine validates a CONCRETE move via `validateMove` (plan §3) rather than
 * `legalMoves`. Dictionaries are injected through the game-core lexicon registry
 * (they are not serializable, so they cannot ride through SetupConfig).
 */

import { getLexicon, type Lexicon } from './lexicon-registry';
import { mulberry32 } from './rng';
import {
  BINGO_BONUS,
  BOARD_SIZE,
  CENTER_CELL,
  RACK_SIZE,
  type ScrabbleVariant,
  letterValues,
  premiumAt,
  premiumMarker,
  tilesFor,
} from './scrabble-data';
import type {
  GameDefinition,
  GameStatus,
  MoveRejection,
  MoveValidation,
  PlacedTile,
  PlayerSide,
  PlayerView,
  PromptOptions,
  RenderedPrompt,
  ScrabbleAnnotatedEntry,
  ScrabbleView,
  SetupConfig,
  SetupRecord,
  Variant,
} from './types';

const N = BOARD_SIZE;
const COLS = 'ABCDEFGHIJKLMNO';

export const SCRABBLE_VARIANTS: Variant[] = [
  { id: 'pl', label: 'Polski' },
  { id: 'en', label: 'Angielski' },
];

export function asScrabbleVariant(id: string): ScrabbleVariant {
  if (id !== 'pl' && id !== 'en') throw new Error(`Unknown scrabble variant: ${id}`);
  return id;
}

export interface ScrabbleHistoryEntry {
  player: PlayerSide;
  notation: string;
  words: { word: string; score: number }[];
  total: number;
}

export interface ScrabbleState {
  variant: ScrabbleVariant;
  seed: number;
  board: (PlacedTile | null)[];
  /** Draw pile — draw from the END. Shuffled once from the seed. */
  bag: string[];
  racks: Record<PlayerSide, string[]>;
  scores: Record<PlayerSide, number>;
  /** Consecutive scoreless moves (PASS / EXCHANGE / 0-point play) → end rule (b). */
  scorelessStreak: number;
  history: ScrabbleHistoryEntry[];
  toMove: PlayerSide;
  /** PRNG values consumed so far — lets EXCHANGE reinsertion stay replayable. */
  rngUses: number;
}

function other(p: PlayerSide): PlayerSide {
  return p === 'p1' ? 'p2' : 'p1';
}

// --------------------------------------------------------------------------
// Coordinates + notation
// --------------------------------------------------------------------------

function cellCoord(cell: number): string {
  return `${COLS[cell % N]}${Math.floor(cell / N) + 1}`;
}

type Dir = 'across' | 'down';

interface PlaceMove {
  kind: 'place';
  col: number;
  row: number;
  dir: Dir;
  /** Each tile to lay along the line; `isBlank` = played by a blank. */
  tiles: { letter: string; isBlank: boolean }[];
}
type ParsedMove =
  | PlaceMove
  | { kind: 'exchange'; tiles: string[] }
  | { kind: 'pass' };

function isLetter(ch: string): boolean {
  return ch.toLowerCase() !== ch.toUpperCase();
}

/** Parse one notation token (already NFC-normalized) into a structured move. */
function parseNotation(raw: string): ParsedMove | null {
  const s = raw.trim();
  if (/^PASS$/i.test(s)) return { kind: 'pass' };

  const exch = /^EXCH:([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż?]+)$/.exec(s);
  if (exch) {
    const tiles = Array.from(exch[1]).map((ch) => (ch === '?' ? '?' : ch.toUpperCase()));
    return { kind: 'exchange', tiles };
  }

  const place = /^([A-Oa-o])(1[0-5]|[1-9])([>v])(.+)$/.exec(s);
  if (place) {
    const col = COLS.indexOf(place[1].toUpperCase());
    const row = Number(place[2]) - 1;
    const dir: Dir = place[3] === 'v' ? 'down' : 'across';
    const body = place[4];
    const tiles: { letter: string; isBlank: boolean }[] = [];
    for (const ch of Array.from(body)) {
      if (!isLetter(ch)) return null;
      // lowercase letter = a blank playing that letter.
      const isBlank = ch === ch.toLowerCase() && ch !== ch.toUpperCase();
      tiles.push({ letter: ch.toUpperCase(), isBlank });
    }
    if (tiles.length === 0) return null;
    return { kind: 'place', col, row, dir, tiles };
  }
  return null;
}

/** Canonical wire form (uppercase except blanks; exchange tiles sorted). */
function canonical(pm: ParsedMove): string {
  if (pm.kind === 'pass') return 'PASS';
  if (pm.kind === 'exchange') return `EXCH:${[...pm.tiles].sort().join('')}`;
  const word = pm.tiles.map((t) => (t.isBlank ? t.letter.toLowerCase() : t.letter)).join('');
  return `${COLS[pm.col]}${pm.row + 1}${pm.dir === 'down' ? 'v' : '>'}${word}`;
}

// --------------------------------------------------------------------------
// Deterministic bag
// --------------------------------------------------------------------------

/** The `index`-th value of the seed's PRNG stream (0-based). */
function randAt(seed: number, index: number): number {
  const g = mulberry32(seed);
  for (let i = 0; i < index; i++) g();
  return g();
}

function fullBag(variant: ScrabbleVariant): string[] {
  const out: string[] = [];
  for (const spec of tilesFor(variant)) {
    for (let i = 0; i < spec.count; i++) out.push(spec.letter);
  }
  return out;
}

// --------------------------------------------------------------------------
// Board geometry
// --------------------------------------------------------------------------

function inBoard(r: number, c: number): boolean {
  return r >= 0 && r < N && c >= 0 && c < N;
}

/** Neighbour cell one step along `dir` from `cell`, or null if off-board / wrapping. */
function step(cell: number, dir: Dir, delta: number): number | null {
  const r = Math.floor(cell / N);
  const c = cell % N;
  const nr = dir === 'down' ? r + delta : r;
  const nc = dir === 'across' ? c + delta : c;
  return inBoard(nr, nc) ? nr * N + nc : null;
}

function hasOccupiedNeighbor(board: (PlacedTile | null)[], cell: number): boolean {
  const r = Math.floor(cell / N);
  const c = cell % N;
  const nbs = [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ];
  return nbs.some(([nr, nc]) => inBoard(nr, nc) && board[nr * N + nc] !== null);
}

/** Full contiguous run of occupied cells through `cell` along `dir` (both ways). */
function extendWord(board: (PlacedTile | null)[], cell: number, dir: Dir): number[] {
  let start = cell;
  for (;;) {
    const prev = step(start, dir, -1);
    if (prev === null || board[prev] === null) break;
    start = prev;
  }
  const cells: number[] = [];
  let cur: number | null = start;
  while (cur !== null && board[cur] !== null) {
    cells.push(cur);
    cur = step(cur, dir, 1);
  }
  return cells;
}

// --------------------------------------------------------------------------
// Placement resolution (validation + scoring) — throws on an illegal move
// --------------------------------------------------------------------------

interface ResolvedPlace {
  newCells: number[];
  words: { word: string; score: number }[];
  total: number;
}

function multiset(tiles: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tiles) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/**
 * Validate a PLACE against a board + rack, and score it. Throws `Error(reason)`
 * on anything illegal — `reason` is a short English phrase for the correction.
 * Pure: used by both `validateMove` (from the view) and `applyMove` (from state).
 */
function resolvePlace(
  board: (PlacedTile | null)[],
  rack: string[],
  isFirstMove: boolean,
  lexicon: Lexicon,
  pm: PlaceMove,
  values: Map<string, number>,
): ResolvedPlace {
  const { col, row, dir, tiles } = pm;
  if (tiles.length < 2) throw new Error('a word must be at least 2 letters long');

  // Cells the word occupies.
  const cells: number[] = [];
  for (let k = 0; k < tiles.length; k++) {
    const r = dir === 'down' ? row + k : row;
    const c = dir === 'across' ? col + k : col;
    if (!inBoard(r, c)) throw new Error('the word does not fit on the board');
    cells.push(r * N + c);
  }

  // The notation must be the WHOLE word: no occupied cell immediately before/after.
  const before = step(cells[0], dir, -1);
  const after = step(cells[cells.length - 1], dir, 1);
  if ((before !== null && board[before]) || (after !== null && board[after])) {
    throw new Error('the notation must include the full word (extend it to the connected letters)');
  }

  // Split into new placements vs letters already on the board.
  const newCells: number[] = [];
  const prov = board.slice();
  for (let k = 0; k < tiles.length; k++) {
    const cell = cells[k];
    const t = tiles[k];
    const existing = board[cell];
    if (existing) {
      if (existing.letter !== t.letter) {
        throw new Error(`the tile at ${cellCoord(cell)} is ${existing.letter}, not ${t.letter}`);
      }
    } else {
      newCells.push(cell);
      prov[cell] = { letter: t.letter, isBlank: t.isBlank, points: t.isBlank ? 0 : values.get(t.letter) ?? 0 };
    }
  }
  if (newCells.length === 0) throw new Error('the move places no new tiles');

  // Connectivity.
  if (isFirstMove) {
    if (!cells.includes(CENTER_CELL)) throw new Error('the first word must cover the centre square H8');
  } else {
    const usesExisting = cells.some((c) => board[c] !== null);
    const touches = usesExisting || newCells.some((c) => hasOccupiedNeighbor(board, c));
    if (!touches) throw new Error('the word must connect to tiles already on the board');
  }

  // Rack has the tiles (blanks as '?').
  const need = multiset(newCells.map((c) => (prov[c]!.isBlank ? '?' : prov[c]!.letter)));
  const have = multiset(rack);
  for (const [tile, n] of need) {
    if ((have.get(tile) ?? 0) < n) {
      throw new Error(`your rack does not have the tiles to play this (need ${tile})`);
    }
  }

  const newSet = new Set(newCells);
  const horizontal = dir === 'across';

  // Main word.
  const mainCells = cells;
  const mainWord = mainCells.map((c) => prov[c]!.letter).join('');
  if (!lexicon.has(mainWord)) throw new Error(`"${mainWord}" is not a valid word`);

  const wordScore = (wcells: number[]): number => {
    let sum = 0;
    let mult = 1;
    for (const c of wcells) {
      const t = prov[c]!;
      if (newSet.has(c)) {
        const p = premiumAt(c);
        const letterMult = p === 'dl' ? 2 : p === 'tl' ? 3 : 1;
        sum += t.points * letterMult;
        if (p === 'dw' || p === 'center') mult *= 2;
        else if (p === 'tw') mult *= 3;
      } else {
        sum += t.points;
      }
    }
    return sum * mult;
  };

  const words: { word: string; score: number }[] = [{ word: mainWord, score: wordScore(mainCells) }];

  // Cross words: perpendicular through each new tile.
  for (const c of newCells) {
    const cross = extendWord(prov, c, horizontal ? 'down' : 'across');
    if (cross.length >= 2) {
      const cw = cross.map((x) => prov[x]!.letter).join('');
      if (!lexicon.has(cw)) throw new Error(`"${cw}" is not a valid word`);
      words.push({ word: cw, score: wordScore(cross) });
    }
  }

  let total = words.reduce((a, w) => a + w.score, 0);
  if (newCells.length === RACK_SIZE) total += BINGO_BONUS; // all 7 tiles → bingo

  return { newCells, words, total };
}

// --------------------------------------------------------------------------
// Status + rack values
// --------------------------------------------------------------------------

function rackSum(rack: string[], values: Map<string, number>): number {
  return rack.reduce((a, l) => a + (l === '?' ? 0 : values.get(l) ?? 0), 0);
}

function endReached(state: ScrabbleState): boolean {
  const bagEmpty = state.bag.length === 0;
  const someoneOut = state.racks.p1.length === 0 || state.racks.p2.length === 0;
  return (bagEmpty && someoneOut) || state.scorelessStreak >= 4;
}

/** Final scores AFTER the end-of-game rack adjustments (plan §5.1). */
export function finalScores(state: ScrabbleState): { p1: number; p2: number } {
  const values = letterValues(state.variant);
  let s1 = state.scores.p1;
  let s2 = state.scores.p2;
  const r1 = rackSum(state.racks.p1, values);
  const r2 = rackSum(state.racks.p2, values);
  const bagEmpty = state.bag.length === 0;
  const someoneOut = state.racks.p1.length === 0 || state.racks.p2.length === 0;
  if (bagEmpty && someoneOut) {
    if (state.racks.p1.length === 0) {
      s1 += r2;
      s2 -= r2;
    } else {
      s2 += r1;
      s1 -= r1;
    }
  } else {
    // stalled (4 scoreless): each loses their own rack.
    s1 -= r1;
    s2 -= r2;
  }
  return { p1: s1, p2: s2 };
}

function computeStatus(state: ScrabbleState): GameStatus {
  if (!endReached(state)) return 'playing';
  const { p1, p2 } = finalScores(state);
  if (p1 > p2) return 'p1_won';
  if (p2 > p1) return 'p2_won';
  return 'draw';
}

// --------------------------------------------------------------------------
// Rendering
// --------------------------------------------------------------------------

function asScrabbleView(view: PlayerView): ScrabbleView {
  if (view.game !== 'scrabble') throw new Error(`Expected scrabble view, got "${view.game}"`);
  return view;
}

/** ASCII board: letters where played, premium markers on empty squares. */
function renderBoard(board: (PlacedTile | null)[]): string {
  const header = '   ' + COLS.split('').join(' ');
  const rows = [header];
  for (let r = 0; r < N; r++) {
    const label = String(r + 1).padStart(2, ' ');
    const cells: string[] = [];
    for (let c = 0; c < N; c++) {
      const cell = r * N + c;
      const t = board[cell];
      cells.push(t ? (t.isBlank ? t.letter.toLowerCase() : t.letter) : premiumMarker(premiumAt(cell)));
    }
    rows.push(`${label} ${cells.join(' ')}`);
  }
  return rows.join('\n');
}

function renderRecent(history: ScrabbleAnnotatedEntry[]): string {
  if (history.length === 0) return 'none yet';
  return history
    .slice(-4)
    .map((h) => {
      const ws = h.words.map((w) => `${w.word} ${w.score}`).join(', ');
      return `${h.player}: ${h.notation}${ws ? ` (${ws})` : ''} = ${h.total}`;
    })
    .join('\n');
}

// --------------------------------------------------------------------------
// Engine
// --------------------------------------------------------------------------

export const scrabble: GameDefinition<ScrabbleState, string, ScrabbleView> = {
  id: 'scrabble',
  variants: SCRABBLE_VARIANTS,

  createInitialState(variant: Variant, config: SetupConfig): ScrabbleState {
    const v = asScrabbleVariant(variant.id);
    const seed = config.seed ?? 1;
    const bag = fullBag(v);

    // Fisher–Yates with the seed; count PRNG uses so EXCHANGE can continue the stream.
    const g = mulberry32(seed);
    let uses = 0;
    const rnd = (): number => {
      uses += 1;
      return g();
    };
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }

    const p1 = bag.splice(bag.length - RACK_SIZE, RACK_SIZE);
    const p2 = bag.splice(bag.length - RACK_SIZE, RACK_SIZE);

    return {
      variant: v,
      seed,
      board: Array<PlacedTile | null>(N * N).fill(null),
      bag,
      racks: { p1, p2 },
      scores: { p1: 0, p2: 0 },
      scorelessStreak: 0,
      history: [],
      toMove: 'p1',
      rngUses: uses,
    };
  },

  currentPlayer(state: ScrabbleState): PlayerSide {
    return state.toMove;
  },

  legalMoves(state: ScrabbleState, player: PlayerSide): string[] {
    // NOT exhaustive by design (plan §5.5): the always-legal moves only — PASS
    // and a sensible set of exchanges. Consumers validate concrete plays via
    // `validateMove`; the forfeit path uses `fallbackMove` ('PASS').
    if (computeStatus(state) !== 'playing' || state.toMove !== player) return [];
    const out = new Set<string>(['PASS']);
    if (state.bag.length >= RACK_SIZE) {
      const rack = state.racks[player];
      for (const t of new Set(rack)) out.add(`EXCH:${t}`);
      if (rack.length > 0) out.add(`EXCH:${[...rack].sort().join('')}`);
    }
    return [...out];
  },

  applyMove(state: ScrabbleState, player: PlayerSide, move: string): ScrabbleState {
    if (computeStatus(state) !== 'playing') throw new Error('Cannot move: game is already over');
    if (state.toMove !== player) throw new Error(`Cannot move: it is not ${player}'s turn`);
    const pm = parseNotation(move.normalize('NFC'));
    if (!pm) throw new Error(`Illegal move: cannot parse "${move}"`);
    const values = letterValues(state.variant);
    const opp = other(player);

    if (pm.kind === 'pass') {
      return {
        ...state,
        toMove: opp,
        scorelessStreak: state.scorelessStreak + 1,
        history: [...state.history, { player, notation: 'PASS', words: [], total: 0 }],
      };
    }

    if (pm.kind === 'exchange') {
      if (state.bag.length < RACK_SIZE) throw new Error('Illegal exchange: the bag has fewer than 7 tiles');
      const rack = [...state.racks[player]];
      const have = multiset(rack);
      for (const [t, n] of multiset(pm.tiles)) {
        if ((have.get(t) ?? 0) < n) throw new Error(`Illegal exchange: no ${t} on the rack`);
      }
      // Remove exchanged tiles from the rack.
      const returned = [...pm.tiles];
      for (const t of returned) rack.splice(rack.indexOf(t), 1);
      // Draw the same count from the END of the bag, then reinsert the returned
      // tiles at seeded positions (replayable: rngUses continues the stream).
      const k = returned.length;
      const drawn = state.bag.slice(state.bag.length - k);
      const working = state.bag.slice(0, state.bag.length - k);
      let uses = state.rngUses;
      for (const t of returned) {
        const pos = Math.floor(randAt(state.seed, uses) * (working.length + 1));
        working.splice(pos, 0, t);
        uses += 1;
      }
      return {
        ...state,
        bag: working,
        racks: { ...state.racks, [player]: [...rack, ...drawn] },
        toMove: opp,
        rngUses: uses,
        scorelessStreak: state.scorelessStreak + 1,
        history: [...state.history, { player, notation: canonical(pm), words: [], total: 0 }],
      };
    }

    // PLACE.
    const isFirst = state.board.every((c) => c === null);
    const lexicon = getLexicon(state.variant);
    const resolved = resolvePlace(state.board, state.racks[player], isFirst, lexicon, pm, values);

    // Lay the new tiles (re-derive cells from the move so blanks are recorded).
    const board = state.board.slice();
    const rack = [...state.racks[player]];
    const cells: number[] = [];
    for (let idx = 0; idx < pm.tiles.length; idx++) {
      const r = pm.dir === 'down' ? pm.row + idx : pm.row;
      const c = pm.dir === 'across' ? pm.col + idx : pm.col;
      cells.push(r * N + c);
    }
    for (let idx = 0; idx < pm.tiles.length; idx++) {
      const cell = cells[idx];
      if (board[cell]) continue; // pre-existing letter, unchanged
      const t = pm.tiles[idx];
      board[cell] = { letter: t.letter, isBlank: t.isBlank, points: t.isBlank ? 0 : values.get(t.letter) ?? 0 };
      // Consume from the rack (blank as '?').
      const key = t.isBlank ? '?' : t.letter;
      rack.splice(rack.indexOf(key), 1);
    }

    // Refill from the end of the bag.
    const refillCount = Math.min(RACK_SIZE - rack.length, state.bag.length);
    const drawn = state.bag.slice(state.bag.length - refillCount);
    const bag = state.bag.slice(0, state.bag.length - refillCount);

    const scored = resolved.total;
    return {
      ...state,
      board,
      bag,
      racks: { ...state.racks, [player]: [...rack, ...drawn] },
      scores: { ...state.scores, [player]: state.scores[player] + scored },
      toMove: opp,
      scorelessStreak: scored > 0 ? 0 : state.scorelessStreak + 1,
      history: [
        ...state.history,
        { player, notation: canonical(pm), words: resolved.words, total: scored },
      ],
    };
  },

  status(state: ScrabbleState): GameStatus {
    return computeStatus(state);
  },

  viewFor(state: ScrabbleState, player: PlayerSide): ScrabbleView {
    return {
      game: 'scrabble',
      variant: state.variant,
      side: player,
      status: computeStatus(state),
      moveNumber: state.history.length,
      moveHistory: state.history.map((h) => h.notation),
      language: state.variant,
      board: state.board.map((t) => (t ? { ...t } : null)),
      rack: [...state.racks[player]],
      scores: { ...state.scores },
      bagCount: state.bag.length,
      opponentRackCount: state.racks[other(player)].length,
      scorelessStreak: state.scorelessStreak,
      annotatedHistory: state.history.map((h) => ({
        player: h.player,
        notation: h.notation,
        words: h.words,
        total: h.total,
      })),
      premiumsLegend: true,
    };
  },

  renderPrompt(view: PlayerView, _legal: string[], opts?: PromptOptions): RenderedPrompt {
    const v = asScrabbleView(view);
    const lang = v.language === 'pl' ? 'POLISH' : 'ENGLISH';
    const you = v.side === 'p1' ? v.scores.p1 : v.scores.p2;
    const opp = v.side === 'p1' ? v.scores.p2 : v.scores.p1;
    const head = [
      `You are playing a Scrabble-style word game in ${lang}. You play as ${v.side}.`,
      `Board 15x15, columns A-O, rows 1-15. Premium squares: '2'/'3' = double/triple LETTER, 'D'/'T' = double/triple WORD, '*' = center (first word must cover H8).`,
      renderBoard(v.board),
      `Your rack: ${v.rack.join(', ')}   ('?' = blank)`,
      `Scores: you ${you}, opponent ${opp}. Tiles left in bag: ${v.bagCount}. Opponent holds ${v.opponentRackCount} tiles.`,
      `Recent moves:\n${renderRecent(v.annotatedHistory)}`,
      `Rules: your word must use only your rack tiles plus letters already on the board, connect to existing tiles (except the first move), and every word formed (including cross-words) must be a valid ${lang} dictionary word. Letter values and premiums score automatically. Exchanging is allowed only when the bag has at least 7 tiles.`,
    ];
    const formats = `{"move": "H8>WORD"}  (horizontal)  |  {"move": "H8vWORD"}  (vertical)  |  {"move": "EXCH:ABC"}  |  {"move": "PASS"}`;
    const tail = opts?.reasoning
      ? [
          `Think in AT MOST three short sentences: look for premium squares and check the cross-words you create.`,
          `Then, on the LAST line, output ONLY a JSON object, one of: ${formats}`,
          `Use a lowercase letter in WORD to play a blank as that letter.`,
        ]
      : [
          `Respond with ONLY a JSON object, one of:`,
          formats,
          `Use a lowercase letter in WORD to play a blank as that letter. No explanation, no markdown, no code fences.`,
        ];
    const user = v.moveHistory.length === 0 ? 'You move first. Make your move.' : 'Your move.';
    return { system: [...head, ...tail].join('\n'), user };
  },

  parseMove(raw: string, _legal: string[]): string | null {
    const text = raw.normalize('NFC');
    // (1) whole-string JSON.
    try {
      const obj: unknown = JSON.parse(text);
      if (obj !== null && typeof obj === 'object' && 'move' in obj) {
        const pm = parseNotation(String((obj as Record<string, unknown>).move));
        if (pm) return canonical(pm);
      }
    } catch {
      // not pure JSON
    }
    // (2) embedded `"move":"…"`.
    const embedded = text.match(/"move"\s*:\s*"([^"]*)"/);
    if (embedded) {
      const pm = parseNotation(embedded[1]);
      if (pm) return canonical(pm);
    }
    // (3) a bare notation token in prose.
    const token = text.match(/\b(?:PASS|EXCH:[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż?]+|[A-Oa-o](?:1[0-5]|[1-9])[>v][A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]+)\b/);
    if (token) {
      const pm = parseNotation(token[0]);
      if (pm) return canonical(pm);
    }
    return null;
  },

  validateMove(view: PlayerView, move: string): MoveValidation {
    const v = asScrabbleView(view);
    const pm = parseNotation(move.normalize('NFC'));
    if (!pm) return { ok: false, reason: 'that is not a valid move notation' };

    if (pm.kind === 'pass') return { ok: true };

    if (pm.kind === 'exchange') {
      if (v.bagCount < RACK_SIZE) {
        return { ok: false, reason: 'you can only exchange when the bag has at least 7 tiles' };
      }
      if (pm.tiles.length < 1) return { ok: false, reason: 'exchange at least one tile' };
      const have = multiset(v.rack);
      for (const [t, n] of multiset(pm.tiles)) {
        if ((have.get(t) ?? 0) < n) return { ok: false, reason: `you don't have the tile ${t} to exchange` };
      }
      return { ok: true };
    }

    const isFirst = v.board.every((c) => c === null);
    let lexicon: Lexicon;
    try {
      lexicon = getLexicon(v.language);
    } catch (e) {
      return { ok: false, reason: (e as Error).message };
    }
    try {
      resolvePlace(v.board, v.rack, isFirst, lexicon, pm, letterValues(v.language));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: (e as Error).message };
    }
  },

  renderCorrection(view: PlayerView, rejection?: MoveRejection): string {
    const v = asScrabbleView(view);
    const lang = v.language === 'pl' ? 'Polish' : 'English';
    const why = rejection ? ` ${rejection.reason}.` : '';
    return (
      `That move was rejected.${why} Play a word that connects to the board (the first move must cover H8), ` +
      `uses only tiles from your rack, and forms only valid ${lang} words (including any cross-words). ` +
      `Respond with ONLY a JSON object: {"move": "H8>WORD"} | {"move": "H8vWORD"} | {"move": "EXCH:AB"} | {"move": "PASS"}.`
    );
  },

  fallbackMove(): string {
    // A forfeit can never invent a legal word — pass instead of guessing (plan §5.5).
    return 'PASS';
  },

  serializeSetup(state: ScrabbleState): SetupRecord {
    return { game: 'scrabble', variant: state.variant, seed: state.seed };
  },
};
