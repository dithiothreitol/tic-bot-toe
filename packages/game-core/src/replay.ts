/**
 * Server-side replay validation (SPEC §15): re-run a match from its recorded
 * setup + moves through the SAME engine and reject anything illegal or with a
 * mismatched outcome. The server trusts nothing from the client.
 */
import { battleship } from './battleship';
import { sudoku } from './sudoku';
import { ticTacToe } from './tictactoe';
import type {
  GameDefinition,
  GameId,
  GameStatus,
  Move,
  PlayerSide,
  SetupConfig,
  SetupRecord,
} from './types';

export interface ReplayMove {
  player: PlayerSide;
  move: Move;
}

export interface ReplayResult {
  valid: boolean;
  reason?: string;
  status: GameStatus;
  winner: 'p1' | 'p2' | 'draw' | null;
  moveCount: number;
}

function resolveGame(id: GameId): GameDefinition<unknown, Move> {
  if (id === 'tictactoe') return ticTacToe as unknown as GameDefinition<unknown, Move>;
  if (id === 'battleship') return battleship as unknown as GameDefinition<unknown, Move>;
  if (id === 'sudoku') return sudoku as unknown as GameDefinition<unknown, Move>;
  throw new Error(`Unknown game: ${id as string}`);
}

function statusToWinner(status: GameStatus): 'p1' | 'p2' | 'draw' | null {
  switch (status) {
    case 'p1_won':
      return 'p1';
    case 'p2_won':
      return 'p2';
    case 'draw':
      return 'draw';
    default:
      return null;
  }
}

function configFromSetup(setup: SetupRecord | null | undefined): SetupConfig {
  if (!setup) return {};
  const seed = typeof setup.seed === 'number' ? setup.seed : undefined;
  const extra = setup.extraShotOnHit;
  return {
    seed,
    extraShotOnHit: typeof extra === 'boolean' ? extra : undefined,
    placements: setup.placements,
  };
}

export function replayMatch(
  game: GameId,
  variant: string,
  setup: SetupRecord | null | undefined,
  moves: ReplayMove[],
): ReplayResult {
  const def = resolveGame(game);
  const variantObj = def.variants.find((v) => v.id === variant) ?? { id: variant, label: variant };

  let state: unknown;
  try {
    state = def.createInitialState(variantObj, configFromSetup(setup));
  } catch (e) {
    return { valid: false, reason: `setup: ${(e as Error).message}`, status: 'playing', winner: null, moveCount: 0 };
  }

  for (let i = 0; i < moves.length; i++) {
    const entry = moves[i];
    if (def.status(state) !== 'playing') {
      return { valid: false, reason: `move ${i}: game already over`, status: def.status(state), winner: null, moveCount: i };
    }
    const side = def.currentPlayer(state);
    if (entry.player !== side) {
      return { valid: false, reason: `move ${i}: expected ${side}, got ${entry.player}`, status: def.status(state), winner: null, moveCount: i };
    }
    // Legality: games with a non-enumerable legal set validate the concrete
    // move against the view (plan §3); the rest fall back to the legal list.
    const legalHere = def.validateMove
      ? def.validateMove(def.viewFor(state, side), entry.move).ok
      : def.legalMoves(state, side).includes(entry.move);
    if (!legalHere) {
      return { valid: false, reason: `move ${i}: illegal move ${String(entry.move)}`, status: def.status(state), winner: null, moveCount: i };
    }
    try {
      state = def.applyMove(state, side, entry.move);
    } catch (e) {
      return { valid: false, reason: `move ${i}: ${(e as Error).message}`, status: def.status(state), winner: null, moveCount: i };
    }
  }

  const status = def.status(state);
  return { valid: true, status, winner: statusToWinner(status), moveCount: moves.length };
}

/** Deterministic stringify (sorted keys) so the hash is stable across key order. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** SHA-256 over the canonical (game, variant, setup, moves) — for dedup (SPEC §15). */
export async function movesHash(
  game: GameId,
  variant: string,
  setup: SetupRecord | null | undefined,
  moves: ReplayMove[],
): Promise<string> {
  const canonical = stableStringify({
    game,
    variant,
    setup: setup ?? null,
    moves: moves.map((m) => ({ player: m.player, move: m.move })),
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
