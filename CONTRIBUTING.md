# Contributing to tic-bot-toe

Thanks for your interest in improving the LLM Game Arena! This project is a
pnpm monorepo — contributions of all sizes are welcome, from typo fixes to new
game engines.

## Ground rules

- Be respectful — this project follows the [Code of Conduct](./CODE_OF_CONDUCT.md).
- Open an issue before starting non-trivial work, so we can align on approach.
- Keep pull requests focused: one logical change per PR.

## Getting started

```bash
# Requires Node ≥ 22 and pnpm 10 (see package.json → packageManager)
pnpm install
cp .env.example .env        # fill in values; DATABASE_URL is optional for play-only
pnpm dev:server             # backend  :8080
pnpm dev                    # frontend :5173
```

See the [README](./README.md) for architecture and the full quick start.

## Before you open a PR

Please make sure the following pass locally:

```bash
pnpm typecheck                                   # strict TypeScript
pnpm test                                        # unit tests (game-core + server + web)
pnpm --filter @arena/server test:integration     # testcontainers — needs Docker
```

Guidelines:

- **Match the surrounding code style** — the repo uses strict TypeScript with no
  DOM/Node dependencies in `packages/game-core` (it must run in both the browser
  and the server).
- **Add tests** for behavior changes, especially anything in `game-core`
  (engines, solvers, Elo, replay) — this is the trusted core.
- **Don't weaken the security invariants** described in the README: the
  OpenRouter key must never reach the backend, and ranked results must always be
  server-verified.
- **Keep i18n in sync** — `apps/web/src/i18n/pl.ts` is the source of truth and its
  type is derived from it, so a new key won't compile until it's also added to
  `en.ts`.
- **Never commit secrets.** `.env` is gitignored; put example values in
  `.env.example`.

## Commit messages

Conventional-commit style is used in history (e.g. `feat(game): …`,
`fix(server): …`). Messages may be in English or Polish — clarity matters more
than language.

## Reporting bugs & requesting features

Use the [issue templates](https://github.com/dithiothreitol/tic-bot-toe/issues/new/choose).
For security issues, follow [SECURITY.md](./SECURITY.md) instead of opening a
public issue.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE).
