import { expect, type Page, test } from '@playwright/test';

/**
 * Can a HUMAN actually play? (SPEC §20)
 *
 * Everything else in this repo tests parts: engines, providers, the server, and
 * `smoke:live` (which is model-vs-model — no person in the loop). Nothing ever
 * clicked a square. These tests do exactly what a user does: open the page, pick
 * a model, put an X on the board, and shoot at ships.
 *
 * They run against a REAL browser and a REAL model, so they need
 * OPENROUTER_API_KEY (gitignored .env) and a running app (docker compose → :8093).
 */

const KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.E2E_MODEL ?? 'openai/gpt-4o-mini';

test.skip(!KEY, 'brak OPENROUTER_API_KEY — pomijam e2e z prawdziwym modelem');

/** Seed the key the way the app itself stores it: localStorage only (§16). */
async function seedKey(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    localStorage.setItem(
      'arena-settings',
      JSON.stringify({
        state: { openRouterKey: key, soundEnabled: false, nickname: null, playerToken: 'e2eE2eE2eE2eE2eE2eE2eE2eE2eE2eE2' },
        version: 1,
      }),
    );
  }, KEY!);
}

/** Pick the opponent in the ModelPicker (a shadcn combobox: trigger → search → option). */
async function pickModel(page: Page): Promise<void> {
  // In human-vs-model there is exactly one picker (the opponent).
  await page.getByRole('combobox').last().click();
  await page.getByPlaceholder(/szukaj modelu/i).fill(MODEL);
  await page.getByRole('option', { name: new RegExp(MODEL.split('/')[1]!, 'i') }).first().click();
}

test.describe('człowiek gra w kółko i krzyżyk', () => {
  test('klika pole, stawia X, model odpowiada O, partia dochodzi do końca', async ({ page }) => {
    await seedKey(page);
    await page.goto('/');

    // Human vs model is the default tab; just choose the opponent and start.
    await pickModel(page);
    await page.getByRole('button', { name: /^start$/i }).click();

    // The board must be there and CLICKABLE — this is the whole product promise.
    const centre = page.getByRole('button', { name: /^Pole 4/ });
    await expect(centre).toBeEnabled();

    await centre.click();

    // My X actually landed.
    await expect(page.getByRole('button', { name: /^Pole 4, X/ })).toBeVisible();

    // The model answers with an O somewhere.
    await expect(page.getByRole('button', { name: /, O$/ })).toHaveCount(1, { timeout: 60_000 });

    // Keep playing whatever is free until the match ends.
    for (let turn = 0; turn < 4; turn++) {
      const over = await page.getByText(/wygrywasz|porażka|remis/i).isVisible().catch(() => false);
      if (over) break;
      const free = page.getByRole('button', { name: /^Pole \d, puste$/ });
      const n = await free.count();
      if (n === 0) break;
      await free.first().click();
      await page.waitForTimeout(1200); // let the model move (and satisfy human pacing)
    }

    // A finished match shows a verdict and offers the ranking save.
    await expect(page.getByText(/wygrywasz|porażka|remis/i).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: /rewanż/i })).toBeVisible();
    if (process.env.E2E_SHOTS) {
      await page.screenshot({ path: `${process.env.E2E_SHOTS}/human-tictactoe.png`, fullPage: true });
    }

    // Telemetry for the model's moves is real, not blank.
    await expect(page.getByText(/tok/).first()).toBeVisible();
  });
});

