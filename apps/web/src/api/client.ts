import type { GameId, Move, MoveTelemetry, PlayerSide, SetupRecord } from '@arena/game-core';

const BASE = import.meta.env?.VITE_API_BASE ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** `playerToken` identifies the person behind a match/profile call (SPEC §10). */
export interface ApiAuth {
  token?: string;
  playerToken?: string;
}

function authHeaders(auth: ApiAuth = {}): Record<string, string> {
  return {
    ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}),
    ...(auth.playerToken ? { 'x-player-token': auth.playerToken } : {}),
  };
}

/** Optional per-call knobs — `signal` lets a caller cancel/timeout the request. */
export interface RequestOpts {
  signal?: AbortSignal;
}

export async function apiGet<T>(
  path: string,
  auth: ApiAuth = {},
  opts: RequestOpts = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: authHeaders(auth),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  if (!res.ok) throw new ApiError(res.status, `GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  auth: ApiAuth = {},
  opts: RequestOpts = {},
): Promise<T> {
  return send<T>('POST', path, auth, body, opts);
}

export async function apiDelete<T>(path: string, auth: ApiAuth = {}): Promise<T> {
  return send<T>('DELETE', path, auth);
}

async function send<T>(
  method: 'POST' | 'DELETE',
  path: string,
  auth: ApiAuth,
  body?: unknown,
  opts: RequestOpts = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...authHeaders(auth) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, detail.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Pseudonymous player profile (SPEC §10). */
export interface PlayerProfile {
  id: string;
  nickname: string | null;
  flagged: boolean;
}

export interface LeaderboardRow {
  /** Real ranking key (`openrouter:x`, `human:<uuid>`) — use for API lookups. */
  subjectId: string;
  /** Display name when it differs from the key (human board shows a nickname). */
  label?: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  forfeitRate: number;
  avgLatencyMs: number | null;
  avgTokensPerMove: number | null;
  avgCostPerGame: number | null;
  optimalRate: number | null;
}

/** One row of the discipline ranking (Module B, plan §4.3). */
export interface HallucinationRow {
  subjectId: string;
  games: number;
  totalMoves: number;
  forfeitMoves: number;
  forfeitRate: number;
}

/** One Elo checkpoint (SPEC §9.3.4). */
export interface EloHistoryPoint {
  eloAfter: number;
  at: string;
}

/** Head-to-head tally between two subjects, A's perspective (SPEC §9.3.5). */
export interface HeadToHead {
  a: string;
  b: string;
  games: number;
  aWins: number;
  bWins: number;
  draws: number;
}

/** One move as stored in `matches.moves` (SPEC §11 replay reads this directly). */
export interface ReplayMoveRecord {
  player: PlayerSide;
  move: Move;
  telemetry: MoveTelemetry;
}

/** Full match row from GET /api/replay/:id (public, no JWT). */
export interface ReplayMatch {
  id: string;
  mode: 'model_vs_model' | 'human_vs_model';
  game: GameId;
  variant: string;
  p1Id: string;
  p2Id: string;
  winner: PlayerSide | 'draw' | null;
  moves: ReplayMoveRecord[];
  setup: SetupRecord | null;
  commentary: unknown;
  lab: boolean;
  serverVerified: boolean;
  createdAt: string;
}

export interface RatingChange {
  subjectId: string;
  before: number;
  after: number;
}
export interface SaveResultResponse {
  matchId: string;
  winner: 'p1' | 'p2' | 'draw';
  lab: boolean;
  /** False when the match was saved (replayable) but excluded from Elo. */
  ranked: boolean;
  /** `no_real_moves`: a side forfeited every move — nobody actually played. */
  unrankedReason?: 'lab' | 'no_real_moves';
  ratingChanges: RatingChange[];
}
