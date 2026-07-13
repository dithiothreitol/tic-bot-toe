<!-- Thanks for contributing! Please keep PRs focused on one logical change. -->

## What & why

<!-- What does this PR change, and what problem does it solve? Link any related issue: Closes #123 -->

## How it was tested

<!-- Commands run, scenarios exercised. -->

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] Integration/e2e run if relevant (`pnpm --filter @arena/server test:integration`, `pnpm e2e`)

## Checklist

- [ ] I read [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] Added/updated tests for behavior changes (especially in `game-core`)
- [ ] i18n keys added to both `pl.ts` and `en.ts` (if UI strings changed)
- [ ] No secrets committed; no new secret sent to the backend
- [ ] Server-side result verification and BYOK key isolation are preserved
