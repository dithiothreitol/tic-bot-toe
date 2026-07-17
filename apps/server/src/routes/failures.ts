import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';

import type { Database } from '../db/client';
import { failureGallery } from '../db/schema';

/**
 * GET /api/failures?game=&subjectId=&limit= — the „muzeum wpadek" feed (Module
 * B, plan §4.3). Public read, no JWT — same posture as the leaderboard. Reads the
 * denormalized `failure_gallery` (populated in Etap 2), newest first. Only MODEL
 * failures are ever stored there, and every string was capped at capture time,
 * so the feed carries nothing a human wrote and nothing unbounded.
 */
export interface FailureFeedRow {
  subjectId: string;
  game: string;
  variant: string;
  kind: string;
  attempted: string | null;
  reason: string | null;
  excerpt: string | null;
  matchId: string;
  createdAt: string;
}

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

export function failuresRoute(deps: { db: Database }): Hono {
  const app = new Hono();
  app.get('/', async (c) => {
    const game = c.req.query('game');
    const subjectId = c.req.query('subjectId');
    const rawLimit = Number(c.req.query('limit'));
    const limit = Math.min(
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : DEFAULT_LIMIT,
      MAX_LIMIT,
    );

    const rows = await deps.db
      .select({
        subjectId: failureGallery.subjectId,
        game: failureGallery.game,
        variant: failureGallery.variant,
        kind: failureGallery.kind,
        attempted: failureGallery.attempted,
        reason: failureGallery.reason,
        excerpt: failureGallery.excerpt,
        matchId: failureGallery.matchId,
        createdAt: failureGallery.createdAt,
      })
      .from(failureGallery)
      .where(
        and(
          game ? eq(failureGallery.game, game) : undefined,
          subjectId ? eq(failureGallery.subjectId, subjectId) : undefined,
        ),
      )
      .orderBy(desc(failureGallery.id))
      .limit(limit);

    const data: FailureFeedRow[] = rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    }));
    return c.json(data);
  });
  return app;
}
