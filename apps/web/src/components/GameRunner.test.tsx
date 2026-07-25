import { fireEvent, render, screen } from '@testing-library/react';

import { getGame } from '@arena/game-core';

import type { MatchConfig } from '@/components/GameRunner';
import { pl } from '@/i18n/pl';

import { GameRunner, ratingRow } from './GameRunner';

// The only I/O the human-battleship path touches before a save: the anti-bot
// start token and the live-counter heartbeat. Stub both so the test is hermetic
// (no network, no timers left running against a real endpoint).
vi.mock('@/api/match', () => ({
  fetchStartToken: vi.fn().mockResolvedValue('start-token'),
}));
vi.mock('@/api/live', () => ({
  pingLive: vi.fn().mockResolvedValue(undefined),
  reportFinish: vi.fn().mockResolvedValue(undefined),
  stopLive: vi.fn(),
}));

/**
 * Human battleship: p1 is the person, p2 is a second human so the real
 * orchestrator emits the opening snapshot and then simply waits for input — no
 * LLM, no network. That exercises the exact placement → play transition where a
 * misplaced hook once threw React error #310 ("ciemność widzę" after placing the
 * fleet). See GameRunner.tsx: the thought-stream toggle hook MUST stay above the
 * `needsPlacement` early return, or the hook count changes when the gate clears.
 */
function battleshipConfig(): MatchConfig {
  return {
    game: 'battleship',
    variant: getGame('battleship').variants[0]!,
    mode: 'human_vs_model',
    p1: { kind: 'human', displayName: 'You' },
    p2: { kind: 'human', displayName: 'Also you' },
    names: { p1: 'You', p2: 'Also you' },
    seed: 1,
  };
}

describe('GameRunner — human battleship placement → play', () => {
  it('renders the shooting board after the fleet is confirmed (no hook-count crash)', async () => {
    render(<GameRunner config={battleshipConfig()} onExit={() => {}} />);

    // 1. We land on ship placement, and "Ready" is gated on a full fleet.
    expect(screen.getByText(pl.placement.title)).toBeInTheDocument();
    const ready = screen.getByRole('button', { name: new RegExp(`^${pl.placement.ready}$`, 'i') });
    expect(ready).toBeDisabled();

    // 2. Auto-place the whole fleet, then confirm.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(pl.placement.random, 'i') }));
    expect(await screen.findByText(pl.placement.allPlaced)).toBeInTheDocument();
    expect(ready).toBeEnabled();
    fireEvent.click(ready);

    // 3. The play view renders — both the own fleet and the tracking grid.
    //    Before the fix this render threw React #310 and showed a blank screen.
    expect(await screen.findByText(pl.battleship.yourFleet)).toBeInTheDocument();
    expect(screen.getByText(pl.battleship.yourShots)).toBeInTheDocument();
  });
});

/**
 * The rating card reads `real` Elo and prints it to one decimal. It used to round
 * `before`, `after` and the raw delta to whole points independently, which both hid
 * the sub-point movement a draw produces AND let the arrow and the delta disagree
 * ("1000 → 1001 (+0)"). Whatever the precision, the printed row must add up.
 */
describe('ratingRow — the post-match Elo row never contradicts itself', () => {
  it.each([
    // [before, after, before→after (±delta)] — the reported draw at 1000 vs 1014.
    // A draw against a higher rating IS a gain, and it is worth 0.6, not a full point.
    [1000, 1000.6444, '1000 → 1000.6 (+0.6)'],
    [1014, 1013.3556, '1014 → 1013.4 (-0.6)'],
    // Fractional `before` — combinations that printed a contradiction at whole points.
    [1000.4, 1000.584, '1000.4 → 1000.6 (+0.2)'], // once: "1000 → 1001 (+0)"
    [1000.6, 1001.2, '1000.6 → 1001.2 (+0.6)'], // once: "1001 → 1001 (+1)"
    // A decided game between equals: whole points, no cosmetic ".0" anywhere.
    [1000, 1016, '1000 → 1016 (+16)'],
    [1000, 984, '1000 → 984 (-16)'],
  ])('%s → %s prints "%s"', (before, after, expected) => {
    const row = ratingRow(before, after);
    expect(`${row.beforeLabel} → ${row.afterLabel} (${row.deltaLabel})`).toBe(expected);
    // The invariant the old code broke: the printed numbers must add up.
    expect(row.before + row.delta).toBeCloseTo(row.after, 5);
  });

  it('a draw between equal ratings shows no movement at all', () => {
    expect(ratingRow(1000, 1000)).toMatchObject({ delta: 0, afterLabel: '1000', deltaLabel: '+0' });
  });

  it('stays zero-sum on a decided game', () => {
    expect(ratingRow(1000, 1016).delta + ratingRow(1000, 984).delta).toBe(0);
  });

  it('never leaks float slop into the label', () => {
    // 1013.4 - 1014 is -0.5999999999999091 in IEEE 754; the user must not see that.
    expect(ratingRow(1014, 1013.3556).deltaLabel).toBe('-0.6');
    expect(ratingRow(1000.1, 1000.3).deltaLabel).toBe('+0.2');
  });
});
