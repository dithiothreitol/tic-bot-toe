import { describe, expect, it } from 'vitest';

import { enqueue } from './ollama';

describe('ollama single-flight queue', () => {
  it('runs at most one job at a time (b waits for a)', async () => {
    const events: string[] = [];
    let resolveA!: () => void;
    const aDone = new Promise<void>((r) => {
      resolveA = r;
    });

    const pA = enqueue(async () => {
      events.push('a');
      await aDone;
    });
    const pB = enqueue(async () => {
      events.push('b');
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual(['a']); // b hasn't started while a is in-flight

    resolveA();
    await Promise.all([pA, pB]);
    expect(events).toEqual(['a', 'b']);
  });

  it('keeps flowing after a job throws', async () => {
    await enqueue(async () => {
      throw new Error('boom');
    }).catch(() => undefined);
    const after = await enqueue(async () => 'ok');
    expect(after).toBe('ok');
  });
});
