import type { ChatCompletion, ChatMessage } from './llm-runner';

/**
 * Exercises the optional GameDefinition hooks (plan §3) through the real
 * llm-runner: `validateMove` (legality on the view), `renderCorrection` (custom
 * corrective message, no legal-list dump) and `fallbackMove` (forfeit
 * substitute). getGame is mocked to a synthetic game that defines all three —
 * tic-tac-toe/battleship, which define none, are covered by llm-runner.test.ts
 * and prove the DEFAULT paths are unchanged.
 */

// vi.mock is hoisted above imports; the fake def must be hoisted too so the
// factory can close over it.
const { fakeDef, calls } = vi.hoisted(() => {
  const calls: { validate: string[] } = { validate: [] };
  const fakeDef = {
    id: 'scrabble',
    renderPrompt: () => ({ system: 'system prompt', user: 'user prompt' }),
    // Syntactic parse only: pull the token after "play:". No legality here.
    parseMove: (raw: string): string | null => {
      const m = raw.match(/play:\s*(\S+)/);
      return m ? m[1] : null;
    },
    // Legality decided on the view: only GOOD is accepted.
    validateMove: (_view: unknown, move: string) => {
      calls.validate.push(move);
      return move === 'GOOD'
        ? { ok: true as const }
        : { ok: false as const, reason: `"${move}" is not a valid word` };
    },
    renderCorrection: (_view: unknown, rejection?: { reason: string }) =>
      rejection ? `Invalid: ${rejection.reason}` : 'Could not read your move.',
    fallbackMove: () => 'PASS',
  };
  return { fakeDef, calls };
});

vi.mock('@arena/game-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arena/game-core')>();
  return { ...actual, getGame: () => fakeDef };
});

import { runLlmMove } from './llm-runner';

/** Minimal scripted transport (last response repeats); records the messages. */
function scriptedTransport(steps: ChatCompletion[]) {
  const seen: ChatMessage[][] = [];
  let i = 0;
  const transport = async (messages: ChatMessage[]): Promise<ChatCompletion> => {
    seen.push(messages.map((m) => ({ ...m })));
    const step = steps[Math.min(i, steps.length - 1)];
    i += 1;
    return step;
  };
  return { transport, seen };
}

// The runner only reads `view.game` (to resolve the def, which is mocked); any
// object is fine.
const view = { game: 'scrabble', side: 'p1' } as never;
const legal = ['PASS'];

beforeEach(() => {
  calls.validate = [];
});

describe('runLlmMove — GameDefinition hooks', () => {
  it('accepts a parsed move that validateMove approves', async () => {
    const { transport } = scriptedTransport([{ text: 'play: GOOD' }]);
    const result = await runLlmMove(view, legal, { transport });
    expect(result.move).toBe('GOOD');
    expect(result.telemetry.forfeit).toBe(false);
    expect(calls.validate).toEqual(['GOOD']);
  });

  it('rejects via validateMove and corrects with renderCorrection (no legal-list dump)', async () => {
    const { transport, seen } = scriptedTransport([
      { text: 'play: BADWORD' },
      { text: 'play: GOOD' },
    ]);
    const result = await runLlmMove(view, legal, { transport });

    expect(result.move).toBe('GOOD');
    expect(result.telemetry.retries).toBe(1);
    // Second call carries the model's bad answer + the game's custom correction.
    const correction = seen[1][3];
    expect(correction.role).toBe('user');
    expect(correction.content).toBe('Invalid: "BADWORD" is not a valid word');
    // The corrective message must NOT dump the legal list (plan §3).
    expect(correction.content).not.toContain('PASS');
  });

  it('uses fallbackMove on forfeit instead of a random legal move', async () => {
    const { transport } = scriptedTransport([{ text: 'play: NOPE' }]);
    const result = await runLlmMove(view, legal, { transport, rng: () => 0.99 });

    expect(result.telemetry.forfeit).toBe(true);
    expect(result.telemetry.retries).toBe(3);
    expect(result.move).toBe('PASS'); // fallbackMove, not a random pick
    expect(result.telemetry.error).toBe('bad_output');
  });

  it('renders the parse-failure correction when parseMove returns null', async () => {
    const { transport, seen } = scriptedTransport([
      { text: 'total gibberish' },
      { text: 'play: GOOD' },
    ]);
    const result = await runLlmMove(view, legal, { transport });

    expect(result.move).toBe('GOOD');
    // No rejection reason → the generic correction branch.
    expect(seen[1][3].content).toBe('Could not read your move.');
    // parseMove failed, so validateMove was only called for the successful retry.
    expect(calls.validate).toEqual(['GOOD']);
  });

  it('captures an illegal move with the engine reason and what was attempted (Module B, D4)', async () => {
    const { transport } = scriptedTransport([{ text: 'play: BADWORD' }, { text: 'play: GOOD' }]);
    const result = await runLlmMove(view, legal, { transport });

    expect(result.move).toBe('GOOD');
    // The parsed-but-rejected attempt is recorded — this is the museum's gold.
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections![0]).toMatchObject({
      kind: 'illegal',
      attempted: 'BADWORD',
      reason: '"BADWORD" is not a valid word',
      raw: 'play: BADWORD',
    });
  });
});
