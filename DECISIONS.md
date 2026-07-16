# DECISIONS

Jednozdaniowe decyzje podejmowane tam, gdzie SPEC.md nie rozstrzyga (zgodnie z
regułą 5 promptu startowego). Najnowsze na górze.

## Sudoku + Scrabble — Etap 1: silnik Sudoku Duel (plan §4)

- **`sudoku.ts`** — pojedynek turowy na wspólnej planszy z jednoznacznym rozwiązaniem: generator seedowany (`generateSolution` backtracking + `digHoles` z odcięciem liczby rozwiązań na 2 = gwarancja jednoznaczności), scoring +1/−1 z cofnięciem błędnego wpisu, twardy limit `3× puste pola`, `validateMove`/`renderCorrection` (bez listy kandydatów), `evaluateMove` (naked/hidden single→optimal, poprawny niewymuszony→good, błędny→blunder). Warianty: `mini` 4×4 (6 wskazówek), `classic6` 6×6 (14), `classic9` 9×9 (34). Rejestracja w `getGame` + `replay`. `SudokuView` bez `solution`.
- **Rejestracja w `daily` przesunięta do Etapu 3 (mikro-odstępstwo od §10 Etap 1)**: plan wymienia „rejestrację w daily" w Etapie 1, ale dodanie `sudoku` do puli `GAMES` bez obsługi wyboru wariantu w `dailyChallenge` (dziś losuje wariant tylko dla statków) dałoby wyzwania z nielegalnym wariantem `standard`. Pełna integracja daily (pula + wybór wariantu + karta + nota o atomowym wdrożeniu z §2.9) należy do Etapu 3, którego DoD wprost obejmuje „daily (pula + karta)". W Etapie 1 sudoku jest rozwiązywalne przez `getGame`/`replay` — to jest substancja rejestracji potrzebna do gry i walidacji.
- **Etykiety i18n dodane wcześnie (games/gameMeta/variants w pl+en)**: wymagane, bo rozszerzenie `GameId` o `sudoku` psuje indeksowane mapy etykiet w web. Pełne teksty UI planszy/pickerów — Etap 2.

## Sudoku + Scrabble — Etap 0: kontrakt `GameDefinition` (plan §3)

