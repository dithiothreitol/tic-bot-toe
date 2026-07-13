/**
 * Battleship engine (SPEC §7).
 *
 * Hidden information: `viewFor` returns the player's own board plus a tracking
 * board of what they've learned about the enemy — NEVER the enemy's ship
 * layout. Enforced by a snapshot test in the suite.
 *
 * Coordinates: columns A.. (A=0), rows 1.. (1=0); cell = row*N + col (row-major).
 */

import type {
  BattleshipOwnCell,
  BattleshipTrackingCell,
  BattleshipView,
  GameDefinition,
  GameStatus,
  PlayerSide,
  PlayerView,
  PromptOptions,
  RenderedPrompt,
  SetupConfig,
  SetupRecord,
  Variant,
} from './types';

const COLS = 'ABCDEFGHIJ';

export interface BattleshipVariantConfig {
  id: string;
  label: string;
  size: number;
  fleet: number[];
}

export const BATTLESHIP_VARIANTS_CONFIG: Record<string, BattleshipVariantConfig> = {
  small: { id: 'small', label: 'Małe 6×6', size: 6, fleet: [3, 2, 2, 1, 1] },
  medium: { id: 'medium', label: 'Średnie 8×8', size: 8, fleet: [4, 3, 3, 2, 2, 1] },
  classic: { id: 'classic', label: 'Klasyczne 10×10', size: 10, fleet: [5, 4, 3, 3, 2] },
};

export const BATTLESHIP_VARIANTS: Variant[] = Object.values(
  BATTLESHIP_VARIANTS_CONFIG,
).map((v) => ({ id: v.id, label: v.label }));

export function getBattleshipVariant(id: string): BattleshipVariantConfig {
  const vc = BATTLESHIP_VARIANTS_CONFIG[id];
  if (!vc) throw new Error(`Unknown battleship variant: ${id}`);
  return vc;
}

interface Ship {
  cells: number[];
  length: number;
  hits: number;
}

interface FleetState {
  ships: Ship[];
  /** Cells on THIS board fired upon by the opponent. */
  shots: number[];
}

interface MoveRecord {
  by: PlayerSide;
  cell: number;
  result: 'miss' | 'hit' | 'sunk';
}

export interface BattleshipState {
  variant: string;
  size: number;
  extraShotOnHit: boolean;
  seed: number;
  turn: PlayerSide;
  fleets: Record<PlayerSide, FleetState>;
  moves: MoveRecord[];
}

// --------------------------------------------------------------------------
// Coordinates + RNG + placement
// --------------------------------------------------------------------------

function other(player: PlayerSide): PlayerSide {
  return player === 'p1' ? 'p2' : 'p1';
}

export function cellToCoord(cell: number, size: number): string {
  const row = Math.floor(cell / size);
  const col = cell % size;
  return `${COLS[col]}${row + 1}`;
}

export function coordToCell(coord: string, size: number): number | null {
  const m = /^([A-J])\s*(\d{1,2})$/i.exec(coord.trim());
  if (!m) return null;
  const col = COLS.indexOf(m[1].toUpperCase());
  const row = Number(m[2]) - 1;
  if (col < 0 || col >= size || row < 0 || row >= size) return null;
  return row * size + col;
}

/** Deterministic PRNG (mulberry32) — reproducible ship placement per seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function neighbors8(cell: number, size: number): number[] {
  const row = Math.floor(cell / size);
  const col = cell % size;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < size && c >= 0 && c < size) out.push(r * size + c);
    }
  }
  return out;
}

function lineCells(
  size: number,
  length: number,
  horizontal: boolean,
  rng: () => number,
): number[] | null {
  if (length > size) return null;
  if (horizontal) {
    const row = Math.floor(rng() * size);
    const col = Math.floor(rng() * (size - length + 1));
    return Array.from({ length }, (_, k) => row * size + col + k);
  }
  const col = Math.floor(rng() * size);
  const row = Math.floor(rng() * (size - length + 1));
  return Array.from({ length }, (_, k) => (row + k) * size + col);
}

/** Random legal fleet: straight ships, no overlap, no touching (incl. diagonal). */
export function generateFleet(
  size: number,
  fleet: number[],
  rng: () => number,
): number[][] {
  const order = [...fleet].sort((a, b) => b - a); // longest first
  for (let attempt = 0; attempt < 500; attempt++) {
    const ships: number[][] = [];
    const blocked = new Set<number>();
    let ok = true;
    for (const length of order) {
      let placed: number[] | null = null;
      for (let tries = 0; tries < 200; tries++) {
        const cells = lineCells(size, length, rng() < 0.5, rng);
        if (!cells) continue;
        if (cells.some((c) => blocked.has(c))) continue;
        placed = cells;
        break;
      }
      if (!placed) {
        ok = false;
        break;
      }
      ships.push(placed);
      for (const c of placed) {
        blocked.add(c);
        for (const nb of neighbors8(c, size)) blocked.add(nb);
      }
    }
    if (ok) return ships;
  }
  throw new Error(`Failed to place fleet on ${size}x${size}`);
}

