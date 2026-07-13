import type { Dict } from './types';

/**
 * Variant name for the UI. `@arena/game-core` ships a `label` on every variant,
 * but it is Polish — the engine predates the second locale. Rather than move UI
 * copy into the engine, the UI resolves the name from the dictionary by id and
 * falls back to the raw id for a variant the dictionary has not heard of.
 */
export function variantLabel(t: Dict, id: string): string {
  return (t.variants as Record<string, string | undefined>)[id] ?? id;
}
