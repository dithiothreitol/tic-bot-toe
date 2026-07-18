import { expect, test } from '@playwright/test';

/**
 * The „efekt wow" public pages render end-to-end (Module B/D, plan §4/§6). Unlike
 * `human-play.spec.ts` these need NO API key and NO model — they are public reads
 * that must survive an empty database (show an empty state, never a blank/error
 * page). They only need a running app + server (docker compose → :8093, or point
 * BASE_URL at the dev stack).
 *
 * Polish UI: the config pins the browser to pl-PL, so `/` and these paths serve
 * Polish labels.
 */

test.describe('Muzeum wpadek (Module B)', () => {
  test('loads with heading + lead and either fails or an empty state', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('/muzeum-wpadek');
    await expect(page.getByRole('heading', { name: /Muzeum wpadek/i })).toBeVisible();
    // The lead always renders (it explains what "hallucination" means here).
    await expect(page.getByText(/Nielegalne i niezrozumiałe ruchy/)).toBeVisible();
    expect(errors, `page errors: ${errors.join('; ')}`).toHaveLength(0);
  });

  test('is reachable from the top nav', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Wpadki' }).click();
    await expect(page).toHaveURL(/\/muzeum-wpadek$/);
    await expect(page.getByRole('heading', { name: /Muzeum wpadek/i })).toBeVisible();
  });
});

test.describe('Tryb Turinga (Module D)', () => {
  test('loads with the question OR an empty state, plus the detective ranking', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto('/turing');
    await expect(page.getByRole('heading', { name: /Kto jest botem/i })).toBeVisible();
    await expect(page.getByText('Ranking detektywów')).toBeVisible();

    // Depending on whether the pool has a puzzle, one of these must show.
    const question = page.getByText('Który gracz to człowiek?');
    const empty = page.getByText(/Brak zagadek/);
    await expect(question.or(empty)).toBeVisible();
    expect(errors, `page errors: ${errors.join('; ')}`).toHaveLength(0);
  });

  test('is reachable from the top nav', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Turing' }).click();
    await expect(page).toHaveURL(/\/turing$/);
    await expect(page.getByRole('heading', { name: /Kto jest botem/i })).toBeVisible();
  });
});
