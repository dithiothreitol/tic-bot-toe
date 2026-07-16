import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SudokuBoard } from './SudokuBoard';

/** A 4×4 board: two givens, the rest empty. */
function board4(): (number | null)[] {
  const b = Array<number | null>(16).fill(null);
  b[0] = 1; // r1c1
  b[5] = 2; // r2c2
  return b;
}
function givens4(): boolean[] {
  const g = Array<boolean>(16).fill(false);
  g[0] = true;
  g[5] = true;
  return g;
}

describe('SudokuBoard', () => {
  it('renders one button per cell and shows the digits', () => {
    render(
      <SudokuBoard size={4} boxRows={2} boxCols={2} board={board4()} givenMask={givens4()} />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(16);
    // The two givens are rendered.
    expect(screen.getByRole('button', { name: /Wiersz 1, kolumna 1, cyfra 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Wiersz 2, kolumna 2, cyfra 2/ })).toBeInTheDocument();
  });

  it('only makes the listed cells interactive and fires onCellClick', async () => {
    const user = userEvent.setup();
    const onCellClick = vi.fn();
    render(
      <SudokuBoard
        size={4}
        boxRows={2}
        boxCols={2}
        board={board4()}
        givenMask={givens4()}
        interactive={[1]} // r1c2 only
        onCellClick={onCellClick}
      />,
    );
    const target = screen.getByRole('button', { name: /Wiersz 1, kolumna 2, puste/ });
    expect(target).toBeEnabled();
    // A non-listed empty cell stays read-only.
    expect(screen.getByRole('button', { name: /Wiersz 1, kolumna 3, puste/ })).toBeDisabled();

    await user.click(target);
    expect(onCellClick).toHaveBeenCalledWith(1);
  });

  it('is fully read-only when no interactive cells are given', () => {
    render(
      <SudokuBoard size={4} boxRows={2} boxCols={2} board={board4()} givenMask={givens4()} />,
    );
    for (const btn of screen.getAllByRole('button')) expect(btn).toBeDisabled();
  });
});
