import type { pl } from './pl';

/**
 * `pl` is the SOURCE OF TRUTH for the copy: `Dict` is derived from it, so a key
 * added to `pl.ts` is a build error in `en.ts` until it is translated. That is the
 * point — a half-translated dictionary is worse than none, because the gap only
 * ever shows up in front of a user.
 *
 * (The `Locale` type itself lives in `@arena/i18n`, shared with the server.)
 */

/**
 * Widen the literal types produced by `as const` ('Arena' → string) while keeping
 * the SHAPE (and `readonly`) intact. Without this, `Dict` would demand that the
 * English dictionary repeat the Polish strings verbatim.
 */
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends (...args: infer A) => infer R
        ? (...args: A) => Widen<R>
        : T extends readonly (infer U)[]
          ? readonly Widen<U>[]
          : T extends object
            ? { readonly [K in keyof T]: Widen<T[K]> }
            : T;

export type Dict = Widen<typeof pl>;
