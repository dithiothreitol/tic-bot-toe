import { describe, expect, it } from 'vitest';

import type { CertificateFacts } from './facts';
import { A5, SHARE, SHARE_SAFE, certificateScene, qrModules, shareCardScene } from './scene';
import type { Node, TextNode } from './scene-types';
import { allTierTitles, tierFor } from './tiers';

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
  final: { board: Array(9).fill(null) },
};

const OPTS = { verifyUrl: 'https://ticbottoe.lol/certyfikat/3f9c2a1e-77b4-4c1a-9f2e-0a1b2c3d4e5f' };

const texts = (nodes: Node[]): string[] =>
  nodes.filter((n): n is TextNode => n.kind === 'text').map((n) => n.text);

describe('certificateScene', () => {
  it('states every fact it certifies', () => {
    const all = texts(certificateScene(FACTS, 'pl', OPTS).nodes).join(' | ');
    expect(all).toContain('dithiothreitol');
    expect(all).toContain('meta-llama/llama-3.3-70b-instruct:free');
    expect(all).toContain('12 lipca 2026');
    expect(all).toContain('a91f4c7d2b03'); // the seal
    expect(all).toContain('3f9c2a1e'); // the match, findable as a replay
    expect(all).toContain('47');
  });

  it('draws the real final board, and closes the layout when it cannot', () => {
    expect(certificateScene(FACTS, 'pl', OPTS).nodes.some((n) => n.kind === 'board')).toBe(true);
    const unreplayable = certificateScene({ ...FACTS, final: null }, 'pl', OPTS);
    expect(unreplayable.nodes.some((n) => n.kind === 'board')).toBe(false);
  });

  it('shows no rank badge on a first-day certificate, and one from day two', () => {
    const day1 = texts(certificateScene({ ...FACTS, streak: 1 }, 'pl', OPTS).nodes).join(' ');
    expect(day1).not.toContain('SERIA');
    // …and the third "learning outcome" switches to its no-streak variant.
    expect(day1).toContain('Time-to-value');

    const day2 = texts(certificateScene({ ...FACTS, streak: 2 }, 'pl', OPTS).nodes).join(' ');
    expect(day2).toContain('ENTUZJASTA AI · SERIA 2 DNI');
  });

  it('names the player when anonymous and points at the fix', () => {
    const anon = texts(certificateScene({ ...FACTS, playerName: null }, 'pl', OPTS).nodes).join(' ');
    expect(anon).toContain('Anonimowy gracz areny');
    expect(anon).toContain('ustaw nick');
  });

  it('keeps every node inside the printable margin', () => {
    // Home printers cannot reach the paper edge; only the background may.
    for (const streak of [1, 2, 7, 14, 30]) {
      const scene = certificateScene({ ...FACTS, streak }, 'pl', OPTS);
      for (const node of scene.nodes) {
        if (node.kind === 'image') continue; // full bleed by design
        if (node.kind === 'rect' && node.w === A5.width) continue; // the scrim
        const [x, y] =
          node.kind === 'line' ? [Math.min(node.x1, node.x2), Math.max(node.y1, node.y2)] : [node.x, node.y];
        expect(x, `${node.kind} x`).toBeGreaterThanOrEqual(16);
        expect(y, `${node.kind} y`).toBeLessThanOrEqual(A5.height - 6);
        const right =
          node.kind === 'line'
            ? Math.max(node.x1, node.x2)
            : node.kind === 'text'
              ? node.x
              : node.kind === 'qr' || node.kind === 'board'
                ? node.x + node.size
                : node.x + node.w;
        expect(right, `${node.kind} right`).toBeLessThanOrEqual(A5.width - 16);
      }
    }
  });

  it('bounds every long-form text so it cannot bleed off the page', () => {
    const scene = certificateScene(FACTS, 'pl', OPTS);
    for (const node of scene.nodes) {
      if (node.kind !== 'text') continue;
      // Short fixed labels are safe; anything carrying data or a long sentence
      // must declare how it reacts to overflow.
      if (node.text.length > 40) {
        expect(node.maxWidth, `unbounded: "${node.text.slice(0, 30)}…"`).toBeDefined();
        expect(node.fit).toBeDefined();
      }
    }
  });

  it('encodes the certificate URL in a scannable QR with a light plate', () => {
    const modules = qrModules(OPTS.verifyUrl);
    expect(modules.length).toBeGreaterThan(20);
    expect(modules[0]!.length).toBe(modules.length);

    const scene = certificateScene(FACTS, 'pl', OPTS);
    const qr = scene.nodes.find((n) => n.kind === 'qr');
    expect(qr).toBeDefined();
    // Dark modules on a light plate: inverted codes are not reliably scanned.
    const plate = scene.nodes.find((n) => n.kind === 'rect' && n.fill !== undefined && n.w === 50);
    expect(plate).toBeDefined();
  });
});

