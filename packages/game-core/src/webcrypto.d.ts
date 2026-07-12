/**
 * Minimal ambient declarations for the Web Crypto + TextEncoder globals used by
 * `movesHash`. Both are standard in browsers and Node ≥ 20, so we declare just
 * the surface we use rather than pulling the whole DOM lib into this pure
 * (DOM-free) package.
 */
declare const crypto: {
  subtle: {
    digest(algorithm: string, data: ArrayBufferView | ArrayBuffer): Promise<ArrayBuffer>;
  };
};

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