- **`GameId` rośnie per gra, nie z góry (odstępstwo od §3 planu)**: plan wymienia `GameId` = 4 gry w zakresie Etapu 0, ale rozszerzenie unii już teraz psuje `tsc` w `apps/web` — mapy etykiet indeksowane przez `GameId` (`DailyChallengeCard`, `GameRunner`, `LeaderboardPage`, `ReplayPage`) muszą być wyczerpujące. Decyzja (reguła #3): `GameId`, unia `PlayerView` i mapy etykiet rosną **w parze z silnikiem** — `'sudoku'` w Etapie 1, `'scrabble'` w Etapie 5. Etykiety i i18n gier należą i tak do Etapów 2/6 (oba pliki pl+en). Etap 0 zostaje w pełni wstecznie zgodny (zielone testy **i** typecheck).
- **Trzy opcjonalne hooki kontraktu** (`types.ts`) z domyślnymi ścieżkami zachowanymi dla kółka i statków: `validateMove(view, move)` (legalność z WIDOKU dla gier o nieenumerowalnym/ukrytym zbiorze ruchów), `renderCorrection(view, rejection?)` (komunikat korygujący bez wypisywania listy legalnych), `fallbackMove(view, legal, rng)` (ruch zastępczy przy forfeicie — np. scrabble→`PASS`). Nowy typ `MoveValidation = {ok:true} | MoveRejection`.
- **`mulberry32` wydzielone do `rng.ts`** (współdzielone przez statki/sudoku/scrabble) — czysty PRNG, ten sam strumień w przeglądarce i na serwerze. Regresja: statki generują identyczne floty dla tego samego seeda (test w `rng.test.ts`).
- **`llm-runner.ts`**: `parseMove` odzyskuje ruch SKŁADNIOWO, legalność = `def.validateMove?.(view, parsed) ?? legal.includes(parsed)`; korekta = `def.renderCorrection?.(...) ?? correction(legal)`; forfeit = `def.fallbackMove?.(...) ?? losowy legalny`. **`replay.ts`**: legalność w pętli przez `validateMove` gdy zdefiniowane, inaczej `legalMoves().includes`. Kółko i statki (brak hooków) — zero zmian zachowania. Wiring hooków przetestowany na syntetycznej grze (`llm-runner.hooks.test.ts`).

## Moduł 11 — Powtórki + OG + SEO (SPEC §11; SEO na życzenie: kompletne, profesjonalne, agent-friendly)

- **Powtórka `/replay/:id`** (publiczna, bez JWT/klucza — §20.7): `ReplayPage` czyta partię z istniejącego `GET /api/replay/:id` (zero dodatkowego stanu, §11). `ReplayPlayer`: odtwarzacz krok-po-kroku (⏮◀ Odtwórz ▶⏭, auto-play 900 ms), plansza (kółko: `Board3x3` z ringiem jakości; statki: widok boga dwóch flot), `TimelineChart`, Precyzja per gracz, kolorowana lista ruchów (blunder na czerwono). Wspólny `lib/match-states.ts` (rekonstrukcja stanów) używany też przez `AnalysisView`.
- **`GET /api/og/:id` — PNG przez `@napi-rs/canvas`** (SPEC nazywa tę bibliotekę). 1200×630 w stylu HUD: tytuł „p1 vs p2" (kolory graczy, layout po zmierzonych szerokościach), podtytuł gra·wariant·wynik, **zrekonstruowana finalna plansza**, stopka. Best-effort: błąd rekonstrukcji → karta tytułowa, nigdy 500.
- **Natywny dep — świadomy wyjątek od self-contained bundla (etap 8)**: `@napi-rs/canvas` ma binaria `.node`, nie da się go zbundlować. `noExternal:[/.*/]` wymusza wszystko do środka, więc **plugin esbuild `onResolve`** trzyma go (i `*.node`) jako external. Runtime: Dockerfile instaluje tę jedną paczkę (`npm i @napi-rs/canvas@<ver>` z prebuilt binarką musl) + `apk add font-dejavu` (alpine nie ma fontów; DejaVu pokrywa polskie znaki). Zweryfikowane end-to-end na alpine (OG 1200×630 z „Kółko i krzyżyk", plansza X X X / O O).
- **„Skopiuj link"** po zapisie partii (permalink `${origin}/replay/${matchId}`) + link do powtórki na karcie wyniku.
- **SEO kompletne i profesjonalne**:
  - **Meta domyślne** w `index.html`: description, robots (`index,follow,max-image-preview:large`), theme-color, komplet Open Graph (site_name, locale pl_PL, image 1200×630), Twitter `summary_large_image`, **JSON-LD `WebApplication`**. URL-e przez `%VITE_SITE_URL%`.
  - **Serwerowe podstawianie origin do powłoki SPA**: `renderShell(origin)` zamienia `%VITE_SITE_URL%` na absolutny origin żądania dla `/`, wszystkich tras SPA i powtórek → poprawne absolutne kanoniczne/OG bez znajomości domeny w buildzie (serveStatic nadal serwuje realne pliki verbatim; jawna trasa `/` bo directory-index serwuje surowo).
  - **Per-powtórka**: `injectOgMeta` **usuwa domyślne** tagi (og/twitter/canonical/description/robots/title) i wstawia per-partię komplet + `<link rel=canonical>` + **JSON-LD `WebPage`/`Game`** (escJson chroni przed break-outem `</script>`). Zero duplikatów.
  - **Agent-friendly**: dynamiczne `robots.txt` (jawnie dopuszcza GPTBot/ClaudeBot/PerplexityBot/… + Sitemap), `sitemap.xml` (trasy statyczne + do 1000 powtórek z lastmod), **`llms.txt`** (opis + endpointy danych dla agentów).
- **Testy**: 6 SEO (`seo.test.ts`: origin/robots/sitemap/llms) + 4 meta (`meta.test.ts`: tagi/inject/dedup/escaping) + 2 render (`render.test.ts`: PNG magic, fallback bez wyjątku) + 1 integr. OG (PNG dla zapisanej partii) + integr. head-to-head/elo. **166 testów** (game-core 85, server 24 unit + 14 integr., web 43).

## Moduł 10 — Analiza + solvery (SPEC §12.2, §15.1)

- **Solvery w `game-core/solvers/`** (SPEC narzuca lokalizację): `tictactoe.ts` (pełny negamax z memoizacją — przestrzeń < 6k plansz), `battleship.ts` (heurystyka percentylowa: mapa ciepła = liczba legalnych ułożeń pozostałych statków przez każdą komórkę + tryb „polowania" po świeżym trafieniu), `index.ts` (dyspozytor `analyzeMatch(game, variant, setup, moves)` odtwarza partię TYM SAMYM silnikiem co gra/replay i klasyfikuje każdy ruch). **Nigdy nie grają w rankingu — tylko analiza (§6, §12.2).**
- **Klasyfikacja kółka wg §12.2 przez wartość gry** (tiery loss/draw/win z perspektywy grającego): `optimal` = nie pogarsza wyniku; `blunder` = wygrana→remis/przegrana lub remis→przegrana; `weak` = pogorszenie bez przekroczenia progu blundera (w 3×3 praktycznie nie występuje — zachowane dla statków, które mają wszystkie 4). Reużyty istniejący `MoveQuality` z root `types.ts` (nie duplikat).
- **Statki**: `optimal | good | weak | blunder` z percentyla mapy ciepła; strzał przy nierozwiązanym trafieniu → sąsiedni = optimal, gdzie indziej = weak; komórka o cieple 0 (nie zmieści statku) = blunder. Bez reguły no-touch w enumeracji (dla wydajności — udokumentowane; klasyczne przybliżenie).
- **Rewalidacja `eval` na serwerze (§15.1, §20.4)**: `submitResult` po replayu liczy `analyzeMatch` SAM; jeśli klient dosłał `eval.quality` niezgodny z serwerowym → **odrzuca 422 `eval_mismatch`**. `optimalMoves` liczone serwerowo i agregowane w `ratings` (kolumna już istniała) → `optimalRate` (Precyzja) staje się realne. +2 testy testcontainers (odrzucenie sfałszowanego eval; Precyzja niepusta) → **13 integracyjnych**.
- **9 testów solverów** (§20.4): minimax 100% na znanych pozycjach — **blok jako jedyny optymalny** przeciw natychmiastowej groźbie, ruch wygrywający = wartość +1, pozycja przegrana → każdy ruch „optimal" (nie da się pogorszyć); analiza znajduje moment zwrotny; heurystyka statków (polowanie/blunder/otwarta plansza).
- **Ekran analizy (klient) `AnalysisView`**: liczony z żywej partii w `GameRunner` (nie z zapisu — powtórki to moduł 11), przycisk „Analiza z trenerem" po partii. Krok-po-kroku plansza (kółko: `Board3x3` z ringiem koloru jakości — zielony/żółty/czerwony wg §12.2), Precyzja % per gracz, moment zwrotny (skok), kolorowana lista ruchów (oba warianty gier). Statki: lista ruchów + telemetria (bez pełnej rekonstrukcji plansz na tym etapie).
- **Kolumna „Precyzja"** w rankingu tylko dla kółka i krzyżyk (§12.2), ≥90% podświetlone na limonkowo.

## Moduł 9 — Wykresy / telemetria (SPEC §9.3)

- **Recharts 3.9** (dep dokładana dopiero teraz, jak planowano). Zgodny z React 19. Wszystkie 5 wykresów przez wspólną ramkę `ChartFrame` (HudPanel + `// TYTUŁ` + eksport PNG + stan pusty + „▸ co z tego wynika") — SPEC §9.3 wymaga tooltip + stan pusty + eksport PNG dla każdego.
- **Czyste transformacje w `lib/telemetry.ts`** (bez React/Recharts) — testowalne w izolacji: `buildTimeline`, `radarForSubjects` (min-max normalizacja per oś względem populacji), `buildScatter`. 6 testów jednostkowych pokrywa kryterium §9.3.3 (normalizacja vs populacja; **brak wybuchu przy < 2 podmiotach → stan pusty**; równe wartości → neutralne 50; null telemetrii WebLLM → dolny koniec bez psucia osi).
- **Radar (§9.3.2)**: 5 osi (Siła=Elo, Szybkość=−czas, Dyscyplina=1−forfeit, Oszczędność=−tokeny/ruch, Taniość=−koszt/partię), każda min-max 0–100 na populacji. Szybkość liczona ze **śr.** czasu (mediana z `matches` to nadal dług §9.2 z rdzenia — nieblokujące). Nakłada do 2 podmiotów (używany też w CompareView).
- **Scatter (§9.3.3)**: oś X = koszt/partię w skali **log** (Recharts `scale="log"`), Y = Elo, promień = liczba partii; darmowe modele (koszt 0/null) świadomie poza wykresem (log). Kolor po providerze (OpenRouter cyjan, WebLLM/Ollama limonka).
- **EloHistory (§9.3.4)**: `elo_history` **już** zapisywana w transakcji z rdzenia (etap 6) — moduł 9 dodaje tylko endpoint `GET /api/elo-history` + wykres liniowy (prepend startu 1000).
- **CompareView (§9.3.5)**: ekran `/porownaj` (nowa trasa + pozycja w nawigacji) — dwa selektory, radar nałożony + **bilans bezpośredni** z `GET /api/head-to-head` (zlicza po `p1_id/p2_id/winner`, tylko partie nie-`lab`).
- **Nowe endpointy publiczne (bez JWT)** `analytics.ts`: elo-history + head-to-head — ta sama postawa co leaderboard (agregaty nieosobowe). `avgTokensPerMove` dodane do `/api/leaderboard` (z `tokensSum/totalMoves` — kolumny już istniały). +2 testy testcontainers (elo-history uporządkowane, head-to-head z obu perspektyw) → 12 integracyjnych.
- **Radar/EloHistory montowane na ekranie rankingów** (klik wiersza → panel radar + przebieg Elo dla podmiotu) zamiast osobnej „karty modelu" — pełna karta modelu (z tekstami „Jak czytać te liczby?") należy do modułu 12; komponenty wykresów są już gotowe do ponownego użycia tam.
- **Eksport PNG** (`lib/chart-export.ts`): serializacja SVG Rechartsa → canvas (tło HUD) → pobranie, w pełni po stronie klienta (bez `/api/og`, które jest osobno w module 11).
- **Bundle**: Recharts dokłada ~270 kB gzip do głównego chunku (ładowany na ekranach gra/rankingi/porównaj). Ewentualny code-split tych tras — do rozważenia później (nieblokujące; ostrzeżenie o rozmiarze chunku istniało już przed modułem 9).
- **Weryfikacja wizualna z danymi**: compose + seed SQL (5 modeli, 6 elo_history, 6 partii) → realny zrzut rankingów (tabela + scatter z 4 bąblami, „9%" forfeit w kolorze `warn`) zgodny ze screenem 04; endpointy potwierdzone `curl` end-to-end.

## Warstwa wizualna — Cyber-HUD (handoff/DESIGN.md)

- **Źródło prawdy wyglądu = `handoff/DESIGN.md` + `handoff/screens/*.png`** (kierunek „Cyber-HUD / Tactical"). Odwzorowany na istniejącym stacku **shadcn/ui + Tailwind 4** — nie zastąpiono ani jednego komponentu shadcn; przeskórowano je w jednej warstwie tokenów.
- **Jedna warstwa tokenów w `index.css`** (zasada DESIGN §2 „nie stylizuj per komponent"): kolory HUD (`#05070C` tło, `#080D18` panel, cyjan `#35E7FF`=P1, magenta `#FF3D9A`=P2, limonka `#B6FF3C`=edu, `--danger`/`--warn`), `--radius: 0`, `clip-path`, siatka tła (`body::before`, drift), bliźniacze poświaty radialne, keyframes (`scanH`/`bracketPulse`/`gridDrift`/`think`). Semantyczne kolory wystawione też jako utility Tailwind (`text-dim`, `text-edu`, `bg-card-inset`, …) i zmapowane na zmienne shadcn (`--primary`=cyjan, `--ring`=cyjan).
- **Prymitywy `HudPanel` + `SectionLabel`** (`components/ui/hud.tsx`): panel = kanciasta powierzchnia + ramka tech; opcje `brackets` (pulsujące naroża L), `scanner` (przelot linii cyjan — tylko panele „na żywo"), `cut` (ścięty róg). `SectionLabel` = nagłówek `// SEKCJA` (mono, uppercase, `.14em`, prefiks `//` + tag numeryczny).
- **Fonty self-hosted przez `@fontsource`** (Rajdhani = chrome/nagłówki, JetBrains Mono = dane/telemetria), **nie Google Fonts CDN** — bo CSP ma `font-src 'self'` i aplikacja ma działać offline (WebLLM). Importowane tylko podzbiory **latin + latin-ext** (polskie znaki są w latin-ext), Devanagari Rajdhani nie trafia do bundla.
- **Reskin prymitywów shadcn zamiast nadpisań per-użycie**: `Button` (Rajdhani 700, uppercase, `clip-cut`; `default`=świecący cyjan, dodany wariant `edu`=limonka, `outline`=ramka+inset-glow), `Card`=płaski `hud-panel`, `Tabs` (aktywny = cyjan + `clip-tab`, uppercase), `Badge` (kanciasty, mono). Dzięki temu ekrany modułów 9–12 dostaną wygląd „za darmo".
- **Reguła brackets/scanner tylko na panelach „hero"/„na żywo"** (plansza w trakcie gry) — Card/panele zwykłe są płaskie, żeby uniknąć szumu (DESIGN §3).
- **Rekoncyliacja DESIGN §3 (primary = outline) ze screenami (primary = wypełniony cyjan)**: główne CTA są wypełnione i świecące (zgodnie ze screenami 01/03), a `outline` niesie opis „ramka + inset-glow" z §3 dla akcji drugorzędnych.
- **Uppercase realizowany przez CSS `text-transform`** (nie zmianę treści) — testy `getByText`/`getByRole(name)` pozostają zielone (DOM zachowuje oryginalną wielkość liter).
- **Ekrany modułowe (karta modelu, wyzwanie dnia, komentator, powtórki, zgadywanka) przyjmą te same prymitywy przy budowie w etapach 9–12** — teraz dostarczony jest wspólny język wizualny + rdzeniowe ekrany (arena/setup, rozgrywka, rankingi).

## Stage 7 — Ollama

- **Proxy `/api/ollama/*`** (chat+tags) za flagą `ENABLE_OLLAMA`, do `127.0.0.1:11434`. **Kolejka single-flight** (`enqueue`) — maks. 1 równoległa inferencja (jedyny provider zużywający CPU właściciela, §2.3). Kolejka przeżywa błędy pojedynczych zadań.
- **`server_verified` liczone z id** (`ollama:` w p1/p2), nie z flagi klienta — bo inferencja Ollamy faktycznie idzie przez nasz serwer.
- **Ollama zwolniona z sanity 3 s** (jak WebLLM) i darmowa (bez kosztu, tokeny z `prompt_eval_count`/`eval_count`).
- **Front**: `OllamaProvider` przez proxy; `/api/health` zwraca flagę `ollama`, `SetupScreen` pobiera modele z `/api/ollama/tags` tylko gdy włączone; grupa „Ollama (serwer)" w pickerze.

## Stage 6 — Postgres / Drizzle / rankingi

- **Serwer jest źródłem prawdy dla Elo/wyniku** (§15): `replayMatch` odtwarza partię wspólnym `game-core` i sam ustala zwycięzcę; `moves_hash` = SHA-256 (`crypto.subtle`, dostępne w przeglądarce i Node) po **stabilnym stringify** (sortowane klucze) — liczone z otrzymanego payloadu, dedup przez `UNIQUE(moves_hash)`.
- **`movesHash` w `game-core`** wymaga globali WebCrypto/`TextEncoder` — dodane minimalne `webcrypto.d.ts` (bez ciągnięcia całego DOM).
- **Transakcja zapisu**: `used_jti` (jednorazowe `jti`) → insert `matches` (dedup) → dla `lab=false`: `ratings` obu podmiotów (`SELECT … FOR UPDATE` + upsert), `updateElo` (zero-sum), `elo_history`. Rzucany `Abort` → rollback → kod HTTP. `lab=true` = tylko `matches`.
- **Sanity §15**: OpenRouter śr. czas < 3 s → 422 (WebLLM/Ollama zwolnione); tokeny > 5k/ruch lub koszt > 1 USD → zapis BEZ agregacji telemetrii (log ostrzeżenia); jti reuse/dedup → 409.
- **Leaderboard**: śr. czas z sum `latencyMsSum/totalMoves` (mediana z `matches` odłożona do §9+), cache 60 s in-memory.
- **Testy integracyjne testcontainers** rozdzielone (`test:integration`, wymaga Dockera) od szybkich unitów (`test` bez Dockera). 9 testów na prawdziwym Postgresie.
- **Frontend**: `react-router` 8, proxy Vite `/api`→8080 w dev (jeden origin jak w prod), widget Turnstile → `/api/verify` → JWT w pamięci (`useSession`), opt-in „Zapisz do rankingu" pokazuje ΔElo. Postgres.js + drizzle-kit migracje (`drizzle/`), auto-migracja przy starcie serwera.

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

## Tożsamość gracza i ochrona rankingu przed botami (plan `docs/PLAN-TOZSAMOSC-ANTYBOT.md`, T1–T3)

- **Tożsamość = bearer secret w `localStorage`, serwer trzyma tylko SHA-256.** Zero kont/PII (§16). Sekret jest jedyną rzeczą, która wiąże człowieka z jego wierszem rankingu: `ratings.subject_id = human:<players.id>`. Wyciek bazy nie pozwala podszyć się pod gracza.
- **Reużyto istniejący `settings.playerToken`** zamiast tworzyć równoległy store gracza (plan przewidywał `store/player.ts`, ale token już istniał, był persystowany i stabilny — dublowanie byłoby regresem). Nowi użytkownicy dostają `randomSecret()` (256 bit, base64url-43); walidacja serwerowa `^[A-Za-z0-9_-]{20,64}$` celowo **permisywna**, żeby stare tokeny UUID z istniejących przeglądarek dalej działały.
- **Pseudonim żyje na serwerze** (unikalność + filtr wulgaryzmów), `settings.nickname` to tylko lokalne lustro do wyświetlania. Bez pseudonimu gracz nie pojawia się w tabeli, ale Elo się kumuluje (§10).
- **Eksport/import kodu tożsamości** — świadomie dodane ponad SPEC: bez tego ta sama osoba na drugim urządzeniu zakłada nową tożsamość i nową pozycję, co przeczy celowi „jedna osoba = jeden wiersz". Kod = hasło.
- **TanStack Query pominięty** przy profilu gracza: mimo wpisu w sekcji bibliotek nigdy nie został podłączony (brak `QueryClientProvider`), a strony używają `apiGet` + `useEffect`. Trzymam się istniejącego wzorca zamiast wprowadzać zależność dla jednego widoku.
- **Pacing tokenem startu (`POST /api/match/start`)** — rdzeń antybota. Klient może skłamać w telemetrii ruchu, ale nie w zegarze serwera: `iat` z tokenu vs moment zapisu daje realny czas gry. Próg: 1 s/ruch człowieka, tolerancja 2 s, sufit 15 min (długie statki nie mogą być karane). `jti` tokenu startu wypalany w tej samej transakcji co `jti` sesji → jeden start = jeden zapis.
- **Sanity czasów człowieka** (śr. < 800 ms → odrzuć; ≥5 ruchów o rozrzucie < 10 ms → odrzuć) to warstwa tania i fałszowalna, świadomie płytka — prawdziwą robotę robi pacing. Nie rozbudowywać.
- **Limity dzienne 30/gracza i 60/IP** (tylko `lab=false`). Limit IP łapie mnożenie tożsamości z jednej maszyny — czego sam limit per-gracz nie umie.
- **Flaga precyzji tylko w statkach** (≥100 ruchów i ≥90% optymalnych): w kółko i krzyżyk perfekcyjna gra jest dla człowieka normą i flagowanie jej byłoby fałszywym alarmem. W statkach nie ma strategii doskonałej — trwałe ~90% to solver. Flaga tylko **ukrywa** gracza z tabeli (odwracalne przez `UPDATE players SET flagged_at = NULL`), nic nie kasuje i nie blokuje gry.
- **Bug naprawiony przy okazji**: token sesji nie był czyszczony po udanym zapisie, a jego `jti` jest jednorazowe — drugi zapis w ciągu 30 min zwracał 409 `jti_used` zamiast ponowić Turnstile.
- **TODO (moduły 12.5/12.6)**: `predictions`/`daily_results` nadal mają kolumnę `player_token` ze SPEC §13; przy ich finalizacji przejść na `players.id` (jedna tożsamość dla rankingu, zgadywanki i wyzwania dnia).

## Moduł 12 — edukacja i społeczność (SPEC §12.1, §12.3–§12.6)

- **Komentator dostaje widok boga — i to nie łamie §5.** Zasada „prompt tylko z `PlayerView`" istnieje po to, żeby *gracz* nie zobaczył ukrytej informacji. Komentator nie gra: nie trafia do `players` w `runMatch`, nie zwraca ruchu, nie może wpłynąć na partię. Dlatego wolno mu widzieć obie floty — i tylko dlatego. Prompt składam bezpośrednio ze stanu silnika (`describeGodView`), świadomie **omijając `viewFor`**, żeby nikt tego przypadkiem nie podłączył jako gracza.
- **Komentator nigdy nie blokuje gry.** Kolejka single-flight, `enqueue` zwraca natychmiast, błąd modelu jest połykany (komentarz to ozdoba, nie funkcja krytyczna). Spóźniony komentarz niesie własny `moveIndex`, więc trafia pod właściwy ruch. Backlog ograniczony do 3 — przy przepełnieniu wypada **najstarszy**, bo świeższa pozycja jest ciekawsza i to ona ma trafić na ekran.
- **Komentator nie komentuje każdego ruchu** (`shouldComment`): blunder, otwarcie, finał i co trzeci ruch. Komentowanie wszystkiego byłoby szumem i kosztowałoby użytkownika pieniądze za nic.
- **Opis modelu generowany szablonem reguł, nie modelem** (§12.3, `lib/model-copy.ts`). Trzy powody, wszystkie twarde: LLM kosztowałby przy każdym wejściu na kartę, dawałby **inny tekst po każdym odświeżeniu**, i mógłby zmyślić fakty o modelu. Szablon jest deterministyczny, darmowy i offline — a karta modelu to element edukacyjny, więc musi być powtarzalna.
- **Dopisek laboratorium doklejany PO rdzeniu promptu** (`llm-runner`, §12.4). Kolejność jest cała istota: rdzeń z §6/§7 zawiera kontrakt formatu odpowiedzi i musi wygrać z instrukcją użytkownika, inaczej „graj agresywnie" potrafiłoby rozwalić parsowanie ruchu. Test-strażnik sprawdza, że system-prompt **zaczyna się** rdzeniem i **kończy** dopiskiem.
- **Zgadywanka: typ obstawiany przed startem partii, nie w jej trakcie.** `GameRunner` blokuje pętlę gry na stanie `pending` — partia nie rusza, dopóki widz nie wskaże strony albo nie pominie. Gdyby typować „do pierwszego ruchu", szybki model zdążyłby zagrać i typ przestałby być typem.
- **Punkty liczy serwer, nigdy klient.** `POST /api/prediction` porównuje typ ze zwycięzcą **już zapisanym w `matches`** (a ten pochodzi z serwerowego replayu, §15.1). Klient mówi wyłącznie „co obstawiłem i do której partii".
- **Anti-farming zgadywanki — trzy tanie warstwy, świadomie nie „szczelne".** Oczywisty atak to odczytać zwycięzcę skończonej partii i „obstawić" go. Blokują to: (1) **okno 10 min** od zapisu partii — starych partii nie da się dojić; (2) jeden typ na osobę na partię; (3) JWT + limit 60/h. Zgodnie z §15 przeglądarce i tak nie ufamy do końca, a to zabawa bez stawek — nie buduję pod to kryptografii.
- **Wyzwanie dnia liczone z daty, zero crona i zero stanu** (`game-core/daily.ts`). `dailyChallenge('2026-07-12')` daje ten sam wynik wszędzie i na zawsze, więc przeglądarka pokazuje wyzwanie, a **serwer niezależnie je odtwarza**, żeby zweryfikować zgłoszoną partię — obie strony zgadzają się bez żadnej komunikacji o harmonogramie. Dlatego to `game-core`, nie `apps/web`.
- **Zaliczenie dnia weryfikowane po stronie serwera na zapisanej partii**: gra, wariant, przeciwnik, strona człowieka, `lab=false`, data utworzenia i **zwycięstwo** — wszystko z `matches`, nic z deklaracji klienta. Pula przeciwników jest tylko darmowa (WebLLM + `:free`), żeby wyzwanie nigdy nie kosztowało gracza.
- **Streak nie pęka przez dzień jeszcze nierozegrany**: `streakFrom` liczy wstecz od dziś, a jeśli dziś nie ma wyniku — od wczoraj. Inaczej seria „znikałaby" każdego ranka aż do pierwszej partii.
- **`predictions.player_token` / `daily_results.player_token` trzymają SHA-256 tokenu, nie `players.id`** — to domyka TODO z sekcji T1–T3 **bez migracji**. Kolumna ze SPEC §13 zostaje, ale nigdy nie ląduje w niej surowy bearer secret (§16), a że hash **jest** `players.token_hash`, ranking intuicji dołącza się po nim do `players` i bierze pseudonim z serwera. Jedna tożsamość dla rankingu, zgadywanki i wyzwania dnia — cel osiągnięty, koszt zerowy.
- **`GET /api/model/:id{.+}` z wildcardem, nie `:id`**: identyfikatory modeli zawierają ukośniki (`openrouter:meta-llama/llama-3`), więc pojedynczy segment ścieżki by je uciął. Front z tego samego powodu ma trasę splat `/model/*`. Zweryfikowane realnym żądaniem.
- **`Slider` i `Textarea` dodane jako komponenty shadcn/ui** (radix-ui już w zależnościach), a nie natywne `<input type=range>` — twarde wymaganie użytkownika: interfejs stoi na shadcn/ui.

## Pula wyzwania dnia — obrona przed gnijącymi identyfikatorami modeli

- **Problem jest realny, nie hipotetyczny.** Sprawdzenie puli względem żywego katalogu pokazało, że `mistralai/mistral-7b-instruct:free` **już nie istnieje**. Do tego darmowe modele OpenRoutera są ostro limitowane (429).
- **Groźny jest nie sam brak modelu, tylko sposób, w jaki się to objawia.** Martwe id i 429 kończą się identycznie: wszystkie wywołania padają, `llm-runner` wyczerpuje 3 poprawki i podstawia **losowy legalny ruch** z flagą `forfeit`. Partia wygląda wtedy jak czyste zwycięstwo człowieka nad modelem, który **nie podjął ani jednej decyzji** — i takie „zwycięstwo" zaliczałoby wyzwanie dnia. Cicha, fałszywa nagroda.
- **Nie „naprawiam" tego świeższą listą.** Lista i tak zgnije. Zamiast tego:
  1. **Serwer odrzuca zaliczenie, gdy przeciwnik nigdy nie zagrał** (`opponent_never_played` w `routes/daily.ts`): wystarczy **jeden** ruch bez `forfeit`, żeby uznać model za żywego — słabe modele nic nie tracą, duchy nie przechodzą. To działa niezależnie od przyczyny (wycofane id, 429, awaria dostawcy).
  2. **Front nie oferuje wyzwania**, gdy dzisiejszego przeciwnika OpenRoutera nie ma w żywym katalogu — zamiast dać zagrać z widmem, mówi wprost, że dziś się nie da. Gdy katalog jest nieosiągalny, **nie oskarżamy puli** (brak danych ≠ model wycofany).
  3. **`pnpm daily:check`** — jedna komenda: weryfikuje pulę i najbliższe 30 dni względem żywego katalogu, wychodzi kodem ≠ 0 przy zgniłym wpisie. Rot wykrywa się przed użytkownikiem, nie po nim.
- **W puli zostaje co najmniej jeden model WebLLM** — to przypięte buildy MLC, więc nie gniją. Wyzwanie przeżyje nawet całkowitą awarię OpenRoutera.
- **Katalog filtrowany do modeli, które potrafią odpowiedzieć czystym tekstem** (`isPlayable`). OpenRouter wystawia też modele audio/obrazu, które **rozliczają się za sekundę, nie za token** — więc `prompt=0, completion=0` robiło z nich „darmowe" i wpadały do filtra „Tylko darmowe" w selektorze modeli (realny przypadek: `google/lyria-3-*`, model **muzyczny**, do wyboru jako przeciwnik i gwarantowany fail). Modele, które nie deklarują modalności, zostawiamy: nieznane ≠ nieużywalne.

## Utwardzenie po code review (T1–T3, poprawki)

Przegląd kodu własnej pracy wykazał, że warstwa antybota była **omijalna jednym polem payloadu**. Poprawki:

- **`human:` to namespace serwera, nie klienta.** `humanSideOf` rozpoznawał człowieka po literalnym `p1Id === 'human'`, a `p1Id` przychodzi od klienta i nikt go nie walidował. Wysłanie `p1Id: "human:<uuid>"` BEZ nagłówka `X-Player-Token` powodowało, że `humanSide` wychodziło `null` → `ranked = false` → pomijane były: wymóg tokenu startu, próg tempa, sanity czasów i dzienny limit gracza, a Elo i tak lądowało na wierszu tego gracza. Uuid gracza wycieka publicznie przez `GET /api/replay/:id` (zwraca `p1Id`/`p2Id`), więc dało się też **sabotować cudzy ranking** wgrywając przegrane. Teraz payload z `human:*` (albo z markerem `human` w `model_vs_model`) = 400 `reserved_subject_id`.
- **Walidacja wejścia (zod)** — `as ResultPayload` było samym rzutowaniem typu. Ruch bez pola `telemetry` przechodził replay i wywalał `TypeError` w `aggregate` **przed** blokiem `try` → niewyłapane 500; `latencyMs: "abc"` truł agregaty NaN-em. `zod` był w DECISIONS od początku jako „walidacja wejścia API — wymóg §15", ale nigdy nie został zainstalowany. Teraz jest.
- **Ranking ludzi nie zwraca już 500** — `substring(subject_id from 7)::uuid` wywracało cały endpoint na wierszu `human:<nie-uuid>`. Dodany filtr regexem na kształt uuid (defense in depth; takiego wiersza nie da się już utworzyć).
- **`subjectId` ≠ etykieta.** Ranking ludzi podmieniał `subjectId` na pseudonim, więc klik w wiersz odpytywał `/api/elo-history` pseudonimem i wykres Elo był zawsze pusty. Teraz `subjectId` niesie prawdziwy klucz, a pseudonim jedzie w nowym polu `label`.
- **Limity dzienne tylko dla `human_vs_model`.** Wcześniej limit 60/IP obejmował też partie model-vs-model, czyli **główny scenariusz użycia** — wszyscy za jednym NAT-em (biuro, CGNAT) dzielili budżet 60 zapisów/dobę, a przy `TRUSTED_PROXY=false` cała instancja miała wspólny limit. Doba liczona teraz jawnie w UTC (`date_trunc('day', now() AT TIME ZONE 'UTC')`), nie w strefie sesji Postgresa.
- **Token startu wiązany z tożsamością** (`sub` = SHA-256 tokenu gracza) — inaczej dało się mintować tokeny anonimowo/na tożsamość jednorazową, odczekać i wydać je na koncie faktycznie farmionym. Wiązanie jest hashem, więc wydanie tokenu nie tworzy wiersza w bazie. **Ryzyko szczątkowe świadomie zostawione**: tokeny nadal można pobrać hurtem zawczasu (sufitem jest limit 30/dzień/gracza) — rejestr wydanych tokenów to przerost formy dla tej skali.
- **Flaga precyzji sumowana po wariantach statków** — próg per wariant pozwalał solverowi rozłożyć grę na small/medium/large i nigdy nie dobić do 100 ruchów w żadnym wierszu.
- **`GET /api/player/me` nie tworzy już gracza** (nowe `findPlayer`) — GET nie powinien mutować bazy, a skrypt z losowymi tokenami mnożył wiersze; profil powstaje dopiero przy realnej akcji (zapis wyniku, nadanie pseudonimu).
- **Koniec mutacji payloadu w `submitResult`** — id stron liczone do lokalnego `subject`, bo drugie przejście po zmutowanym payloadzie nie rozpoznałoby już strony człowieka (a więc po cichu pominęłoby pacing).

## Co wyszło dopiero na prawdziwych modelach (`pnpm smoke:live`)

Wszystko przed tym momentem było testowane na scriptowanych transportach i zaseedowanych danych. Jedna partia na żywym OpenRouterze wywaliła **cztery** błędy, z których dwa były krytyczne dla rankingu. Dlatego ten skrypt zostaje w repo.

- **Reguła „średni czas ruchu < 3 s = podejrzane" (SPEC §15) była błędna i zabijała produkt.** Zmierzone: gpt-4o-mini odpowiada na prompt kółka i krzyżyka w **~1,1 s**, llama-3.1-8b w ~2,9 s. Czyli **uczciwa partia model-vs-model była odrzucana jako oszustwo**, a ranking modeli po cichu przyjmował wyłącznie modele *wolne*. Testy tego nie łapały, bo wpisywały `latencyMs: 4000` — były pisane pod regułę, nie pod rzeczywistość. Do tego kontrola jest **bezwartościowa z definicji**: `latencyMs` podaje klient, więc oszust wpisze 5000 i przejdzie — karze wyłącznie uczciwych. Zostaje jako czujka na jawnie sfabrykowaną telemetrię (0–10 ms to nie jest round trip), próg **3000 → 150 ms**. Prawdziwa obrona jest gdzie indziej: replay serwerowy, jednorazowe `jti`, dedup `moves_hash`, Turnstile, limity i — dla ludzi — stemplowany serwerowo token startu (§15.3), którego klient nie podrobi.
- **Ruchy wymuszone były liczone do Precyzji.** `llama-3.2-3b:free` dostał 429 na każdym ruchu, forfeitował wszystkie (czyli **nie podjął ani jednej decyzji**) — i zdobył **100% Precyzji**, bo losowe podstawienia trafiły przypadkiem w optymalne pola. Pokonał przy tym gpt-4o-mini, który naprawdę grał i miał 67%. Forfeit to **nasze** losowe podstawienie po trzech nieudanych poprawkach (§8), nie wybór modelu. Precyzja liczy się teraz **wyłącznie z realnych decyzji**: licznik pomija forfeity, a mianownik to `totalMoves − forfeitMoves` (bez migracji — obie liczby już są w bazie). Forfeity mają własną oś („Dyscyplina"), więc nie ma podwójnego karania.
- **Partia, w której jedna strona nigdy nie zagrała, zdobywała Elo.** Ten sam duch **wygrał** i podniósłby sobie rating — mierzylibyśmy limiter OpenRoutera, nie model. Teraz taka partia jest **zapisywana** (jest powtarzalna i uczciwie pokazuje, co się stało), ale **nie rusza żadnego ratingu**: `ranked: false`, `unrankedReason: 'no_real_moves'`, a UI mówi wprost dlaczego. To ten sam problem, który wcześniej domknąłem dla wyzwania dnia — ranking był wtedy nadal odsłonięty.
- **Kontrola czasu oskarżała gracza o oszustwo, gdy padał dostawca.** Martwe id (404) i limit (429) wracają w ~300 ms → forfeity → średnia leciała poniżej progu → `suspicious_timing`, czyli zarzut oszustwa pod adresem kogoś, kto nic nie zrobił źle. Do kontroli czasu wchodzą teraz **tylko ruchy, na które model odpowiedział** — nieudane wywołania nie są odpowiedziami modelu.

## Testy e2e w prawdziwej przeglądarce (`pnpm e2e`) — bo nikt nigdy nie kliknął w kratkę

Pytanie użytkownika („i człowiek będzie mógł grać? ustawiać krzyżyki, statki i trafiać?") nie miało uczciwej odpowiedzi. Cała weryfikacja dotyczyła części: silniki, providery, serwer, a `smoke:live` to **model vs model** — bez człowieka w pętli. `human.test.ts` sprawdzał uchwyt providera w izolacji. **Zero testów renderujących planszę.** Nietestowana była główna obietnica produktu.

- **Playwright na zainstalowanym Chrome** (`channel: 'chrome'`) — zero pobierania przeglądarek. Testy celują w prawdziwą aplikację (compose) i **prawdziwy model**, więc wymagają klucza; bez niego czysto się pomijają (`test.skip`).
- **Klucz wstrzykiwany dokładnie tak, jak trzyma go apka: do `localStorage`** (§16) — nie przez żaden backdoor. To jednocześnie potwierdza, że produkcyjna ścieżka odczytu klucza działa.
- **Warunek końca tury zamiast zegarka.** Pierwsza wersja czekała sztywne 1200 ms na ruch modelu i strzelała 2 razy z 10. Gdy model myśli, **wszystkie** pola planszy strzałów są `disabled` — więc „pole znów jest klikalne" to dokładnie „wróciła moja tura". Test czeka na to, a nie na `setTimeout`.
- **`data-board="own|tracking"` dodane do `BattleshipBoard`** — obie plansze etykietują pola tą samą współrzędną (`C5`), więc bez tego nie da się wycelować w planszę strzałów zamiast we własną flotę. Potrzebne też czytnikom ekranu, nie tylko testom.
- **Znalezione przy okazji: `pl.placement.title` był martwym stringiem** — ekran rozstawiania floty nie miał żadnego nagłówka. Dodany.

Zweryfikowane realnym przebiegiem: kółko i krzyżyk — człowiek klika pole, X ląduje, gpt-4o-mini odpowiada O, partia kończy się wygraną („Wygrywasz!", koszt $0,0001). Statki — rozstawienie floty, strzały, **pudła (M), trafienia (H) i zatopienie (S)** na planszy, 25 ruchów w logu z telemetrią modelu.

**Znana luka:** e2e nie klika „Zapisz do rankingu" (dialog Turnstile). Ścieżka zapisu jest pokryta testami integracyjnymi i `smoke:live`, ale nie z poziomu przeglądarki.

## Druga wersja językowa (EN) — język jest w URL-u, nie w localStorage

SPEC miał twarde ograniczenie „interfejs po polsku". Angielski dokłada drugą publiczność, ale zderza się z tym, co ten projekt już ma: **udostępnialne linki** (powtórki), **karty OG** i **SEO pod agentów** (`llms.txt`, sitemap, JSON-LD). Dlatego decyzja nie brzmi „dodaj przełącznik", tylko **„zrób z języka część adresu"**.

- **Polski zostaje kanoniczny i nieprefiksowany** (`/rankingi`), angielski żyje pod `/en` (`/en/rankings`). Żaden link, który ktoś kiedykolwiek udostępnił, nie przestaje działać — to był warunek wstępny, nie preferencja.
- **Przełącznik trzymany w localStorage byłby ślepy na to, co robią ludzie z tym produktem: wklejają linki.** Gdyby język siedział tylko w pamięci przeglądarki, Anglik wysyłający powtórkę koledze wysyłałby polską stronę z polską kartą OG. Skoro język jest w ścieżce, serwer renderuje `<html lang>`, `<title>`, opis, canonical, hreflang **i obrazek OG** (`/api/og/:id?lang=en`) dla języka linku, a nie dla nagłówka `Accept-Language`.
- **Tabela tras poszła do `packages/i18n`** (nie do kopii po obu stronach). Front buduje z niej `<Link>`, serwer sitemap, alternatywy hreflang i tagi OG. Kopia oznaczałaby, że `/en/rankings` może się rozjechać z `/en/rankings` — i wyszłoby to dopiero w Search Console.
- **Locale bierze się z ROUTE'a, nie ze store'a** (`<Route path="/en" element={<Shell locale="en"/>}>`). URL i renderowany język nie mogą się rozminąć: nie ma stanu do zsynchronizowania, nie ma mignięcia złym językiem przy starcie.
- **`pl.ts` jest źródłem prawdy typu.** `Dict` jest z niego wyprowadzony (`Widen<typeof pl>`), więc nowy klucz w polskim słowniku **wywala build**, dopóki nie ma go w `en.ts`. Półprzetłumaczony słownik jest gorszy od żadnego, bo dziurę widzi dopiero użytkownik.
- **Prompty do modeli zostają angielskie** (SPEC §5) — zmiana języka UI nie może zmienić tego, co dostaje model, bo wtedy ranking porównywałby modele grające *innymi promptami*. **Jedyny wyjątek: komentator AI** — jego wypowiedź czyta człowiek, więc idzie za językiem interfejsu (instrukcje w systemie nadal po angielsku).
- **Opisy modeli są dwujęzyczne, ale klasyfikacja jest wspólna.** `sizeClassOf`/`priceClassOf`/`contextClassOf` są bezjęzykowe; tłumaczy się wyłącznie zdania. Inaczej tłumacz mógłby — nie zauważając — przesunąć model do innego kubełka cenowego.
- **Etykiety wariantów wyprowadzone z `game-core`** do słownika. Silnik gry nie ma powodu trzymać polskiego stringa `'Małe 6×6'`; `variantLabel(t, id)` mapuje id → nazwa w bieżącym języku (z fallbackiem na id).

**Kompromisy przyjęte świadomie:**

- **Przekierowanie po języku przeglądarki działa po stronie klienta** i tylko na ścieżkach bez prefiksu. Crawler bez JS indeksuje polskie URL-e normalnie, a obie wersje i tak deklarujemy przez hreflang + sitemap. Wariant serwerowy (302 po `Accept-Language`) dałby to samo użytkownikowi, ale mieszałby cache'e i potrafi zapętlić boty — nie warte tego.
- **`manifest.webmanifest` zostaje polski.** Jeden statyczny manifest nie jest dwujęzyczny; robienie go dynamicznym dla PWA to koszt bez odbiorcy na tym etapie.
- **Testy e2e dostały `locale: 'pl-PL'`.** Stock Chrome mówi `en-US`, więc od tej zmiany `/` przekierowywałoby testy na `/en` i polskie selektory padłyby — co jest poprawnym zachowaniem produktu, nie regresją. Test ma udawać polskiego gracza, a nie wyłączać funkcję.

Zweryfikowane w prawdziwym Chrome na zbudowanej aplikacji (serwer + `web/dist`): polska przeglądarka zostaje na `/`, angielska ląduje na `/en`, przełącznik przenosi na **tę samą stronę** w drugim języku (`/en/rankings` → `/rankingi`), wybór wygrywa z przeglądarką po powrocie na `/`, a udostępniony link `/en/compare` nie odbija się polskiej przeglądarce. Serwer oddaje `<html lang="en">`, angielski opis, `og:locale=en_US`, komplet hreflang i `inLanguage: "en"` w JSON-LD.

## Trener AI — dwa źródła, a klucz Gemini to sekret serwera

Komentator (§12.1) istniał jako model na **kluczu gracza** (BYOK). Doszła druga opcja: **fundowany trener Gemini**, gdzie klucz należy do właściciela aplikacji. Wybór jest po stronie gracza — „mój model" albo „trener wbudowany" — bo to dwie różne umowy: przy BYOK płaci gracz i wybiera model, przy trenerze płaci właściciel i nie ma po co pokazywać wyboru modelu.

- **Klucz trenera żyje na serwerze, nie w przeglądarce.** To nie jest „provider" jak OpenRouter (gdzie każdy gra na swoim kluczu w localStorage). Trener to jedna funkcja fundowana centralnie, więc `GEMINI_COACH_API_KEY` to env serwera, jak `TURNSTILE_SECRET`. Przeglądarka nigdy go nie widzi.
- **Prompt składa serwer, nie klient.** Gdyby klient wysyłał gotowy `{system, user}` do przepchnięcia do Gemini, endpoint `/api/commentary` byłby **otwartym proxy do płatnego klucza właściciela** — każdy paliłby budżet dowolnym tekstem. Endpoint przyjmuje więc **ustrukturyzowane, walidowane (zod) wejście** (gra, ruch, ocena solvera, stan planszy) i sam składa prompt tym samym builderem co klient. Najgorsze, co można nim zrobić, to poprosić o komentarz do zmyślonej planszy. Do tego rate-limit 120/h/IP.
- **Builder promptu przeniesiony do `game-core`** (`commentary.ts`). Musi go użyć i klient (BYOK), i serwer (trener) — a `apps/server` nie może importować z `apps/web`. Wspólny builder = obie ścieżki produkują identyczny prompt i nie mogą się rozjechać. Renderowanie „god view" i tak zależy od `game-core` (`battleship.viewFor`), więc to naturalny dom.
- **`createCommentator` przyjmuje teraz `commentate(req)`, nie `transport`.** Kolejka fire-and-forget (single-flight, drop-oldest, timeout) jest wspólna; różni się tylko sposób zdobycia tekstu: `chatCommentate` buduje prompt u klienta i woła transport gracza, `serverCommentate` wysyła ustrukturyzowany request do `/api/commentary`.

**Kompromisy przyjęte świadomie:**

- **Osobna zmienna `GEMINI_COACH_API_KEY`, nie współdzielony `GEMINI_API_KEY`.** W `.env.example` istniał już `GEMINI_API_KEY` — dla dev-time generatorów grafik. Gdyby serwer czytał tę samą zmienną, klucz ustawiony do generowania obrazków **po cichu włączyłby płatny, publiczny endpoint na produkcji**. Dedykowana zmienna czyni trenera świadomym opt-inem.
- **Endpoint bez logowania (tylko rate-limit).** Turnstile pod dekoracyjną funkcją psułby UX (komentarz leci w trakcie gry, przed jakimkolwiek zapisem). Obrona to: prompt składany serwerowo z walidowanego wejścia + limit 120/h/IP + twardy `maxOutputTokens: 90`. Residual: zdeterminowany napastnik zza jednego IP może w ciągu godziny wygenerować do 120 krótkich komentarzy na koszt właściciela — akceptowalne dla funkcji, którą właściciel świadomie funduje i może wyłączyć, kasując klucz.
- **Domyślny model `gemini-3.5-flash`, nie alias.** `gemini-flash-latest` to alias OpenRoutera, **nie** natywnego API Gemini (zweryfikowane w dokumentacji Google) — wpisany jako default zwracałby 404. Właściciel obniża do `gemini-2.5-flash`, jeśli jego klucz nie ma dostępu do 3.5. Nazwa modelu to jedyny szczegół promptu zależny od configu; reszta jest stała.
- **Trener domyślnie wybrany, gdy dostępny.** Skoro jest darmowy dla gracza (płaci właściciel), to przyjaźniejszy start niż „wklej swój klucz". BYOK zostaje o jedno kliknięcie dalej.

Zweryfikowane end-to-end w prawdziwym Chrome na zbudowanej aplikacji, z serwerem trzymającym klucz i **podstawioną** siecią do Gemini (bez uderzania w prawdziwe API): `GET /api/health` ogłasza `coach:true`, endpoint zbudował **angielski** prompt dla angielskiego UI i zwrócił tekst, zły payload → 400, a w przeglądarce trener jest domyślnym wyborem z ukrytym pickerem modeli, który pojawia się po przełączeniu na „mój model". Klucz Gemini nie pojawia się w żadnym ładunku wysyłanym do przeglądarki.

## Seeder rankingu (launch data) — realne partie przez tę samą walidację, bez publicznego obejścia

Świeży deployment ma pusty ranking i martwe „Porównaj". Zamiast wstrzykiwać sztuczne wiersze do bazy (co omijałoby replay/eval/Elo — sedno uczciwości), `apps/server/scripts/seed-ranking.ts` **rozgrywa prawdziwe partie** model-vs-model (realne wywołania OpenRouter) i zapisuje każdą przez **tę samą funkcję `submitResult`**, której używa zapis z przeglądarki: serwerowy replay, przeliczenie jakości ruchów i Elo, odrzucenie niespójności. Pomijana jest wyłącznie warstwa HTTP (JWT + Turnstile) — a ona istnieje po to, by odsiać **anonimowe boty na publicznym endpoincie**; seeder biegnie po stronie właściciela, na realnych partiach, i nie jest wystawiony jako route.

- **Round-robin** wszystkich par modeli → każda para ma wspólne partie, więc „Porównaj" (bilans bezpośredni) ma dane, a leaderboard ma ≥2 wiersze.
- **Bez `eval` w payloadzie** — serwer liczy je sam i odrzuca rozjazd (`eval_mismatch`), więc seeder nie może „podać" ocen.
- **Walidacja potwierdzona negatywnie**: gdy modele nie odpowiadały (klucz bez kredytów / model spoza katalogu), wszystkie ruchy były losowymi forfeitami → serwer **odmówił rankingu** (`ranked=false`, `no_real_moves`). Partia bez realnych decyzji nie rusza Elo — dokładnie jak przy zapisie z przeglądarki.

**Uruchomienie na produkcji.** Prod Postgres nie jest wystawiony na host (tylko w sieci docker), więc seeder puszczono z maszyny właściciela przez **tunel SSH** do kontenera bazy, hasło pobrane z serwerowego `.env` bez wypisywania. Modele: tanie **płatne** (wymaga kredytów na koncie OpenRouter — bez nich płatne dają 402, a darmowe `:free` 429). Trzy modele × round-robin × 3 partie; kilka partii słusznie odrzucił dedup `moves_hash` (kółko i krzyżyk ma wąski zbiór optymalnych linii, więc zdyscyplinowane modele generują identyczne sekwencje ruchów). Przed finalnym seedem zrobiono `TRUNCATE matches/ratings/elo_history` — cała zawartość bazy pochodziła z pierwszych prób seedowania (potwierdzone: zero danych użytkowników), więc jeden spójny seed jest czystszy niż łatanie (usuwanie samych wierszy partii nie cofa przyrostowego Elo w `ratings`).
