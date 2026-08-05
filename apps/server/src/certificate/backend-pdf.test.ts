import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { getGame } from '@arena/game-core';

import { loadArt } from './art';
import { renderJpeg } from './backend-canvas';
import { renderPdf } from './backend-pdf';
import type { CertificateFacts } from './facts';
import { A5, SHARE, certificateScene, shareCardScene } from './scene';

/** A real finished position, so the board path is exercised, not skipped. */
function finishedTicTacToe(): unknown {
  const def = getGame('tictactoe') as unknown as {
    variants: { id: string; label: string }[];
    createInitialState: (v: unknown, c: unknown) => unknown;
    applyMove: (s: unknown, p: 'p1' | 'p2', m: unknown) => unknown;
  };
  let state = def.createInitialState(def.variants[0], {});
  for (const [player, move] of [
    ['p1', 4],
    ['p2', 0],
    ['p1', 8],
    ['p2', 2],
    ['p1', 6],
    ['p2', 7],
  ] as const) {
    state = def.applyMove(state, player, move);
  }
  return state;
}

const FACTS: CertificateFacts = {
  matchId: '3f9c2a1e-77b4-4c1a-9f2e-0a1b2c3d4e5f',
  day: '2026-07-12',
  playerName: 'dithiothreitol',
  opponentId: 'openrouter:meta-llama/llama-3.3-70b-instruct:free',
  opponentLabel: 'meta-llama/llama-3.3-70b-instruct:free',
  game: 'tictactoe',
  variant: 'standard',
  streak: 7,
  moveCount: 47,
  movesHashPrefix: 'a91f4c7d2b03',
  final: finishedTicTacToe(),
};

const OPTS = { verifyUrl: 'https://ticbottoe.lol/certyfikat/3f9c2a1e-77b4-4c1a-9f2e-0a1b2c3d4e5f' };

const META = {
  title: 'Certyfikat',
  subject: 'test',
  keywords: ['test'],
  day: FACTS.day,
};

/**
 * pdf-lib writes object streams compressed, so the interesting parts are not
 * greppable in the raw bytes — reading them back through the parser is both the
 * only way that works and a stronger check: it proves the file opens.
 */
async function reload(bytes: Uint8Array) {
  return PDFDocument.load(bytes);
}

describe('renderPdf', () => {
  it('produces a valid single-page A5 landscape PDF', async () => {
    const bytes = await renderPdf(certificateScene(FACTS, 'pl', OPTS), META);
    expect(Buffer.from(bytes).toString('latin1').startsWith('%PDF-')).toBe(true);

    const doc = await reload(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(A5.width, 2); // 210 mm
    expect(height).toBeCloseTo(A5.height, 2); // 148 mm
    expect(width).toBeGreaterThan(height); // landscape, not portrait
  });

  it('embeds the brand fonts rather than falling back to base-14', async () => {
    const doc = await reload(await renderPdf(certificateScene(FACTS, 'pl', OPTS), META));
    const fonts = doc.context
      .enumerateIndirectObjects()
      .map(([, obj]) => String(obj))
      .filter((s) => s.includes('BaseFont'))
      .join(' ');
    // Subsets get a random six-letter prefix (AAAAAA+Rajdhani-Bold).
    expect(fonts).toMatch(/Rajdhani/);
    expect(fonts).toMatch(/JetBrainsMono/);
    expect(fonts).not.toMatch(/Helvetica|Courier/);
  });

  it('actually embeds the generated background', async () => {
    // This is the failure this test exists for: when the art path is wrong, the
    // certificate still renders — just flat — so nothing errors and nobody
    // notices until someone opens the PDF. `loadArt` is checked directly, and
    // the JPEG is checked for inside the file.
    expect(loadArt('certificate-bg'), 'certificate-bg.jpg not found').not.toBeNull();
    expect(loadArt('certificate-share'), 'certificate-share.jpg not found').not.toBeNull();

    const doc = await reload(await renderPdf(certificateScene(FACTS, 'pl', OPTS), META));
    const objects = doc.context
      .enumerateIndirectObjects()
      .map(([, obj]) => String(obj))
      .join(' ');
    // Embedded byte-for-byte as JPEG, never re-encoded.
    expect(objects).toContain('DCTDecode');
  });

  it('stays vector-sized: a raster page would be several megabytes', async () => {
    const bytes = await renderPdf(certificateScene(FACTS, 'pl', OPTS), META);
    expect(bytes.byteLength).toBeGreaterThan(20_000);
    expect(bytes.byteLength).toBeLessThan(900_000);
  });

  it('carries document metadata, dated the day it was earned', async () => {
    const doc = await reload(
      await renderPdf(certificateScene(FACTS, 'pl', OPTS), { ...META, title: 'Certyfikat Testowy' }),
    );
    expect(doc.getTitle()).toBe('Certyfikat Testowy');
    expect(doc.getAuthor()).toContain('tic-bot-toe');
    // Dated the day it was EARNED, not the day it was downloaded.
    expect(doc.getCreationDate()?.toISOString().slice(0, 10)).toBe('2026-07-12');
  });

  it('renders both locales, and they differ', async () => {
    const pl = await renderPdf(certificateScene(FACTS, 'pl', OPTS), META);
    const en = await renderPdf(certificateScene(FACTS, 'en', OPTS), META);
    expect(pl.byteLength).not.toBe(en.byteLength);
  });

  it('never throws on a match it cannot replay', async () => {
    const broken = { ...FACTS, final: { nonsense: true }, playerName: null, streak: 1 };
    const bytes = await renderPdf(certificateScene(broken, 'pl', OPTS), META);
    expect(Buffer.from(bytes).toString('latin1').startsWith('%PDF-')).toBe(true);
  });
});

describe('renderJpeg', () => {
  it('produces a 1200×630 JPEG small enough for a crawler', async () => {
    const buf = await renderJpeg(shareCardScene(FACTS, 'pl', OPTS));
    expect(buf.subarray(0, 3).toString('hex')).toBe('ffd8ff'); // JPEG SOI
    // Dimensions live in the SOF0 marker: FF C0 len prec height width.
    const sof = buf.indexOf(Buffer.from([0xff, 0xc0]));
    expect(sof).toBeGreaterThan(0);
    expect(buf.readUInt16BE(sof + 5)).toBe(SHARE.height);
    expect(buf.readUInt16BE(sof + 7)).toBe(SHARE.width);
    expect(buf.length).toBeLessThan(1_000_000);
  });

  it('can rasterise the A5 scene too (print preview / debugging)', async () => {
    const buf = await renderJpeg(certificateScene(FACTS, 'pl', OPTS), { scale: 2 });
    expect(buf.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    const sof = buf.indexOf(Buffer.from([0xff, 0xc0]));
    expect(buf.readUInt16BE(sof + 7)).toBe(Math.round(A5.width * 2));
  });
});
