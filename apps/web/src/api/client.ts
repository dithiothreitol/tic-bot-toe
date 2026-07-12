const BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new ApiError(res.status, `GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, detail.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface LeaderboardRow {
  subjectId: string;
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

export interface RatingChange {
  subjectId: string;
  before: number;
  after: number;
}
export interface SaveResultResponse {
  matchId: string;
  winner: 'p1' | 'p2' | 'draw';
  lab: boolean;
  ratingChanges: RatingChange[];
}
