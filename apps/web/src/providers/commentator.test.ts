import {
  type BattleshipState,
  type TicTacToeState,
  BATTLESHIP_VARIANTS,
  TICTACTOE_VARIANTS,
  battleship,
  ticTacToe,
} from '@arena/game-core';

import {
  type CommentRequest,
  buildCommentaryPrompt,
  classifyLastMove,
  createCommentator,
  describeGodView,
  shouldComment,
  trimToTwoSentences,
} from './commentator';

function tttAfter(moves: number[]): TicTacToeState {
  let s = ticTacToe.createInitialState(TICTACTOE_VARIANTS[0], {});
  moves.forEach((m, i) => {
    s = ticTacToe.applyMove(s, i % 2 === 0 ? 'p1' : 'p2', m);
  });
  return s;
}

function req(over: Partial<CommentRequest> = {}): CommentRequest {
  return {
    game: 'tictactoe',
    moveIndex: 0,
    player: 'p1',
    playerName: 'Model A',
    move: 4,
    quality: 'optimal',
    state: tttAfter([4]),
    isFinal: false,
    ...over,
  };
}

describe('shouldComment', () => {
  it('always comments on a blunder and on the final move', () => {
    expect(shouldComment(1, 'blunder', false)).toBe(true);
    expect(shouldComment(1, 'good', true)).toBe(true);
  });

  it('comments on the opening but stays quiet on most quiet moves', () => {
    expect(shouldComment(0, 'good', false)).toBe(true);
    expect(shouldComment(1, 'good', false)).toBe(false);
    expect(shouldComment(2, 'good', false)).toBe(true); // an occasional beat
    expect(shouldComment(3, 'optimal', false)).toBe(false);
  });
});

describe('describeGodView', () => {
  it('renders the tic-tac-toe board with free cells as their index', () => {
    const view = describeGodView('tictactoe', tttAfter([4, 0]));
    expect(view).toContain('X'); // p1 in the centre
    expect(view).toContain('O'); // p2 in the corner
    expect(view.split('\n')).toHaveLength(3);
  });

  it('reveals BOTH fleets — the commentator is allowed the god view (§12.1)', () => {
    const state: BattleshipState = battleship.createInitialState(
      BATTLESHIP_VARIANTS[0],
      { seed: 7 },
    );
    const view = describeGodView('battleship', state);
    expect(view).toContain('Player 1 fleet');
    expect(view).toContain('Player 2 fleet');
    // Intact ships of BOTH sides are visible — that is the whole point.
    expect(view.split('S').length - 1).toBeGreaterThan(4);
  });
});

describe('buildCommentaryPrompt', () => {
  it('demands Polish, two sentences, and no jargon', () => {
    const { system } = buildCommentaryPrompt(req());
    expect(system).toContain('POLISH');
    expect(system).toContain('Maximum 2 sentences');
    expect(system).toMatch(/no "minimax"/);
  });

  it('demands the commentary in the INTERFACE language — the user reads it', () => {
    const { system, user } = buildCommentaryPrompt(req(), 'en');
    expect(system).toContain('Write in ENGLISH.');
    expect(system).not.toContain('POLISH');
    expect(user).toContain('Write the ENGLISH commentary now');
    // The instructions themselves stay English either way (SPEC §5).
    expect(system).toContain('Maximum 2 sentences');
  });

  it('carries the last move, its solver rating, and the god view', () => {
    const { user } = buildCommentaryPrompt(
      req({ moveIndex: 3, playerName: 'Model B', move: 8, quality: 'blunder' }),
    );
    expect(user).toContain('Move 4: Model B played 8');
    expect(user).toContain('blunder');
    expect(user).toContain('god view');
  });

  it('announces the winner on the final move', () => {
    const { user } = buildCommentaryPrompt(
      req({ isFinal: true, winnerName: 'Model A' }),
    );
    expect(user).toContain('Model A wins');
  });
});

describe('trimToTwoSentences', () => {
  it('keeps at most two sentences', () => {
    expect(trimToTwoSentences('Jeden. Dwa. Trzy. Cztery.')).toBe('Jeden. Dwa.');
  });

  it('strips surrounding quotes and collapses whitespace', () => {
    expect(trimToTwoSentences('  "Świetny ruch!"  ')).toBe('Świetny ruch!');
  });

  it('survives a model that forgets punctuation', () => {
    expect(trimToTwoSentences('bez kropki')).toBe('bez kropki');
    expect(trimToTwoSentences('')).toBe('');
  });
});

describe('classifyLastMove', () => {
  it('rates the centre opening as optimal and a known losing reply as a blunder', () => {
    expect(classifyLastMove('tictactoe', tttAfter([]), 'p1', 4)).toBe('optimal');
    // X took a corner; O answering with another corner instead of the centre loses.
    expect(classifyLastMove('tictactoe', tttAfter([0]), 'p2', 2)).toBe('blunder');
  });
});

describe('createCommentator (fire-and-forget queue)', () => {
  it('returns immediately and delivers the comment against its own move index', async () => {
    let release!: (text: string) => void;
    const pending = new Promise<string>((r) => {
      release = r;
    });
    const got: Array<{ moveIndex: number; text: string }> = [];

    // `commentate` stands in for either source (own model or the server coach) —
    // the queue only cares that it returns text.
    const commentator = createCommentator({
      commentate: () => pending,
      modelId: 'server',
      onComment: (c) => got.push({ moveIndex: c.moveIndex, text: c.text }),
    });

    // enqueue must not block, even though commentate has not resolved.
    commentator.enqueue(req({ moveIndex: 5 }));
    expect(got).toEqual([]); // nothing yet — the game went on

    release('Świetny ruch. Teraz przeciwnik ma problem.');
    await new Promise((r) => setTimeout(r, 0));

    // The late comment is attached to the move it was about (§12.1).
    expect(got).toEqual([
      { moveIndex: 5, text: 'Świetny ruch. Teraz przeciwnik ma problem.' },
    ]);
  });

  it('never rejects when the model fails — commentary is decoration', async () => {
    const got: string[] = [];
    const commentator = createCommentator({
      commentate: () => Promise.reject(new Error('402 payment required')),
      modelId: 'm',
      onComment: (c) => got.push(c.text),
    });

    expect(() => commentator.enqueue(req())).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(got).toEqual([]);
  });

  it('drops the stalest backlog rather than piling up cost', async () => {
    const seen: number[] = [];
    let resolveFirst!: (text: string) => void;
    const first = new Promise<string>((r) => {
      resolveFirst = r;
    });
    let call = 0;

    const commentator = createCommentator({
      maxPending: 2,
      // The request carries its own move index — no need to parse the prompt.
      commentate: (r) => {
        seen.push(r.moveIndex);
        call += 1;
        return call === 1 ? first : Promise.resolve('ok.');
      },
      modelId: 'm',
      onComment: () => {},
    });

    // Move 0 goes in flight; 1,2,3 queue up but the cap is 2 → the oldest is dropped.
    for (const i of [0, 1, 2, 3]) commentator.enqueue(req({ moveIndex: i }));
    resolveFirst('ok.');
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    commentator.stop();
    // Move 0 ran; of the backlog only the two freshest survived (2 and 3).
    expect(seen[0]).toBe(0);
    expect(seen).not.toContain(1);
  });
});
