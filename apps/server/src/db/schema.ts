import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Pseudonymous player identity (SPEC §10/§16). One row per person; the client
 * holds a random bearer secret in localStorage, we store only its SHA-256
 * (`token_hash`). This is what makes every match by the same person accumulate
 * into a single ranking row (`ratings.subject_id = human:<players.id>`). No PII.
 */
export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(), // sha256 hex (64 chars)
    nickname: text('nickname'), // NULL = not shown in the human leaderboard
    flaggedAt: timestamp('flagged_at', { withTimezone: true }), // suspicious precision (T3)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('players_token_hash').on(t.tokenHash),
    uniqueIndex('players_nickname').on(t.nickname),
  ],
);

/** Match records (SPEC §13). `moves` holds move + telemetry; no prompt text (§16). */
export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mode: text('mode').notNull(),
    game: text('game').notNull(),
    variant: text('variant').notNull(),
    p1Id: text('p1_id').notNull(),
    p2Id: text('p2_id').notNull(),
    winner: text('winner'),
    moves: jsonb('moves').notNull(),
    setup: jsonb('setup'),
    commentary: jsonb('commentary'),
    priceSnapshot: jsonb('price_snapshot'),
    movesHash: text('moves_hash').notNull(),
    lab: boolean('lab').notNull().default(false),
    serverVerified: boolean('server_verified').notNull().default(false),
    forfeitMovesP1: integer('forfeit_moves_p1').notNull().default(0),
    forfeitMovesP2: integer('forfeit_moves_p2').notNull().default(0),
    durationMs: integer('duration_ms'),
    /** Human player behind this match, when identified (T1). Powers daily limits (T3). */
    playerId: uuid('player_id').references(() => players.id),
    clientIp: inet('client_ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('matches_dedup').on(t.movesHash),
    index('matches_lb').on(t.mode, t.game, t.variant, t.createdAt.desc()),
    index('matches_player_day').on(t.playerId, t.createdAt),
    check('matches_mode_chk', sql`${t.mode} IN ('model_vs_model','human_vs_model')`),
    check('matches_winner_chk', sql`${t.winner} IN ('p1','p2','draw')`),
  ],
);

/** Aggregated ratings + telemetry per subject × mode × game × variant (SPEC §13). */
export const ratings = pgTable(
  'ratings',
  {
    subjectId: text('subject_id').notNull(),
    mode: text('mode').notNull(),
    game: text('game').notNull(),
    variant: text('variant').notNull(),
    elo: real('elo').notNull().default(1000),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    games: integer('games').notNull().default(0),
    forfeitMoves: integer('forfeit_moves').notNull().default(0),
    totalMoves: integer('total_moves').notNull().default(0),
    latencyMsSum: bigint('latency_ms_sum', { mode: 'number' }).notNull().default(0),
    tokensSum: bigint('tokens_sum', { mode: 'number' }).notNull().default(0),
    costUsdSum: numeric('cost_usd_sum', { precision: 12, scale: 6 }).notNull().default('0'),
    optimalMoves: integer('optimal_moves').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.subjectId, t.mode, t.game, t.variant] })],
);

export const eloHistory = pgTable(
  'elo_history',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    subjectId: text('subject_id').notNull(),
    mode: text('mode').notNull(),
    game: text('game').notNull(),
    variant: text('variant').notNull(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id),
    eloAfter: real('elo_after').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('elo_hist_idx').on(t.subjectId, t.mode, t.game, t.variant, t.createdAt),
  ],
);

/** Viewer predictions (SPEC §12.5). */
export const predictions = pgTable(
  'predictions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    playerToken: text('player_token').notNull(),
    nickname: text('nickname'),
    matchId: uuid('match_id').references(() => matches.id),
    predicted: text('predicted').notNull(),
    correct: boolean('correct'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('predictions_pred_chk', sql`${t.predicted} IN ('p1','p2','draw')`)],
);

/** Daily challenge results (SPEC §12.6). */
export const dailyResults = pgTable(
  'daily_results',
  {
    playerToken: text('player_token').notNull(),
    day: date('day').notNull(),
    completed: boolean('completed').notNull(),
    matchId: uuid('match_id').references(() => matches.id),
  },
  (t) => [primaryKey({ columns: [t.playerToken, t.day] })],
);

/** One-time session token ids, burned on result submission (SPEC §15). */
export const usedJti = pgTable('used_jti', {
  jti: uuid('jti').primaryKey(),
  usedAt: timestamp('used_at', { withTimezone: true }).notNull().defaultNow(),
});
