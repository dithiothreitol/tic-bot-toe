import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { dailyChallenge, dailySubjectId, toDayString } from '@arena/game-core';
import { sql } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from './app';
import { hashPlayerToken } from './auth/player';
import { loadConfig } from './config';
import { type DbHandle, createDb } from './db/client';
import { dailyResults, matches, players } from './db/schema';

/**
 * Certificates end-to-end against a real Postgres.
 *
 * These exist to prove the one property that matters: everything the document
 * says is READ FROM THE DATABASE. The request carries a match id and nothing
 * else, so there is no input that could make it assert something untrue.
 */

let container: StartedPostgreSqlContainer;
let handle: DbHandle;

const PLAYER_TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc';
const TOKEN_HASH = hashPlayerToken(PLAYER_TOKEN);
const JWT_SECRET = 'test-secret';

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  handle = createDb(container.getConnectionUri());
  await handle.migrate('./drizzle');
}, 120_000);

afterAll(async () => {
  await handle?.close();
  await container?.stop();
});

beforeEach(async () => {
  await handle.db.execute(
    sql`TRUNCATE matches, ratings, elo_history, used_jti, predictions, daily_results, players RESTART IDENTITY CASCADE`,
  );
});

const app = () => buildApp({ config: loadConfig({ JWT_SECRET }), db: handle.db });
const today = () => toDayString(new Date());

async function insertWinningMatch(hash = 'a91f4c7d2b03deadbeef'): Promise<string> {
  const c = dailyChallenge(today());
  const rows = await handle.db
    .insert(matches)
    .values({
      mode: 'human_vs_model',
      game: c.game,
      variant: c.variant,
      p1Id: 'human',
      p2Id: dailySubjectId(c.opponent),
      winner: 'p1',
      moves: [{ player: 'p1', move: 0 }, { player: 'p2', move: 4 }],
      movesHash: hash,
    })
    .returning({ id: matches.id });
  return rows[0]!.id;
}

/** A completed day, optionally with a nickname to sign the document with. */
async function claimDay(nickname: string | null, day = today()): Promise<string> {
  const matchId = await insertWinningMatch(`hash-${day}`);
  await handle.db.insert(players).values({ tokenHash: TOKEN_HASH, nickname });
  await handle.db
    .insert(dailyResults)
    .values({ playerToken: TOKEN_HASH, day, completed: true, matchId });
  return matchId;
}

