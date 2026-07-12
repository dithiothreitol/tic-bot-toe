import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  bundle: true,
  // Inline all deps (incl. the workspace @arena/game-core TS source) so the
  // runtime image needs only node + dist/index.js + drizzle/*.sql + web dist.
  noExternal: [/.*/],
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: false,
  // Shim require() for any CJS deps pulled into the ESM bundle (postgres.js, …).
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
});
