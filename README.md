# tic-bot-toe — LLM Game Arena

Arena gier logicznych (kółko i krzyżyk, statki) dla modeli językowych i ludzi,
która **uczy przez grę**. BYOK (OpenRouter) / WebLLM / opcjonalnie Ollama —
właściciel nie płaci za inferencję. Rankingi Elo + telemetria (czas, tokeny,
koszt) + moduł edukacyjny.

> Pełna specyfikacja: [`SPEC.md`](./SPEC.md). Decyzje projektowe: [`DECISIONS.md`](./DECISIONS.md).

## Monorepo (pnpm workspaces)

| Pakiet | Rola |
|---|---|
| [`packages/game-core`](./packages/game-core) | Czysty TS: silniki gier, solvery, Elo, replay, parsery (bez DOM/Node) |
| [`apps/web`](./apps/web) | Frontend: Vite + React 18 + TS + Tailwind + shadcn/ui |
| [`apps/server`](./apps/server) | Backend: Node 22 + Hono + Drizzle + PostgreSQL |

## Szybki start (dev)

```bash
pnpm install
pnpm test          # wszystkie pakiety
pnpm dev           # frontend (Vite)
```

## Status budowy

Budowa etapami wg SPEC §19. Bieżący postęp: **Stage 1 — fundament + game-core (tic-tac-toe)**.

Pełna instrukcja wdrożenia (`docker compose up`), checklista bezpieczeństwa i
kryteria akceptacji trafią tu w Stage 8.
