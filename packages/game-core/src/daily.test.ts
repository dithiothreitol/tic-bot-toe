import { describe, expect, it } from 'vitest';

import { BATTLESHIP_VARIANTS_CONFIG } from './battleship';
import { SUDOKU_VARIANTS_CONFIG } from './sudoku';
import {
  DAILY_OPPONENTS,
  dailyAcceptedSubjectIds,
  dailyChallenge,
  dailySubjectId,
  paidEquivalent,
  streakFrom,
  toDayString,
} from './daily';

describe('dailyChallenge', () => {
  it('is deterministic — the same date always yields the same challenge', () => {
    const a = dailyChallenge('2026-07-12');
    const b = dailyChallenge('2026-07-12');
    expect(a).toEqual(b);
  });

  it('produces a legal game + variant + free opponent for any date', () => {
    // A full year of dates: every single one must be playable.
    const start = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 365; i++) {
      const day = toDayString(new Date(start + i * 86_400_000));
      const c = dailyChallenge(day);

      expect(c.day).toBe(day);
      expect(['tictactoe', 'battleship', 'sudoku']).toContain(c.game);
      if (c.game === 'battleship') {
        expect(Object.keys(BATTLESHIP_VARIANTS_CONFIG)).toContain(c.variant);
      } else if (c.game === 'sudoku') {
        expect(Object.keys(SUDOKU_VARIANTS_CONFIG)).toContain(c.variant);
      } else {
        expect(c.variant).toBe('standard');
      }
      expect(DAILY_OPPONENTS).toContain(c.opponent);
      expect(c.humanSide).toBe('p1');
    }
  });

  it('actually varies across dates (not a constant)', () => {
    const days = Array.from({ length: 60 }, (_, i) =>
      toDayString(new Date(Date.UTC(2026, 0, 1) + i * 86_400_000)),
    );
    const seen = new Set(days.map((d) => JSON.stringify(dailyChallenge(d))));
    expect(seen.size).toBeGreaterThan(4);
    // Several games show up over two months, all from the legal pool.
    const games = new Set(days.map((d) => dailyChallenge(d).game));
    expect(games.size).toBeGreaterThanOrEqual(2);
    for (const g of games) expect(['tictactoe', 'battleship', 'sudoku']).toContain(g);
  });

  it('rejects anything that is not YYYY-MM-DD (a bad seed = a different challenge)', () => {
    expect(() => dailyChallenge('12.07.2026')).toThrow(/YYYY-MM-DD/);
    expect(() => dailyChallenge('2026-7-1')).toThrow(/YYYY-MM-DD/);
  });

  it('maps the opponent onto its ranking subject id', () => {
    expect(dailySubjectId({ provider: 'webllm', id: 'Foo-MLC', name: 'Foo' })).toBe(
      'webllm:Foo-MLC',
    );
    expect(dailySubjectId({ provider: 'openrouter', id: 'a/b:free', name: 'B' })).toBe(
      'openrouter:a/b:free',
    );
  });
});

describe('paidEquivalent (paid twin of a :free opponent)', () => {
  it('strips :free from the id and "(free)" from the name', () => {
    expect(
      paidEquivalent({
        provider: 'openrouter',
        id: 'meta-llama/llama-3.2-3b-instruct:free',
        name: 'Llama 3.2 3B (free)',
      }),
    ).toEqual({
      provider: 'openrouter',
      id: 'meta-llama/llama-3.2-3b-instruct',
      name: 'Llama 3.2 3B',
    });
  });

  it('has no twin for WebLLM (local, never rate-limited) or an already-paid id', () => {
    expect(paidEquivalent({ provider: 'webllm', id: 'Foo-MLC', name: 'Foo' })).toBeNull();
    expect(paidEquivalent({ provider: 'openrouter', id: 'a/b', name: 'B' })).toBeNull();
  });

  it('every :free entry in the pool has a well-formed twin', () => {
    for (const opp of DAILY_OPPONENTS) {
      if (opp.provider !== 'openrouter') continue;
      const paid = paidEquivalent(opp);
      expect(paid).not.toBeNull();
      expect(paid!.id.length).toBeGreaterThan(0);
      expect(paid!.id).not.toContain(':free');
      expect(paid!.name).not.toContain('(free)');
    }
  });
});

describe('dailyAcceptedSubjectIds', () => {
  const challengeWith = (opponent: (typeof DAILY_OPPONENTS)[number]) =>
    ({ day: '2026-07-12', game: 'tictactoe', variant: 'standard', opponent, humanSide: 'p1' }) as const;

  it('accepts the pool entry AND its paid twin for a :free opponent', () => {
    const opp = {
      provider: 'openrouter',
      id: 'meta-llama/llama-3.2-3b-instruct:free',
      name: 'Llama 3.2 3B (free)',
    } as const;
    expect(dailyAcceptedSubjectIds(challengeWith(opp))).toEqual([
      'openrouter:meta-llama/llama-3.2-3b-instruct:free',
      'openrouter:meta-llama/llama-3.2-3b-instruct',
    ]);
  });

  it('accepts only the pool entry for a WebLLM opponent', () => {
    const opp = { provider: 'webllm', id: 'Foo-MLC', name: 'Foo' } as const;
    expect(dailyAcceptedSubjectIds(challengeWith(opp))).toEqual(['webllm:Foo-MLC']);
  });
});

describe('streakFrom', () => {
  it('counts consecutive days ending today', () => {
    expect(streakFrom(['2026-07-10', '2026-07-11', '2026-07-12'], '2026-07-12')).toBe(3);
  });

  it('keeps the streak alive when today is still pending', () => {
    // Today not done yet — yesterday's streak must not read as broken.
    expect(streakFrom(['2026-07-10', '2026-07-11'], '2026-07-12')).toBe(2);
  });

  it('breaks on a missed day', () => {
    expect(streakFrom(['2026-07-09', '2026-07-12'], '2026-07-12')).toBe(1);
  });

  it('is 0 with no history, and 0 once the gap is two days', () => {
    expect(streakFrom([], '2026-07-12')).toBe(0);
    expect(streakFrom(['2026-07-10'], '2026-07-12')).toBe(0);
  });

  it('spans a month boundary', () => {
    expect(streakFrom(['2026-06-30', '2026-07-01'], '2026-07-01')).toBe(2);
  });
});