function isStraightLine(cells: number[], size: number): boolean {
  if (cells.length === 0) return false;
  if (cells.length === 1) return true;
  const sorted = [...cells].sort((a, b) => a - b);
  const rows = sorted.map((c) => Math.floor(c / size));
  const cols = sorted.map((c) => c % size);
  const sameRow = rows.every((r) => r === rows[0]);
  const sameCol = cols.every((c) => c === cols[0]);
  if (sameRow) {
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) return false;
    }
    return true;
  }
  if (sameCol) {
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + size) return false;
    }
    return true;
  }
  return false;
}

/** Validate a fleet placement: right composition, straight, in-bounds, no overlap, no touch. */
export function validateFleet(
  size: number,
  fleet: number[],
  ships: number[][],
): boolean {
  const want = [...fleet].sort((a, b) => a - b);
  const got = ships.map((s) => s.length).sort((a, b) => a - b);
  if (want.length !== got.length || want.some((v, i) => v !== got[i])) return false;

  const occupied = new Set<number>();
  const blocked = new Set<number>();
  for (const cells of ships) {
    if (cells.some((c) => c < 0 || c >= size * size)) return false;
    if (!isStraightLine(cells, size)) return false;
    if (cells.some((c) => blocked.has(c) || occupied.has(c))) return false;
    for (const c of cells) occupied.add(c);
    for (const c of cells) {
      blocked.add(c);
      for (const nb of neighbors8(c, size)) blocked.add(nb);
    }
  }
  return true;
}

/** Cells of a ship of `length` starting at `startCell`, or null if off-board. */
export function shipCellsAt(
  startCell: number,
  length: number,
  horizontal: boolean,
  size: number,
): number[] | null {
  const row = Math.floor(startCell / size);
  const col = startCell % size;
  const cells: number[] = [];
  for (let k = 0; k < length; k++) {
    const r = horizontal ? row : row + k;
    const c = horizontal ? col + k : col;
    if (r < 0 || r >= size || c < 0 || c >= size) return null;
    cells.push(r * size + c);
  }
  return cells;
}

/** Whether `candidate` can join `existing` ships (in bounds, no overlap, no touch). */
export function canPlaceShip(
  size: number,
  existing: number[][],
  candidate: number[],
): boolean {
  if (candidate.some((c) => c < 0 || c >= size * size)) return false;
  const blocked = new Set<number>();
  for (const ship of existing) {
    for (const c of ship) {
      blocked.add(c);
      for (const nb of neighbors8(c, size)) blocked.add(nb);
    }
  }
  return candidate.every((c) => !blocked.has(c));
}

// --------------------------------------------------------------------------
// Engine
// --------------------------------------------------------------------------

function computeStatus(state: BattleshipState): GameStatus {
  const fleetSunk = (f: FleetState): boolean => f.ships.every((s) => s.hits >= s.length);
  if (fleetSunk(state.fleets.p2)) return 'p1_won';
  if (fleetSunk(state.fleets.p1)) return 'p2_won';
  return 'playing';
}

function readPlacements(
  config: SetupConfig,
): Partial<Record<PlayerSide, number[][]>> | undefined {
  const p = (config as { placements?: unknown }).placements;
  return p && typeof p === 'object'
    ? (p as Partial<Record<PlayerSide, number[][]>>)
    : undefined;
}

function asBattleshipView(view: PlayerView): BattleshipView {
  if (view.game !== 'battleship') {
    throw new Error(`Expected battleship view, got "${view.game}"`);
  }
  return view;
}

function renderTrackingBoard(tracking: BattleshipTrackingCell[], size: number): string {
  const sym = (t: BattleshipTrackingCell): string =>
    t === 'unknown' ? '?' : t === 'miss' ? 'M' : t === 'hit' ? 'H' : 'S';
  const header = '   ' + COLS.slice(0, size).split('').join(' ');
  const rows = [header];
  for (let r = 0; r < size; r++) {
    const label = String(r + 1).padStart(2, ' ');
    const cells: string[] = [];
    for (let c = 0; c < size; c++) cells.push(sym(tracking[r * size + c]));
    rows.push(`${label} ${cells.join(' ')}`);
  }
  return rows.join('\n');
}