describe('shareCardScene', () => {
  it('is 1200×630 and keeps load-bearing content inside the crop-safe box', () => {
    const scene = shareCardScene(FACTS, 'pl', OPTS);
    expect(scene.width).toBe(SHARE.width);
    expect(scene.height).toBe(SHARE.height);

    // Several mobile clients crop toward a square; the name and the rank have
    // to survive that. The wordmark footer is allowed to fall outside.
    const load = scene.nodes.filter(
      (n): n is TextNode => n.kind === 'text' && n.size >= 19 && n.y < 500,
    );
    expect(load.length).toBeGreaterThan(3);
    for (const n of load) {
      expect(n.x).toBeGreaterThanOrEqual(SHARE_SAFE.x);
      expect(n.y).toBeGreaterThanOrEqual(SHARE_SAFE.y);
      expect(n.y).toBeLessThanOrEqual(SHARE_SAFE.y + SHARE_SAFE.h);
    }
  });

  it('leads with the punchline, not the fine print', () => {
    const scene = shareCardScene(FACTS, 'pl', OPTS);
    const headline = scene.nodes.find(
      (n): n is TextNode => n.kind === 'text' && n.text.startsWith('Kurs trwał'),
    );
    expect(headline).toBeDefined();
    // Readable in a feed thumbnail — the whole reason the card exists.
    expect(headline!.size).toBeGreaterThanOrEqual(22);
  });

  it('never ellipsises the facts line — the move count is the claim', () => {
    const scene = shareCardScene(FACTS, 'pl', OPTS);
    const facts = scene.nodes.find(
      (n): n is TextNode => n.kind === 'text' && n.text.includes('meta-llama'),
    );
    expect(facts?.fit).toBe('shrink');
  });
});

describe('tiers', () => {
  it('maps streak length to a rank', () => {
    expect(tierFor(1).title).toBeNull();
    expect(tierFor(2).title?.pl).toBe('ENTUZJASTA AI');
    expect(tierFor(6).title?.pl).toBe('ENTUZJASTA AI');
    expect(tierFor(7).title?.pl).toBe('LIDER STRATEGII AI');
    expect(tierFor(13).title?.pl).toBe('LIDER STRATEGII AI');
    expect(tierFor(14).title?.en).toBe('HEAD OF AI TRANSFORMATION');
    expect(tierFor(30).title?.en).toBe('CHIEF AI VISIONARY (SELF-APPOINTED)');
    expect(tierFor(999).title?.pl).toBe('CHIEF AI VISIONARY (SAMOZWAŃCZY)');
  });

  it('uses no gold, amber or warm metallic — they are banned brand-wide', () => {
    for (const streak of [1, 2, 7, 14, 30]) {
      const [r, g, b] = tierFor(streak).color;
      const warm = r > 180 && g > 130 && g < 220 && b < 100;
      expect(warm, `tier ${streak} is gold-ish`).toBe(false);
    }
  });

  it('declares the badge wide enough for the longest rank in either language', () => {
    // The rarest tier is the one nobody sees before release, so it is the one
    // that ships broken. Rajdhani/JetBrains at 9 pt run ≈ 0.6 em per character.
    const badgeTextWidth = 250;
    const longest = allTierTitles().reduce((a, b) => (a.length > b.length ? a : b));
    const withStreak = `${longest} · 999-DAY STREAK`;
    // fit:'shrink' may reduce the size, but not below legibility (4 pt floor).
    const minSize = badgeTextWidth / (withStreak.length * 0.6);
    expect(minSize).toBeGreaterThan(4);
  });
});
