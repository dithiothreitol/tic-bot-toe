/**
 * Dev-only: fabricate a completed daily challenge in the LOCAL database so the
 * certificate page, its PDF and its social card can be looked at in a browser.
 *
 * Never point this at production — it writes a match nobody played.
 *
 *   node --env-file=../../.env --import tsx scripts/seed-certificate.ts [--clean]
 */
import { dailyChallenge, dailySubjectId, toDayString } from '@arena/game-core';
import { eq, sql } from 'drizzle-orm';

import { hashPlayerToken } from '../src/auth/player';
import { createDb } from '../src/db/client';
import { dailyResults, matches, players } from '../src/db/schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
if (/ticbottoe\.lol|167\.233\./.test(url)) throw new Error('refusing to seed a remote database');

const handle = createDb(url);
const TOKEN = 'devSeedToken0123456789abcdefghijklmn';
const TOKEN_HASH = hashPlayerToken(TOKEN);
const clean = process.argv.includes('--clean');

if (clean) {
  await handle.db.delete(dailyResults).where(eq(dailyResults.playerToken, TOKEN_HASH));
  await handle.db.delete(matches).where(sql`${matches.movesHash} LIKE 'dev-cert-%'`);
  await handle.db.delete(players).where(eq(players.tokenHash, TOKEN_HASH));
  console.log('cleaned');
} else {
  await handle.db
    .insert(players)
    .values({ tokenHash: TOKEN_HASH, nickname: 'dithiothreitol' })
    .onConflictDoNothing({ target: players.tokenHash });

  const days = [-2, -1, 0].map((d) => toDayString(new Date(Date.now() + d * 86_400_000)));
  for (const day of days) {
    const c = dailyChallenge(day);
    const inserted = await handle.db
      .insert(matches)
      .values({
        mode: 'human_vs_model',
        game: c.game,
        variant: c.variant,
        p1Id: 'human',
        p2Id: dailySubjectId(c.opponent),
        winner: 'p1',
        moves: Array.from({ length: 9 }, (_, i) => ({
          player: i % 2 === 0 ? 'p1' : 'p2',
          move: i,
        })),
        movesHash: `dev-cert-${day}`,
      })
      .onConflictDoNothing({ target: matches.movesHash })
      .returning({ id: matches.id });
    const matchId =
      inserted[0]?.id ??
      (
        await handle.db
          .select({ id: matches.id })
          .from(matches)
          .where(eq(matches.movesHash, `dev-cert-${day}`))
      )[0]!.id;
    await handle.db
      .insert(dailyResults)
      .values({ playerToken: TOKEN_HASH, day, completed: true, matchId })
      .onConflictDoUpdate({
        target: [dailyResults.playerToken, dailyResults.day],
        set: { completed: true, matchId },
      });
    console.log(`${day}  ${c.game}/${c.variant}  → /certyfikat/${matchId}`);
  }
}

await handle.close();
