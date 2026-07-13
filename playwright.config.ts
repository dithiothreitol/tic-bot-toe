import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests in a REAL browser (SPEC §20 acceptance: "partie do końca w obu
 * grach i trybach"). Everything else in this repo tests pieces; this is the only
 * thing that answers the question a user actually asks: *can I click a square and
 * play?*
 *
 * Uses the locally installed Chrome (`channel: 'chrome'`) so nothing has to be
 * downloaded. Point BASE_URL at a running app (docker compose → :8093).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000, // real models think; battleship is long
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8093',
    channel: 'chrome',
    headless: true,
    actionTimeout: 20_000,
    trace: 'off',
  },
});
