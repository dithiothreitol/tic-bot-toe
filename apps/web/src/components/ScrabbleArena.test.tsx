import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  type PlacedTile,
  type ScrabbleState,
  type Variant,
  clearLexicons,
  miniLexicon,
  registerLexicon,
  scrabble,
} from '@arena/game-core';

import { ScrabbleArena } from './ScrabbleArena';

beforeEach(() => registerLexicon('en', miniLexicon('en', ['CAT', 'CATS', 'AT'])));
afterEach(() => clearLexicons());

function emptyState(rack: string[]): ScrabbleState {
  const base = scrabble.createInitialState({ id: 'en', label: '' } as Variant, { seed: 1 });
  return {
    ...base,
    board: Array<PlacedTile | null>(225).fill(null),
    racks: { p1: rack, p2: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
    toMove: 'p1',
  };
}

describe('ScrabbleArena — human builder', () => {
  it('builds a word from a start cell + rack taps and submits the notation', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    render(
      <ScrabbleArena
        state={emptyState(['C', 'A', 'T', 'X', 'Y', 'Z', 'B'])}
        interactive
        toMove="p1"
        mode="human_vs_model"
        humanSide="p1"
        names={{ p1: 'You', p2: 'Bot' }}
        onPlay={onPlay}
      />,
    );

    // Tap the centre square H8, then tap C, A, T from the rack.
    await user.click(screen.getByRole('button', { name: 'Pole H8' }));
    await user.click(screen.getByRole('button', { name: 'C' }));
    await user.click(screen.getByRole('button', { name: 'A' }));
    await user.click(screen.getByRole('button', { name: 'T' }));

    // The live notation preview shows the full move…
    expect(screen.getByText(/H8>CAT/)).toBeInTheDocument();

    // …and "Play word" submits it.
    await user.click(screen.getByRole('button', { name: /Zagraj słowo/ }));
    expect(onPlay).toHaveBeenCalledWith('H8>CAT');
  });

  it('offers PASS at any time', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    render(
      <ScrabbleArena
        state={emptyState(['A', 'B', 'C', 'D', 'E', 'F', 'G'])}
        interactive
        toMove="p1"
        mode="human_vs_model"
        humanSide="p1"
        names={{ p1: 'You', p2: 'Bot' }}
        onPlay={onPlay}
      />,
    );
    await user.click(screen.getByRole('button', { name: /^Pas$/ }));
    expect(onPlay).toHaveBeenCalledWith('PASS');
  });

  it('shows the god view (both racks) in model-vs-model', () => {
    render(
      <ScrabbleArena
        state={emptyState(['A', 'B', 'C', 'D', 'E', 'F', 'G'])}
        interactive={false}
        toMove="p1"
        mode="model_vs_model"
        humanSide={null}
        names={{ p1: 'Alpha', p2: 'Beta' }}
        onPlay={() => {}}
      />,
    );
    // Both players' racks are labelled — no hidden information between LLMs on screen.
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });
});
