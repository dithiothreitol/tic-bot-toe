import type { Move, MoveResult, Player, PlayerView } from '@arena/game-core';

/**
 * Human provider: `getMove` returns a promise the UI resolves when the player
 * commits a move (board click / ship placement). Telemetry records thinking
 * time; no tokens, cost or forfeit.
 */
export interface HumanPlayerHandle {
  player: Player;
  /** Commit the human's move. Ignored if none pending or the move is illegal. */
  submit: (move: Move) => boolean;
  /** Legal moves currently awaited (for the UI), or null when not this side's turn. */
  pendingLegal: () => Move[] | null;
  isWaiting: () => boolean;
}

interface Pending {
  resolve: (result: MoveResult) => void;
  legal: Move[];
  startedAt: number;
}

export function createHumanPlayer(
  id = 'human',
  displayName = 'Human',
  now: () => number = Date.now,
): HumanPlayerHandle {
  let pending: Pending | null = null;

  const player: Player = {
    id,
    displayName,
    kind: 'human',
    getMove(_view: PlayerView, legal: Move[]): Promise<MoveResult> {
      return new Promise<MoveResult>((resolve) => {
        pending = { resolve, legal, startedAt: now() };
      });
    },
  };

  return {
    player,
    submit(move: Move): boolean {
      if (!pending || !pending.legal.includes(move)) return false;
      const { resolve, startedAt } = pending;
      pending = null;
      resolve({
        move,
        telemetry: { latencyMs: Math.round(now() - startedAt), retries: 0, forfeit: false },
      });
      return true;
    },
    pendingLegal: () => pending?.legal ?? null,
    isWaiting: () => pending !== null,
  };
}