describe('GET /api/certificate/:id.pdf', () => {
  it('serves a downloadable A5 landscape PDF for a won challenge', async () => {
    const matchId = await claimDay('dithiothreitol');
    const res = await app().request(`/api/certificate/${matchId}.pdf`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    // The whole point of the feature: a file on the player's disk.
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="tic-bot-toe-/);
    expect(res.headers.get('cache-control')).toContain('immutable');

    const doc = await PDFDocument.load(await res.arrayBuffer());
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(420);
    // The nickname comes from the players table, not from the request.
    expect(doc.getTitle()).toContain('dithiothreitol');
  });

  it('follows the language of the link, like the OG card does', async () => {
    const matchId = await claimDay('nick');
    const [pl, en] = await Promise.all([
      app().request(`/api/certificate/${matchId}.pdf?lang=pl`),
      app().request(`/api/certificate/${matchId}.pdf?lang=en`),
    ]);
    const [plDoc, enDoc] = await Promise.all([
      PDFDocument.load(await pl.arrayBuffer()),
      PDFDocument.load(await en.arrayBuffer()),
    ]);
    expect(plDoc.getTitle()).toMatch(/Certyfikat/);
    expect(enDoc.getTitle()).toMatch(/Certificate/);
    expect(pl.headers.get('content-disposition')).toContain('certyfikat');
    expect(en.headers.get('content-disposition')).toContain('certificate');
  });

  it('issues a certificate to a player with no nickname', async () => {
    const matchId = await claimDay(null);
    const res = await app().request(`/api/certificate/${matchId}.pdf`);
    expect(res.status).toBe(200);
    const doc = await PDFDocument.load(await res.arrayBuffer());
    expect(doc.getTitle()).toContain('Anonimowy');
  });

  it('404s for a match that did not complete a challenge', async () => {
    const matchId = await insertWinningMatch(); // won, but never claimed
    const res = await app().request(`/api/certificate/${matchId}.pdf`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no_certificate' });
  });

  it('404s for an unknown id instead of failing', async () => {
    const res = await app().request(
      '/api/certificate/00000000-0000-4000-8000-000000000000.pdf',
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/certificate/:id.png', () => {
  it('serves the certificate as a downloadable image', async () => {
    const matchId = await claimDay('nick');
    const res = await app().request(`/api/certificate/${matchId}.png`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename=".*\.png"$/);

    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    // A5 landscape at 3×, straight out of the IHDR chunk.
    expect(buf.readUInt32BE(16)).toBe(Math.round(595.28 * 3));
    expect(buf.readUInt32BE(20)).toBe(Math.round(419.53 * 3));
  });

  it('is the DOCUMENT, not the social card — different shape entirely', async () => {
    const matchId = await claimDay('nick');
    const [png, jpg] = await Promise.all([
      app().request(`/api/certificate/${matchId}.png`),
      app().request(`/api/certificate/${matchId}.jpg`),
    ]);
    const pngBuf = Buffer.from(await png.arrayBuffer());
    const jpgBuf = Buffer.from(await jpg.arrayBuffer());
    const sof = jpgBuf.indexOf(Buffer.from([0xff, 0xc0]));
    expect(pngBuf.readUInt32BE(16)).not.toBe(jpgBuf.readUInt16BE(sof + 7));
    // The card is shown inline in a preview; the document is downloaded.
    expect(jpg.headers.get('content-disposition')).toBeNull();
  });
});

describe('GET /api/certificate/:id.jpg', () => {
  it('serves the 1200×630 social card', async () => {
    const matchId = await claimDay('nick');
    const res = await app().request(`/api/certificate/${matchId}.jpg`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    // Small enough that a crawler renders the preview immediately.
    expect(buf.length).toBeLessThan(1_000_000);
  });
});

describe('GET /api/certificate/:id (facts)', () => {
  it('recomputes the streak AS OF the certificate’s day, not today', async () => {
    // Three consecutive days, each with its own certificate. The oldest one must
    // still say "1" — this is what makes a stored streak column unnecessary.
    const days = [-2, -1, 0].map((d) => toDayString(new Date(Date.now() + d * 86_400_000)));
    await handle.db.insert(players).values({ tokenHash: TOKEN_HASH, nickname: 'nick' });
    const ids: string[] = [];
    for (const day of days) {
      const matchId = await insertWinningMatch(`hash-${day}`);
      await handle.db
        .insert(dailyResults)
        .values({ playerToken: TOKEN_HASH, day, completed: true, matchId });
      ids.push(matchId);
    }

    const streaks: number[] = [];
    for (const id of ids) {
      const res = await app().request(`/api/certificate/${id}`);
      streaks.push(((await res.json()) as { streak: number }).streak);
    }
    expect(streaks).toEqual([1, 2, 3]);
  });

  it('never leaks the player token, and omits the engine state', async () => {
    const matchId = await claimDay('nick');
    const res = await app().request(`/api/certificate/${matchId}`);
    const body = (await res.json()) as Record<string, unknown>;
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(TOKEN_HASH);
    expect(raw).not.toContain(PLAYER_TOKEN);
    expect(body.final).toBeUndefined();
    expect(body.hasBoard).toBe(true);
    expect(body.playerName).toBe('nick');
  });
});

describe('GET /api/daily', () => {
  it('hands the card the match id of today’s certificate', async () => {
    const matchId = await claimDay('nick');
    const res = await app().request('/api/daily', {
      headers: { 'x-player-token': PLAYER_TOKEN },
    });
    expect(await res.json()).toMatchObject({ todayCompleted: true, todayMatchId: matchId });
  });

  it('returns no certificate handle before the day is done', async () => {
    const res = await app().request('/api/daily', {
      headers: { 'x-player-token': PLAYER_TOKEN },
    });
    expect(await res.json()).toMatchObject({ todayCompleted: false, todayMatchId: null });
  });
});
