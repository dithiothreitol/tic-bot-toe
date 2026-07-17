import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MoveLogEntry } from '@/game/orchestrator';

import { GameLog } from './GameLog';

const names = { p1: 'openrouter:a', p2: 'openrouter:b' };

function move(over: Partial<MoveLogEntry> & Pick<MoveLogEntry, 'index'>): MoveLogEntry {
  return {
    player: 'p1',
    move: 4,
    telemetry: { latencyMs: 100, retries: 0, forfeit: false },
    ...over,
  };
}

describe('GameLog thought indicator (Module A)', () => {
  it('shows a 🧠 toggle only for moves with a trace, expanding on click', async () => {
    const user = userEvent.setup();
    render(
      <GameLog
        moves={[
          move({ index: 0, thoughts: 'center is strong' }),
          move({ index: 1, player: 'p2' }), // no trace → no toggle
        ]}
        names={names}
      />,
    );

    // Exactly one move carries a trace → exactly one toggle, collapsed by default.
    const toggles = screen.getAllByRole('button', { name: 'Pokaż tok myślenia' });
    expect(toggles).toHaveLength(1);
    expect(screen.queryByText('center is strong')).not.toBeInTheDocument();

    await user.click(toggles[0]!);
    expect(screen.getByText('center is strong')).toBeInTheDocument();
  });
});
