/**
 * Certificate endpoints (plan §7.1).
 *
 *   GET /api/certificate/:id.pdf  → A5 landscape PDF, as a download
 *   GET /api/certificate/:id.jpg  → 1200×630 social card
 *   GET /api/certificate/:id      → the facts as JSON, for the SPA page
 *
 * Public on purpose: a certificate exists to be shown, and requiring the
 * player's bearer token would break the link for whoever it was sent to. Nothing
 * here is secret — the nickname is already public in the human leaderboard, and
 * the rest is the match, which is public at /replay/:id.
 *
 * The client supplies ONE value, the match id. Every word on the document is
 * read from the database (plan §9).
 */
import { type Locale, isLocale, localePath } from '@arena/i18n';
import { Hono } from 'hono';

import { renderJpeg } from '../certificate/backend-canvas';
import { renderPdf } from '../certificate/backend-pdf';
import { CERTIFICATE_COPY } from '../certificate/copy';
import { type CertificateFacts, factsFor, shortMatchId } from '../certificate/facts';
import { certificateScene, shareCardScene } from '../certificate/scene';
import { tierFor } from '../certificate/tiers';
import type { Config } from '../config';
import type { Database } from '../db/client';
import { originFrom } from '../og/seo';

/** A match is immutable and so is its certificate — cache it for a year. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

function localeOf(value: string | undefined): Locale {
  return isLocale(value) ? value : 'pl';
}

export function certificateUrl(origin: string, matchId: string, locale: Locale): string {
  return `${origin}${localePath(locale, 'certificate', matchId)}`;
}

/** ASCII-only, so no client has to guess at RFC 5987 encoding. */
function fileName(facts: CertificateFacts, locale: Locale): string {
  const word = locale === 'pl' ? 'certyfikat' : 'certificate';
  return `tic-bot-toe-${word}-${facts.day}-${shortMatchId(facts.matchId)}.pdf`;
}

export function certificateRoute(deps: { db: Database; config: Config }): Hono {
  const app = new Hono();

  app.get('/:file', async (c) => {
    const file = c.req.param('file');
    const dot = file.lastIndexOf('.');
    const id = dot === -1 ? file : file.slice(0, dot);
    const ext = dot === -1 ? '' : file.slice(dot + 1).toLowerCase();

    const facts = await factsFor(deps.db, id);
    // Most matches are not certificates; that is a 404, not a failure.
    if (!facts) return c.json({ error: 'no_certificate' }, 404);

    const locale = localeOf(c.req.query('lang'));
    const origin = originFrom(
      c.req.header('host'),
      c.req.header('x-forwarded-proto'),
      deps.config.trustedProxy,
    );
    const verifyUrl = certificateUrl(origin, facts.matchId, locale);
    const t = CERTIFICATE_COPY[locale];

    if (ext === 'pdf') {
      const pdf = await renderPdf(certificateScene(facts, locale, { verifyUrl }), {
        title: t.pdfTitle(facts.playerName ?? t.anonymous),
        subject: t.pdfSubject(facts.opponentLabel, facts.day),
        keywords: ['tic-bot-toe', 'LLM Game Arena', facts.game, facts.opponentLabel],
        day: facts.day,
      });
      return new Response(pdf, {
        headers: {
          'Content-Type': 'application/pdf',
          // The point of the whole feature: a file on the player's disk.
          'Content-Disposition': `attachment; filename="${fileName(facts, locale)}"`,
          'Cache-Control': IMMUTABLE,
        },
      });
    }

    if (ext === 'jpg' || ext === 'jpeg') {
      const jpeg = await renderJpeg(shareCardScene(facts, locale, { verifyUrl }));
      return new Response(jpeg, {
        headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': IMMUTABLE },
      });
    }

    return c.json(
      {
        ...facts,
        // The reconstructed board is for rendering only — megabytes of engine
        // state have no business in a JSON payload the page never reads.
        final: undefined,
        hasBoard: facts.final !== null,
        tier: tierFor(facts.streak).id,
        url: verifyUrl,
      },
      200,
      { 'Cache-Control': IMMUTABLE },
    );
  });

  return app;
}
