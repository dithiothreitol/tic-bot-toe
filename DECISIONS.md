# DECISIONS

Jednozdaniowe decyzje podejmowane tam, gdzie SPEC.md nie rozstrzyga (zgodnie z
regułą 5 promptu startowego). Najnowsze na górze.

## Stage 5 — backend (Hono)

- **`apps/server`**: Hono + `@hono/node-server`. `buildApp(deps)` z wstrzykiwanym `fetch`/`now` (testy bez sieci/zegara), `index.ts` odpala `serve` + `serveStatic` (front z `dist` na jednym porcie, fallback SPA na index.html).
- **JWT (jose, HS256, 30 min, `jti`)** — `signSession`/`verifySession`; `jti` będzie spalane przy zapisie wyniku (Etap 6). Sekret z env; dev-fallback `dev-insecure-…` z ostrzeżeniem.
- **Turnstile**: `verifyTurnstile` → siteverify; domyślny sekret = klucz testowy Cloudflare `1x000…AA` (zawsze przechodzi) tylko dla dev. `/api/verify`: Turnstile→JWT lub 403.
- **Rate limiting**: in-memory sliding window per IP (`verify` 30/h); `X-Forwarded-For` tylko gdy `TRUSTED_PROXY=true`; IP z `getConnInfo` (fallback `unknown` w testach).
- **CSP (§16)**: `connect-src` = self + openrouter.ai + challenges.cloudflare.com + HF/MLC CDN (wagi WebLLM); `script-src` z `'wasm-unsafe-eval'`, `worker-src blob:` (runtime web-llm). + HSTS, nosniff, Referrer-Policy.
- **Dev przez `tsx`** (`node --import tsx --watch`), `--env-file-if-exists`. Produkcyjny bundle (tsup, inline `game-core`) w Etapie 8.

## Stage 4 — WebLLM

- **`@mlc-ai/web-llm` ładowany dynamicznym `import()`** — trafia do osobnego, leniwego chunku (~6 MB), więc główny bundle zostaje ~428 kB; wagi modelu pobierają się dopiero przy pierwszym użyciu modelu lokalnego.
- **`SelectableModel`** (`provider: 'openrouter' | 'webllm'`) — jedna abstrakcja modelu w pickerze/setupie; `makePlayer` rozgałęzia po `kind`.
- **WebLLM = darmowy, bez klucza**: klucz OpenRouter wymagany tylko, gdy wybrany model to `openrouter` (partia wyłącznie WebLLM startuje bez klucza). `costUsd` zawsze `undefined` (free), tokeny z runtime stats.
- **WebGPU**: `isWebGpuAvailable()` (`navigator.gpu`) bramkuje sekcję WebLLM w pickerze. Silniki cache'owane per model (`engineCache`), z eksmisją przy błędzie ładowania.
- **Pasek pobierania** przez store `useModelLoad` + `ModelLoadBar`. Abort partii nie przerywa generacji web-llm w locie (timeout runnera nadal działa) — świadome uproszczenie.

## Stage 3 — statki

- **`GameDefinition<S, M, V extends PlayerView>`** — sparametryzowane typem widoku (domyślnie `PlayerView`), żeby konkretne silniki (`ticTacToe`, `battleship`) zachowały swój widok bez rzutowań; orchestrator/runner używają domyślnego `PlayerView` przez rzut `GameDefinition<unknown, Move>`.
- **Ukryta informacja (kluczowe, §5/§20)**: `viewFor` czyta `oppShots` do decyzji „unknown vs ujawnij" — pola nieostrzelane zawsze `unknown`, więc rozstawienie wroga NIGDY nie trafia do widoku. Pilnowane testem (każde nieostrzelane pole = `unknown`, serializacja bez `ships`).
- **Dodatkowy strzał po trafieniu**: `turn` przechowywany w stanie (nie da się wyliczyć z liczby ruchów); trafienie + `extraShotOnHit` → ta sama tura. Bezpiecznik pętli 2·N².
- **`serializeSetup` zapisuje OBA rozstawienia + seed** — serwer odtwarza dokładny stan (nie regeneruje). Ekran obserwacji LLM vs LLM = widok boga (dwie własne plansze przez `viewFor`).
- **Człowiek zawsze p1**; rozstawienie floty przed partią (LLM zawsze losowo z seeda). Rewanż = nowy seed (`seed + restartKey`) + ponowne rozstawienie.
- **Helpery rozstawienia** (`shipCellsAt`, `canPlaceShip`) eksportowane z silnika — UI używa przetestowanej logiki zamiast reimplementacji.

## Stage 2 — providery + orchestrator

- **Semantyka retry (SPEC §8 „maks. 3 próby")**: 1 próba wstępna + do 3 prób korygujących (max 4 wywołania), `retries` ∈ 0..3 — dokładnie zgodne z `MoveTelemetry.retries: 0..3`. `forfeit` przy wyczerpaniu 3 retry → losowy legalny ruch.
- **Współdzielony `llm-runner`**: cała logika retry/forfeit/telemetrii jest jedna, providery (OpenRouter, później WebLLM/Ollama) dostarczają tylko `ChatTransport`. Prompt budowany wyłącznie z `PlayerView` przez `game.renderPrompt`.
- **`currentPlayer(state)` dodane do `GameDefinition`** — generyczne ustalanie tury (kluczowe dla statków: dodatkowy strzał po trafieniu). Orchestrator nie zna reguł tur.
- **Klucz OpenRouter**: wyłącznie w `localStorage` (zustand persist `arena-settings`), wysyłany wyłącznie do `openrouter.ai` — pilnowane testem-strażnikiem (`openrouter.test.ts`).
- **`human_vs_model`**: człowiek zawsze jako p1 (X). `model_vs_model`: oba sloty LLM.
- **Toaster (sonner) uproszczony** — usunięty `next-themes` (aplikacja dark-only), motyw na sztywno `dark`.
- **`lucide-react` dodany ręcznie** — shadcn CLI dodał pliki komponentów importujące lucide, ale nie dopisał paczki do `package.json`.
- **`react-router` odłożony** do etapu z trasami (6/11); w Etapie 2 przełączanie ekranów przez `useState` (setup ↔ game), bez przedwczesnej zależności.

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