test.describe('człowiek gra w Sudoku Duel', () => {
  test('klika puste pole, wybiera cyfrę, wynik i log się aktualizują', async ({ page }) => {
    await seedKey(page);
    await page.goto('/');

    // Sudoku tile → default variant is mini (4×4), human moves first.
    await page.getByRole('tab', { name: /sudoku/i }).click();
    await pickModel(page);
    await page.getByRole('button', { name: /^start$/i }).click();

    // The sudoku board is on screen and it is the human's turn (p1 first).
    await expect(page.getByRole('grid', { name: /plansza sudoku/i })).toBeVisible();

    // Tap the first empty cell that is clickable, then pick the first allowed digit.
    const emptyCell = page.getByRole('button', { name: /puste$/ }).first();
    await expect(emptyCell).toBeEnabled({ timeout: 30_000 });
    await emptyCell.click();

    const digit = page.getByRole('button', { name: /^Wpisz cyfrę \d$/ }).first();
    await expect(digit).toBeVisible();
    await digit.click();

    // The placement registered: it shows in the log with a ✓/✗ outcome.
    await expect(page.getByText(/log partii/i)).toBeVisible();
    await expect(page.getByText(/#1/).first()).toBeVisible();
    await expect(page.getByText(/✓ \+1|✗ −1/).first()).toBeVisible({ timeout: 30_000 });
    if (process.env.E2E_SHOTS) {
      await page.screenshot({ path: `${process.env.E2E_SHOTS}/human-sudoku.png`, fullPage: true });
    }
  });
});

test.describe('człowiek gra w statki', () => {
  test('rozstawia flotę, strzela i widzi trafienia/pudła', async ({ page }) => {
    await seedKey(page);
    await page.goto('/');

    await page.getByRole('tab', { name: /statki/i }).click();
    await pickModel(page);
    await page.getByRole('button', { name: /^start$/i }).click();

    // 1. Ship placement must work before anything else.
    await expect(page.getByText(/klikaj pola, aby stawiać statki/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'A1', exact: true })).toBeVisible();
    const ready = page.getByRole('button', { name: /^gotowe$/i });
    await expect(ready).toBeDisabled(); // cannot start with an unplaced fleet

    await page.getByRole('button', { name: /rozstaw losowo/i }).click();
    await expect(page.getByText(/cała flota rozstawiona/i)).toBeVisible();
    await expect(ready).toBeEnabled();
    await ready.click();

    // 2. Now the shooting board: my own fleet + the tracking grid.
    await expect(page.getByText(/twoja flota/i)).toBeVisible();
    await expect(page.getByText(/twoje strzały/i)).toBeVisible();

    // 3. Fire at the TRACKING board (my own fleet's cells are disabled by design).
    const tracking = page.locator('[data-board="tracking"]');
    await expect(tracking).toBeVisible();

    const shots = ['C3', 'D4', 'B2', 'E5', 'A1', 'F6', 'C5', 'D2', 'A5', 'E2', 'B6', 'F1'];
    // While the model is thinking, EVERY tracking cell is disabled — so "a cell is
    // clickable again" is exactly "it is my turn again". Wait for that, not a clock.
    const anyTarget = tracking.locator('button:not([disabled])').first();

    let fired = 0;
    for (const coord of shots) {
      const finished = await page
        .getByText(/wygrywasz|porażka/i)
        .isVisible()
        .catch(() => false);
      if (finished) break;

      try {
        await expect(anyTarget).toBeVisible({ timeout: 60_000 }); // my turn came back
      } catch {
        break; // game over, or the model got stuck — either way, stop
      }

      const cell = tracking.getByRole('button', { name: coord, exact: true });
      if (!(await cell.isEnabled().catch(() => false))) continue; // already fired there
      await cell.click();
      fired += 1;
      // The shot REGISTERED — that square is no longer a legal target.
      await expect(cell).toBeDisabled({ timeout: 30_000 });
    }

    expect(fired).toBeGreaterThanOrEqual(4);

    // 4. Hits and misses are actually rendered on the tracking grid.
    const marked = await tracking.locator('button:not([disabled])').count();
    const total = await tracking.getByRole('button').count();
    expect(total - marked).toBeGreaterThanOrEqual(fired); // fired cells are now spent

    // 5. My shots landed in the log, with coordinates.
    await expect(page.getByText(/log partii/i)).toBeVisible();
    await expect(page.getByText(/#1/).first()).toBeVisible();
    if (process.env.E2E_SHOTS) {
      await page.screenshot({ path: `${process.env.E2E_SHOTS}/human-battleship.png`, fullPage: true });
    }
  });
});