function extractShot(raw: string): string | null {
  try {
    const obj: unknown = JSON.parse(raw);
    if (obj !== null && typeof obj === 'object' && 'shot' in obj) {
      const s = String((obj as Record<string, unknown>).shot)
        .toUpperCase()
        .replace(/\s/g, '');
      if (/^[A-J](?:10|[1-9])$/.test(s)) return s;
    }
  } catch {
    // not pure JSON
  }
  const embedded = raw.match(/"shot"\s*:\s*"?([A-J](?:10|[1-9]))"?/i);
  if (embedded) return embedded[1].toUpperCase();
  const lone = raw.toUpperCase().match(/\b([A-J](?:10|[1-9]))\b/);
  if (lone) return lone[1];
  return null;
}

export const battleship: GameDefinition<BattleshipState, string, BattleshipView> = {
  id: 'battleship',
  variants: BATTLESHIP_VARIANTS,

  createInitialState(variant: Variant, config: SetupConfig): BattleshipState {
    const vc = getBattleshipVariant(variant.id);
    const size = vc.size;
    const seed = config.seed ?? 1;
    const extraShotOnHit = config.extraShotOnHit ?? true;
    const rng = mulberry32(seed);
    const placements = readPlacements(config);

    const fleetFor = (side: PlayerSide): Ship[] => {
      const provided = placements?.[side];
      const cells = provided ?? generateFleet(size, vc.fleet, rng);
      if (provided && !validateFleet(size, vc.fleet, provided)) {
        throw new Error(`Illegal ${side} ship placement`);
      }
      return cells.map((c) => ({ cells: [...c], length: c.length, hits: 0 }));
    };

    return {
      variant: variant.id,
      size,
      extraShotOnHit,
      seed,
      turn: 'p1',
      fleets: {
        p1: { ships: fleetFor('p1'), shots: [] },
        p2: { ships: fleetFor('p2'), shots: [] },
      },
      moves: [],
    };
  },

  currentPlayer(state: BattleshipState): PlayerSide {
    return state.turn;
  },

  legalMoves(state: BattleshipState, player: PlayerSide): string[] {
    if (computeStatus(state) !== 'playing' || state.turn !== player) return [];
    const size = state.size;
    const shot = new Set(state.fleets[other(player)].shots);
    const out: string[] = [];
    for (let cell = 0; cell < size * size; cell++) {
      if (!shot.has(cell)) out.push(cellToCoord(cell, size));
    }
    return out;
  },

  applyMove(state: BattleshipState, player: PlayerSide, move: string): BattleshipState {
    if (computeStatus(state) !== 'playing') {
      throw new Error('Cannot move: game is already over');
    }
    if (state.turn !== player) {
      throw new Error(`Cannot move: it is not ${player}'s turn`);
    }
    const size = state.size;
    const cell = coordToCell(move, size);
    if (cell === null) throw new Error(`Illegal shot: "${move}"`);

    const opp = other(player);
    const oppFleet = state.fleets[opp];
    if (oppFleet.shots.includes(cell)) {
      throw new Error(`Illegal shot: ${move} already fired`);
    }

    const newShips = oppFleet.ships.map((s) => ({ ...s, cells: [...s.cells] }));
    const hitIndex = newShips.findIndex((s) => s.cells.includes(cell));
    let result: MoveRecord['result'];
    if (hitIndex >= 0) {
      const ship = newShips[hitIndex];
      ship.hits += 1;
      result = ship.hits >= ship.length ? 'sunk' : 'hit';
    } else {
      result = 'miss';
    }

    const isHit = result !== 'miss';
    const newState: BattleshipState = {
      ...state,
      turn: isHit && state.extraShotOnHit ? player : opp,
      fleets: {
        ...state.fleets,
        [opp]: { ships: newShips, shots: [...oppFleet.shots, cell] },
      },
      moves: [...state.moves, { by: player, cell, result }],
    };
    return newState;
  },

  status(state: BattleshipState): GameStatus {
    return computeStatus(state);
  },

  viewFor(state: BattleshipState, player: PlayerSide): BattleshipView {
    const size = state.size;
    const own = state.fleets[player];
    const opp = state.fleets[other(player)];

    const ownShipCells = new Set<number>();
    for (const s of own.ships) for (const c of s.cells) ownShipCells.add(c);
    const ownShots = new Set(own.shots);
    const ownBoard: BattleshipOwnCell[] = [];
    for (let cell = 0; cell < size * size; cell++) {
      const isShip = ownShipCells.has(cell);
      const isShot = ownShots.has(cell);
      ownBoard.push(
        isShip && isShot ? 'ship-hit' : isShip ? 'ship' : isShot ? 'miss' : 'water',
      );
    }

    // Tracking board: ONLY fired cells reveal anything — un-fired stay 'unknown',
    // so the enemy ship layout never appears in the view.
    const oppShots = new Set(opp.shots);
    const oppShipCells = new Set<number>();
    const sunkCells = new Set<number>();
    for (const s of opp.ships) {
      for (const c of s.cells) oppShipCells.add(c);
      if (s.hits >= s.length) for (const c of s.cells) sunkCells.add(c);
    }
    const trackingBoard: BattleshipTrackingCell[] = [];
    const legalTargets: string[] = [];
    for (let cell = 0; cell < size * size; cell++) {
      if (!oppShots.has(cell)) {
        trackingBoard.push('unknown');
        legalTargets.push(cellToCoord(cell, size));
      } else if (sunkCells.has(cell)) {
        trackingBoard.push('sunk');
      } else if (oppShipCells.has(cell)) {
        trackingBoard.push('hit');
      } else {
        trackingBoard.push('miss');
      }
    }

    return {
      game: 'battleship',
      variant: state.variant,
      side: player,
      status: computeStatus(state),
      moveNumber: state.moves.length,
      moveHistory: state.moves.map((m) => cellToCoord(m.cell, size)),
      size,
      extraShotOnHit: state.extraShotOnHit,
      ownBoard,
      trackingBoard,
      enemyShipsRemaining: opp.ships
        .filter((s) => s.hits < s.length)
        .map((s) => s.length)
        .sort((a, b) => b - a),
      legalTargets,
    };
  },

  renderPrompt(view: PlayerView, legal: string[], opts?: PromptOptions): RenderedPrompt {
    const v = asBattleshipView(view);
    const maxCol = COLS[v.size - 1];
    const head = [
      `You are playing Battleship on a ${v.size}x${v.size} grid. Columns A-${maxCol}, rows 1-${v.size}.`,
      `Rule: extra shot on hit: ${v.extraShotOnHit ? 'yes' : 'no'}. Ships cannot touch each other.`,
      `Your tracking board ('?' unknown, 'M' miss, 'H' hit, 'S' sunk):`,
      renderTrackingBoard(v.trackingBoard, v.size),
      `Enemy ships remaining (lengths): ${v.enemyShipsRemaining.join(', ')}`,
      `Cells not yet fired at: ${legal.join(', ')}`,
    ];
    // Reasoning mode: permit a short thought and point at the one idea that
    // matters — chase adjacent cells of an unfinished hit ('H'), otherwise
    // hunt. Answer format unchanged (`extractShot` still reads the JSON).
    const tail = opts?.reasoning
      ? [
          `Think in AT MOST two short sentences: if any 'H' cell has an un-fired neighbour, TARGET that neighbour to finish the ship; otherwise HUNT a spread-out unknown cell.`,
          `Then, on the LAST line, output ONLY the shot as a JSON object: {"shot": "<cell>"} e.g. {"shot": "C5"}`,
        ]
      : [
          `Respond with ONLY a JSON object: {"shot": "<cell>"} e.g. {"shot": "C5"}`,
          `No explanation, no markdown, no code fences.`,
        ];
    const user =
      v.moveHistory.length === 0 ? 'Take your first shot.' : 'Your shot.';
    return { system: [...head, ...tail].join('\n'), user };
  },

  parseMove(raw: string, legal: string[]): string | null {
    const candidate = extractShot(raw);
    if (candidate === null) return null;
    const legalSet = new Set(legal.map((c) => c.toUpperCase()));
    return legalSet.has(candidate) ? candidate : null;
  },

  serializeSetup(state: BattleshipState): SetupRecord {
    return {
      game: 'battleship',
      variant: state.variant,
      seed: state.seed,
      extraShotOnHit: state.extraShotOnHit,
      placements: {
        p1: state.fleets.p1.ships.map((s) => [...s.cells]),
        p2: state.fleets.p2.ships.map((s) => [...s.cells]),
      },
    };
  },
};
