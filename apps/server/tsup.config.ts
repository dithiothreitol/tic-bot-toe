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
  // …except @napi-rs/canvas: a native module (ships .node binaries) that cannot
  // be bundled. The catch-all noExternal above would otherwise force it in, so an
  // esbuild onResolve hook wins and keeps it (and any .node) external. Installed
  // in the runtime image (see deploy/Dockerfile).
  external: ['@napi-rs/canvas'],
  esbuildPlugins: [
    {
      name: 'external-native-canvas',
      setup(build) {
        build.onResolve({ filter: /^@napi-rs\/canvas$/ }, () => ({ external: true }));
        build.onResolve({ filter: /\.node$/ }, (args) => ({ path: args.path, external: true }));
      },
    },
  ],
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
