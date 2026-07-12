# DECISIONS

Jednozdaniowe decyzje podejmowane tam, gdzie SPEC.md nie rozstrzyga (zgodnie z
regułą 5 promptu startowego). Najnowsze na górze.

## Dobór bibliotek i wersji (zweryfikowany względem rejestru npm)

- **Najnowsze kompatybilne wersje, potwierdzone peer-dependency graph** (nie z pamięci): React **19.2.7** (na życzenie użytkownika, nadpisuje literalne „React 18" ze SPEC §3 — react-router 8 i tak wymaga `react >=19.2.7`), TypeScript **5.9.3** (najnowszy w pełni kompatybilny z ekosystemem; TS 7.0 istnieje, ale drizzle-kit/vitest mogą jeszcze nie nadążać), Vite **8.1**, Vitest **4.1.10** (pin dokładny — `@vitest/coverage-v8` ma exact peer na tę wersję), @vitejs/plugin-react **6** (wymaga vite `^8`), Tailwind **4.3**, Zod **4.4** (akceptowany przez `@hono/zod-validator` i `drizzle-zod`), Hono **4.12**, Drizzle ORM **0.45** / kit **0.31**, Recharts **3.9**, jose **6**, testcontainers **12**.
- **Weryfikacja doboru SPEC §3**: stack jest nowoczesny i trafny — żadna narzucona biblioteka nie jest złym wyborem. Recharts „wystarczający" (nie najbardziej efektowny, ale obsługuje wszystkie 5 wykresów + eksport PNG; wymiana na visx nieopłacalna). Nie zamieniam żadnej biblioteki ze SPEC.
- **Biblioteki-kleje, których SPEC nie nazywa** (uzupełnienie, nie zamiana): `react-router` 8 (trasy /replay/:id, /model/:id), `@tanstack/react-query` 5 (cache server-state: leaderboard 60 s, karty, powtórki, polling), `zod` 4 + `@hono/zod-validator` (walidacja wejścia API — wymóg §15), `drizzle-zod`, `postgres` (postgres.js — lekki sterownik), `jose` (JWT), własny mulberry32 (seedowany RNG statków/wyzwania dnia, zero zależności).

## Stage 1 — fundament monorepo + game-core (tic-tac-toe)

- **Node 24 zamiast 22 LTS**: lokalnie dostępny jest Node 24.14; `engines.node` przypięte do `>=22`, więc 22 LTS pozostaje wspieranym targetem produkcyjnym.
- **Scope pakietów `@arena/*`**: `@arena/game-core`, `@arena/web`, `@arena/server` — krótkie, neutralne, niezależne od nazwy repo.
- **`game-core` eksportuje źródła TS** (`exports: "./src/index.ts"`), bez kroku build w dev/test; konsumenci używają `moduleResolution: "Bundler"`. Produkcyjny build serwera zbandluje `game-core` (esbuild/tsup) w Stage 8.
- **Runner testów**: `pnpm -r --if-present run test` (każdy pakiet ma własny `vitest`), zamiast centralnego vitest workspace — brak edge-case'ów z pustymi katalogami, pełna izolacja środowisk (node vs jsdom).
- **`strict: true` włączone; `noUncheckedIndexedAccess` wyłączone** dla prędkości pisania silnika (stały rozmiar plansz). Do rewizji, jeśli pojawią się bugi indeksowe.
- **`verbatimModuleSyntax: true`**: dyscyplina `import type` w całym repo (nowoczesny ESM, zero konfuzji typ/wartość).
- **Tożsamość git**: `Dariusz Tyszka <dariusz.tyszka@gmail.com>` (globalna, prywatna) — to prywatny projekt poboczny, nie repo GPF, więc bez służbowego e-maila/organizacji.
- **Nazwa repo `tic-bot-toe`**, prywatne, w `Documents/GitHub/` (konwencja projektów prywatnych).
