import { describe, expect, it } from 'vitest';

import { humanSideOfMatch } from './turing';

describe('humanSideOfMatch (Module D)', () => {
  it('finds the reserved human id on either side', () => {
    expect(humanSideOfMatch('human', 'openrouter:x')).toBe('p1');
    expect(humanSideOfMatch('openrouter:x', 'human')).toBe('p2');
    // The persisted human id is namespaced `human:<uuid>` once a player is known.
    expect(humanSideOfMatch('human:abc-123', 'openrouter:x')).toBe('p1');
    expect(humanSideOfMatch('openrouter:x', 'human:abc-123')).toBe('p2');
  });

  it('returns null when neither side is the human (should never be in the pool)', () => {
    expect(humanSideOfMatch('openrouter:a', 'openrouter:b')).toBeNull();
    // A model id that merely contains "human" as a substring must not match.
    expect(humanSideOfMatch('openrouter:superhuman', 'openrouter:b')).toBeNull();
  });
});
