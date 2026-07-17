# PLAN: Efekt WOW — okno w głowę modelu (6 modułów)

> Dokument dla Claude Code. Samowystarczalny — czytaj razem z `SPEC.md` (architektura §5, protokół LLM §8, walidacja §15, prywatność §16).
> Cel: sześć modułów, które dla osoby interesującej się AI zamieniają arenę z „ciekawego benchmarku" w spektakl: **(A) Tok myślenia** (na żywo + w replayu), **(B) Ranking halucynacji + Muzeum wpadek**, **(C) Psychologia modeli** (heatmapy zachowań), **(D) Tryb Turinga**, **(E) Demo WebLLM na stronie głównej**, **(F) Pojedynek promptów**.
> Realizuj etapami (sekcja 10). Po każdym etapie `pnpm test` + `pnpm typecheck` zielone. Nie przechodź dalej z czerwonymi testami. Konwencja commitów: `feat(zakres): opis (Etap N)` — po polsku, jak dotychczas.

---

## 1. Kontekst — co już jest i z czego korzystamy

Fakty zweryfikowane w kodzie (stan: branch `feat/sudoku-scrabble`, po integracji Sudoku/Scrabble):

- **Telemetria per ruch już istnieje** (`MoveTelemetry` w `packages/game-core/src/types.ts`): `latencyMs`, `promptTokens`, `completionTokens`, `retries` (0..3), `forfeit`, `error?: MoveErrorReason` (`bad_output` = model odpowiadał, ale nie dał legalnego ruchu). Agregaty per model w `ratings`: `forfeitMoves`, `totalMoves`, `optimalMoves` — **ranking „dyscypliny" da się policzyć wstecz z istniejących danych**.
- **Surowy tekst modelu NIE jest dziś zapisywany** (SPEC §16): `MoveResult.raw` żyje tylko w pamięci. Moduły A i B wymagają kontrolowanego wyjątku — patrz decyzja D1.
- **`matches.moves` to jsonb** (`apps/server/src/db/schema.ts`) — dodatkowe pola per ruch NIE wymagają migracji kolumn. Zod (`apps/server/src/db/result-schema.ts`) domyślnie **wycina nieznane klucze**, więc każde nowe pole trzeba jawnie dodać do schematu (z twardym limitem długości).
- **Hash dedup jest bezpieczny**: `movesHash(game, variant, setup, moves)` liczy się z par `{player, move}` (`packages/game-core/src/replay.ts:119`, wywołanie w `apps/server/src/db/results.ts:507`). Dodatkowe pola per ruch nie zmieniają hasha ani walidacji replay (replay czyta tylko `player` + `move`).
- **Pętla retry w jednym miejscu**: `runLlmMove` (`apps/web/src/providers/llm-runner.ts`) widzi każdą odrzuconą odpowiedź (`completion.text` + `MoveRejection.reason`) — to jedyny punkt przechwytywania danych do modułów A i B. Uwaga: licznik `retries` NIE rozróżnia dziś przyczyn (błąd transportu vs zły output) — rozróżnienie wchodzi z nowym polem `rejections` (D4).
- **Tryb `reasoning: true`** (`PromptOptions`) istnieje i jest **lab-only** (zmienia siłę gry → nie rankuje). Osobno: flaga `reasoningModel` w `OpenRouterConfig` podnosi `max_tokens` dla modeli z ukrytym CoT (o1/R1-style) **także w partiach rankingowych** — te modele i tak myślą, my tylko nie widzimy śladu. Moduł A to zmienia (D2).
- Transport OpenRouter (`apps/web/src/providers/openrouter.ts`) parsuje dziś tylko `choices[0].message.content` + `usage`. Katalog modeli: `apps/web/src/providers/openrouter-catalog.ts` (endpoint `/models` OpenRoutera zwraca `supported_parameters` — sprawdź dokładną nazwę pola przy implementacji).
- **Orchestrator** (`apps/web/src/game/orchestrator.ts`) emituje `MoveLogEntry` przez `onMove` — panel „na żywo" podpina się tam, bez zmian pętli.
- **Rankingi intuicji już są** (tabela `predictions`, `apps/server/src/routes/predictions.ts`, `IntuitionPage.tsx`) — wzorzec identyfikacji `player_token` do reużycia w module D.
- **WebLLM działa** (`apps/web/src/providers/webllm.ts` z listą `WEBLLM_MODELS`, store `model-load.ts`, `ModelLoadBar.tsx`) — moduł E to composition istniejących klocków.
- **Prompt lab istnieje** (`systemAppendix` w `LlmMoveConfig`, lab-matches z `lab=true` poza Elo) — moduł F rozszerza go o per-stronę.
- **Lokalizowane URL-e**: nowa podstrona = nowy `RouteKey` w `packages/i18n/src/index.ts` (tabela `SEGMENTS`) + routing w `App.tsx` + sitemap/hreflang/OG na serwerze budują się z tej samej tabeli.
- Publiczne endpointy „chartowe" bez JWT mają wzorzec w `apps/server/src/routes/analytics.ts`; montaż w `apps/server/src/app.ts`.
- Testy: vitest kolokowane; integracyjne testcontainers (`apps/server/src/*.integration.test.ts`); e2e Playwright w `e2e/`.

| Warstwa | Pliki dotykane (przekrojowo) |
|---|---|
| game-core | `types.ts` (nowe opcjonalne pola wyników ruchu), bez zmian silników i replay |
| web | `providers/llm-runner.ts`, `providers/openrouter.ts`, `providers/openrouter-catalog.ts`, `game/orchestrator.ts` (typ logu), `api/results.ts`, `components/GameRunner.tsx`, `components/GameLog.tsx`, `pages/ReplayPage.tsx`, `pages/ModelCardPage.tsx`, `pages/LeaderboardPage.tsx`, `App.tsx`, `i18n/pl.ts` + `en.ts`, nowe komponenty/strony per moduł |
| server | `db/schema.ts` (+2 tabele), `db/result-schema.ts`, `db/results.ts`, nowe routes: `hallucinations.ts`, `failures.ts`, `psychology.ts`, `turing.ts`, `app.ts`, `og/seo.ts` |
| i18n (pakiet) | `RouteKey` + `SEGMENTS` (`failures`, `turing`) |
| pozostałe | migracje drizzle, `SPEC.md`, `DECISIONS.md`, `README.md`/`README.pl.md`, e2e |

---

## 2. Decyzje projektowe (podjęte — nie renegocjuj w trakcie implementacji)

1. **D1 — kontrolowany wyjątek od SPEC §16 („raw nigdy nie jest zapisywany")**: zapisujemy WYŁĄCZNIE (a) tok rozumowania modelu przycięty do limitu i (b) krótkie fragmenty ODRZUCONYCH odpowiedzi modelu — nigdy promptów, nigdy niczego od gracza-człowieka, nigdy pełnych transkryptów. Limity twarde po obu stronach: klient przycina, zod odrzuca powyżej limitu, serwer dodatkowo przycina przed insertem (defense in depth). Zapis następuje tylko gdy użytkownik świadomie zapisuje mecz (istniejący flow „Save to leaderboard"). Wpisz do `DECISIONS.md` i zaktualizuj §16 w `SPEC.md`.
2. **D2 — tok myślenia nie zmienia protokołu ruchu ani zasad rankingu.** Prompty gier pozostają bez zmian. Dla modeli oznaczonych w katalogu jako reasoning-capable wysyłamy w request OpenRoutera parametr odsłaniający ślad rozumowania (`reasoning` — unified API OpenRoutera; dokładny kształt sprawdź w docs przy implementacji) i czytamy `choices[0].message.reasoning`. Model i tak myślał (ukryte tokeny CoT liczyły się do `max_tokens` już dziś — patrz `reasoningModel`), więc siła gry się nie zmienia → **partie rankingowe pozostają rankingowe**. Tryb `PromptOptions.reasoning` (CoT w treści) pozostaje lab-only; w nim „myśl" wyciągamy z tekstu przed JSON-em.
3. **D3 — fallback transportu na nieobsługiwany parametr**: jeśli request z parametrem reasoning dostaje 4xx, transport ponawia TEN SAM request bez parametru (jednorazowo, wewnątrz transportu, przed ścieżką retry runnera). Test obowiązkowy.
4. **D4 — nowe opcjonalne pola per ruch w payloadzie wyniku** (jadą w `matches.moves` jsonb, zero migracji dla nich): `thoughts?: string` (klient przycina do 1500 znaków, zod `max(2000)`) oraz `rejections?: Array<{kind: 'illegal'|'unparseable'|'transport', reason?: string(max 200), attempted?: string(max 40), raw?: string(max 240)}>` (max 4 wpisy = maxRetries+1). `attempted` = sparsowany ruch, który silnik odrzucił (dla scrabble notacja `H8>KWIZŁO` niesie zmyślone słowo — to złoto muzeum). `transport` nie niesie `raw` (nie ma czego).
5. **D5 — ranking halucynacji = dwie metryki, uczciwie opisane**: (a) **„Ruchy wymuszone"** = `forfeitMoves/totalMoves` z `ratings` — dostępne WSTECZ dla całej historii; (b) **„Czystość za pierwszym podejściem"** = odsetek ruchów bez żadnego wpisu `rejections[kind∈{illegal,unparseable}]` — tylko dla partii zapisanych po wdrożeniu D4 (transport errors NIE liczą się przeciw modelowi). Nie mieszaj metryk; UI wyraźnie oznacza „od kiedy" liczona jest (b).
6. **D6 — muzeum wpadek = osobna zdenormalizowana tabela** `failure_gallery`, wypełniana w tej samej transakcji co zapis meczu (z już zwalidowanego payloadu). Powód: feed i filtry bez skanów jsonb, łatwy purge/moderacja. Publiczne są tylko wpadki MODELI (`kind∈{illegal,unparseable}` + fragmenty ich własnego outputu). React escapuje — dodatkowo limit długości i brak renderowania linków/markdownu z `raw`.
7. **D7 — psychologia modeli liczona w JS z cache w pamięci** (TTL 10 min, ostatnie ≤500 partii per subject×game), nie w SQL po jsonb i nie w nowej tabeli — to „soft stats", świeżość nie jest krytyczna. Wymaga dwóch indeksów na `matches` (`(p1_id, game)`, `(p2_id, game)`) — jedyna migracja poza D6/D8.
8. **D8 — tryb Turinga nie ujawnia `matchId` przed odpowiedzią**: `GET /api/turing/next` zwraca zagadkę (ruchy `{player, move}` + `setup`, ZERO telemetrii — latencja to zdrada) i **podpisany token zagadki** (istniejący mechanizm JWT, `apps/server/src/auth/jwt.ts`); `matchId` i tożsamości wychodzą dopiero w odpowiedzi na `POST /guess`. Filtr puli: `human_vs_model`, `lab=false`, rozstrzygnięte, ≥6 ruchów, bez forfeitów (losowy ruch zastępczy wygląda „ludzko" i psuje zabawę). Wyniki w nowej tabeli `turing_guesses`, ranking detektywów na stronie modułu (IntuitionPage bez zmian).
9. **D9 — demo na stronie głównej: JEDEN mały model WebLLM gra sam ze sobą** (temp 0.2 vs 0.9, np. najmniejszy z `WEBLLM_MODELS`), gra: kółko i krzyżyk (najkrótsze partie). Powód: dwa modele naraz w VRAM to ryzyko OOM, a jedna paczka do pobrania = mniejszy próg wejścia. Start WYŁĄCZNIE za kliknięciem z podanym rozmiarem pobrania; bez WebGPU karta pokazuje komunikat zamiast przycisku. Mecz nie jest zapisywany (bump licznika live — tak, jak każda partia).
10. **D10 — pojedynek promptów jest lab-only i lokalny**: seria N∈{3,5,7} partii, ten sam model, dwa `systemAppendix`, zamiana stron co partię (fairness pierwszeństwa), seed serii deterministyczny. Bez globalnego Elo promptów w tym wydaniu (wymagałby namespace'u `prompt:<hash>` i polityki anti-abuse — odnotuj w DECISIONS jako przyszłość). Pojedyncze partie serii można zapisywać istniejącym flow lab.
11. **D11 — nowe strony publiczne**: `failures` (pl `muzeum-wpadek`, en `fail-museum`) i `turing` (pl/en `turing`). Psychologia NIE dostaje osobnej strony — to sekcja na `ModelCardPage` + porównanie na `ComparePage`.
12. **D12 — limit body na `/api/result`**: z D4 payload rośnie (scrabble ~60 ruchów × ~2 KB). Ustaw jawny limit (np. 2 MB) w middleware — sprawdź, czy Hono ma domyślny; jeśli nie, dodaj. Zod i tak tnie per pole, limit body to bezpiecznik na cały dokument.

---

## 3. Moduł A: Tok myślenia („Thought stream")

### 3.1 Przechwycenie (web)

- `llm-runner.ts`: `ChatCompletion` + `reasoning?: string`. `runLlmMove` zwraca w `MoveResult` nowe pole `thoughts?: string`: preferuj `completion.reasoning`; gdy brak, a `config.reasoning === true` (tryb lab CoT) — wyciągnij tekst poprzedzający pierwszy obiekt JSON z `completion.text`. Przytnij do 1500 znaków (stała `THOUGHTS_MAX_CHARS` eksportowana — używa jej też zod po stronie serwera przez kopię wartości w komentarzu; nie importuj web→server).
- `openrouter.ts`: dodaj do body parametr reasoning **tylko gdy** `config.reasoningCapture === true` (nowa flaga; GameRunner ustawia ją, gdy katalog mówi, że model wspiera reasoning). Czytaj `choices[0].message.reasoning`. Fallback D3 (retry bez parametru na 4xx) wewnątrz transportu.
- `openrouter-catalog.ts`: wyprowadź z odpowiedzi `/models` flagę `supportsReasoning` (pole `supported_parameters` — zweryfikuj nazwę). To także zastąpi/uzupełni obecną heurystykę `reasoningModel`.
- `webllm.ts` / `ollama.ts`: nic — brak pola = panel po prostu milczy.
- `orchestrator.ts`: `MoveLogEntry` + `thoughts?: string` (przepisz z `MoveResult`); pętla bez zmian.

### 3.2 UI na żywo

- `GameRunner.tsx`: panel **„Tok myślenia"** obok `GameLog` (styl HUD, monospace, efekt maszyny do pisania po nadejściu ruchu, auto-scroll; nagłówek z nazwą modelu i numerem ruchu). Widoczny tylko, gdy jakikolwiek gracz może produkować myśli; toggle w `SettingsDialog` (domyślnie ON).
- `GameLog.tsx`: ruch z myślą dostaje wskaźnik (ikona 🧠) — klik pokazuje myśl dla tego ruchu.

### 3.3 Zapis i replay

- `api/results.ts` (`buildResultPayload`): przepisz `thoughts` z `MoveLogEntry` do payloadu per ruch.
- `db/result-schema.ts`: `resultMove` + `thoughts: z.string().max(2000).optional()`.
- `db/results.ts`: przytnij `thoughts` do 2000 przed insertem; **wytnij `thoughts` z ruchów strony ludzkiej** (człowiek nie ma myśli od LLM — obecność = payload spreparowany; nie odrzucaj, po prostu usuń).
- `ReplayPage.tsx`: przy przewijaniu ruchów pokaż myśl bieżącego ruchu w tym samym panelu „Tok myślenia". To jest serce efektu wow w udostępnianych replayach.

### 3.4 Etap opcjonalny: streaming SSE (osobno, nie blokuje)

Prawdziwy „na żywo" typewriter wymaga `stream: true` + parsera SSE w transporcie i opcjonalnego callbacku `onDelta` w `ChatTransport`. Zmiana sygnatury dotyka wszystkich transportów i testów — dlatego to osobny etap (10), realizowany tylko jeśli etapy 1–9 domknięte.

### 3.5 Testy

- `llm-runner.test.ts`: reasoning przechwycony z `completion.reasoning`; fallback z treści przy `reasoning:true`; przycięcie do limitu; brak pola = brak `thoughts`.
- `openrouter.test.ts`: parametr wysyłany tylko z flagą; D3 retry bez parametru na 400; `message.reasoning` czytany.
- serwer: zod akceptuje/tnie `thoughts`; strip dla strony ludzkiej; round-trip zapis→odczyt replay (integracyjny).
- UI smoke: panel renderuje myśl po ruchu; replay pokazuje myśl per ruch.

---

## 4. Moduł B: Ranking halucynacji + Muzeum wpadek

### 4.1 Przechwycenie odrzuconych prób (web)

W pętli `runLlmMove` (miejsce, gdzie dziś buduje się `correctionMsg`) zbieraj `rejections` wg D4:

- parse fail → `{kind:'unparseable', raw: trim(completion.text, 240)}`;
- walidacja odrzuciła → `{kind:'illegal', reason: rejection.reason(200), attempted: String(parsed)(40), raw: trim(...,240)}`;
- wyjątek transportu → `{kind:'transport'}` (bez raw/reason — przyczyna i tak jest w `telemetry.error` przy forfeicie).

`MoveResult` i `MoveLogEntry` + `rejections?: MoveRejectionRecord[]`; `buildResultPayload` przepisuje.

### 4.2 Serwer: schemat + zapis

- `db/result-schema.ts`: `rejections` wg D4 (array max 4, twarde `max()` na stringach).
- `db/schema.ts` + migracja: tabela `failure_gallery`:
  `id bigserial PK, match_id uuid REFERENCES matches(id), subject_id text NOT NULL, game text NOT NULL, variant text NOT NULL, kind text NOT NULL, attempted text, reason text, excerpt text, move_index integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()`
  - indeks `(game, created_at DESC)` + `(subject_id, created_at DESC)`; CHECK `kind IN ('illegal','unparseable')`.
- `db/results.ts` (`submitResult`, w istniejącej transakcji): po pozytywnym replayu wstaw wiersze z `rejections` (tylko `illegal`/`unparseable`, tylko strony LLM). `subject_id` = id strony, która próbowała. Dla scrabble wyciągnij słowo z `attempted` (notacja `H8>SŁOWO` / segment po `>`); zapisz w `attempted` samo słowo lub całą notację — jedno pole starczy.
- **Metryka D5(b)**: nie licz jej w locie w SQL po jsonb — dołóż do `ratings` dwie kolumny agregacyjne w tej samej migracji: `rejectedAttempts integer NOT NULL DEFAULT 0` i `movesWithRejections integer NOT NULL DEFAULT 0`, aktualizowane w `submitResult` obok istniejących sum (wzorzec: `forfeitMoves`).

### 4.3 Endpointy

- `GET /api/hallucinations?game=&variant=&mode=` → lista per subject: `{subjectId, totalMoves, forfeitMoves, forfeitRate, rejectedAttempts, movesWithRejections, cleanFirstTryRate, since}` (`since` = data wdrożenia D4 — stała konfiguracyjna albo `MIN(created_at)` z `failure_gallery`). Wzorzec pliku: `analytics.ts` (publiczny read).
- `GET /api/failures?game=&limit=` → feed muzeum: `{subjectId, game, variant, kind, attempted, reason, excerpt, matchId, createdAt}` (ostatnie N, max 100).

### 4.4 UI

- `LeaderboardPage.tsx`: kolumna „Dyscyplina" (forfeitRate — dostępna wstecz) z tooltipem wyjaśniającym metrykę.
- `ModelCardPage.tsx`: sekcja „Halucynacje" — obie metryki D5 + mini-lista ostatnich wpadek tego modelu (z `/api/failures?subjectId=`— dodaj parametr).
- Nowa strona **`FailureMuseumPage.tsx`** (route key `failures`): karty-cytaty (model, gra, `attempted`/`excerpt`, powód, link do replay), filtr per gra, nagłówek wyjaśniający czym jest halucynacja ruchu. Scrabble dostaje sekcję „Słowa, które nie istnieją" (kind=illegal z `attempted`).
- `packages/i18n`: `RouteKey` + `'failures'`, segmenty `muzeum-wpadek`/`fail-museum`; `App.tsx` route; `i18n/pl.ts`+`en.ts` etykiety; `og/seo.ts` sitemap.

### 4.5 Testy

- runner: rejections zbierane per przyczyna, capy długości, transport bez raw.
- serwer unit: zod caps; integracyjny: zapis meczu z rejections → wiersze w `failure_gallery` + agregaty w `ratings`; feed zwraca i filtruje.
- UI smoke: strona renderuje feed; leaderboard ma kolumnę.

---

## 5. Moduł C: Psychologia modeli (heatmapy zachowań)

### 5.1 Endpoint

`GET /api/psychology?subjectId=&game=&variant=` (nowy `routes/psychology.ts`, wzorzec `analytics.ts`):

- pobierz ostatnie ≤500 partii `lab=false` danego subjecta w danej grze (`p1_id = s OR p2_id = s`), zmapuj stronę → subject, agreguj w JS;
- cache w procesie: `Map<key, {at, data}>`, TTL 10 min;
- payload per gra:
  - **tictactoe**: `firstMoveCounts[9]`, `winRateByFirstMove[9]`, `moveCounts[9]` (wszystkie ruchy);
  - **battleship**: `shotCounts[N²]` + `firstShotCounts[N²]` (per wariant rozmiaru);
  - **sudoku**: `errorRate`, `avgPoints`, rozkład `correct/incorrect` w czasie partii (kwartyle ruchów);
  - **scrabble**: `topWords[20]` (słowo, liczba zagrań, śr. punkty), `avgWordLength`, `passRate`, `exchangeRate`.
- migracja: indeksy `matches_p1 (p1_id, game)`, `matches_p2 (p2_id, game)` (D7).

### 5.2 UI

- `ModelCardPage.tsx`: sekcja **„Psychologia"** — nowy komponent `components/charts/BehaviorHeatmap.tsx` (siatka z intensywnością koloru; reuse stylu `Board3x3`/`BattleshipBoard`, ale renderuj własną lekką siatkę — bez stanu gry), lista top słów, wskaźniki procentowe w kafelkach HUD.
- `ComparePage.tsx`: dwie heatmapy obok siebie dla porównywanych modeli (ta sama gra/wariant).
- Copy (pl/en): krótki lead „Czy model ma nawyki? Rozkład decyzji ze wszystkich zapisanych partii" + zastrzeżenie o wielkości próby (pokaż `n`).

### 5.3 Testy

- unit agregacji (czyste funkcje: partie → rozkłady; osobny plik `lib/psychology.ts` na serwerze, testowalny bez DB);
- integracyjny endpointu (seed kilku partii → poprawne liczniki, cache TTL);
- UI smoke heatmapy (0 partii → empty state z zachętą).

---

## 6. Moduł D: Tryb Turinga („Kto jest botem?")

### 6.1 Serwer (`routes/turing.ts` + migracja)

- Tabela `turing_guesses`: `player_token text NOT NULL, match_id uuid NOT NULL REFERENCES matches(id), guess text NOT NULL CHECK (guess IN ('p1','p2')), correct boolean NOT NULL, nickname text, created_at timestamptz DEFAULT now()`, PK `(player_token, match_id)`.
- `GET /api/turing/next` (+ opcjonalnie `?game=`): wylosuj z ostatnich 500 partii spełniających filtr D8 taką, której ten `player_token` jeszcze nie zgadywał; zwróć `{puzzle: {game, variant, setup, moves: [{player, move}]}, puzzleToken}` — `puzzleToken` = krótkożyciowy JWT z `matchId` (reuse `auth/jwt.ts`, osobny `aud`). **Żadnej telemetrii, id modeli, nicków, czasu trwania.** Pusta pula → `404 {error:'no_puzzles'}` (UI ma empty state).
- `POST /api/turing/guess` `{puzzleToken, guess}` + nagłówek `x-player-token` (wzorzec z `predictions.ts`): zweryfikuj token, sprawdź kto był człowiekiem (strona z id `human`/`human:` — patrz `usesReservedSubjectId` w `result-schema.ts`), zapisz, zwróć `{correct, humanSide, modelId, matchId}` (teraz można linkować replay).
- `GET /api/turing/leaderboard`: accuracy per nickname przy ≥10 próbach, top 50.

### 6.2 UI

- Nowa strona **`TuringPage.tsx`** (route key `turing`): krokowy odtwarzacz partii (reuse komponentów replayowych — plansze per gra już renderują widok z ruchów), etykiety „Gracz A/B", dwa przyciski „A to człowiek"/„B to człowiek", po odpowiedzi reveal (model, wynik, link do replay) + przycisk „następna zagadka" + licznik serii (streak w localStorage).
- Mini-ranking detektywów pod spodem (z `/api/turing/leaderboard`); nickname z istniejących ustawień (wymóg jak w intuicji: bez nicka grasz, ale nie wchodzisz do rankingu).
- `packages/i18n`: `RouteKey 'turing'`; `App.tsx`; i18n pl/en; sitemap.

### 6.3 Testy

- unit: filtr puli (odrzuca lab/forfeit/krótkie), podpis+weryfikacja puzzleToken, wyznaczenie strony ludzkiej;
- integracyjny: next→guess round-trip, dedup PK (drugi guess = 409), leaderboard threshold;
- UI smoke: reveal flow.

---

## 7. Moduł E: Demo WebLLM na stronie głównej

- Nowy komponent `components/DemoBattle.tsx` osadzony na `ArenaPage` (obok/pod `QuickStartSection`): karta „**Dwa AI zagrają ze sobą w Twojej przeglądarce — bez klucza, bez chmury, offline**".
  - Gate 1: `navigator.gpu` — brak → tekst „Twoja przeglądarka nie wspiera WebGPU" + link do sekcji WebLLM w docs.
  - Gate 2: przycisk startu z jawnym rozmiarem pobrania modelu (weź z metadanych `WEBLLM_MODELS`; wybierz najmniejszy model listy — D9).
- Po kliknięciu: `ModelLoadBar` (istniejący store `model-load.ts`), potem `runMatch` z orchestratora: gra `tictactoe`/`standard`, obaj gracze z `createWebLlmPlayer` na TYM SAMYM załadowanym silniku, różne temperatury (0.2 vs 0.9), etykiety w stylu „(rozważny)" vs „(ryzykant)". Rendering: `Board3x3` + skrócony `GameLog` + panel myśli z modułu A, jeśli model coś zwraca (WebLLM: zwykle nie — panel się chowa).
- Koniec partii: wynik + „Zagraj jeszcze raz" + CTA „Zagraj z nim sam" (link do setupu z preselekcją WebLLM). Meczu nie zapisujemy (bez flow Turnstile); bump licznika live przez istniejący mechanizm `/finish`.
- Testy: unit gate'ów (WebGPU present/absent — mock `navigator.gpu`), smoke render karty; e2e oznacz `skip` gdy brak GPU w CI.

---

## 8. Moduł F: Pojedynek promptów (Prompt vs Prompt)

- `store/setup.ts`: nowy tryb lab `promptDuel` z polami `appendixA`, `appendixB`, `seriesLength (3|5|7)`, `seriesSeed`.
- Nowy `game/series.ts`: `runSeries(opts)` — pętla nad `runMatch`; partia k: strona p1 dostaje appendix A gdy k parzyste, B gdy nieparzyste (zamiana stron — D10); seedy per partia = `seriesSeed + k` (deterministyczne powtórzenie serii); agregacja `{aWins, bWins, draws, tokensA/B, costA/B, forfeitA/B}`; przerywalna przez `AbortSignal`; callback `onGameEnd` do UI.
- `SetupScreen.tsx` (sekcja lab): przełącznik „Pojedynek promptów", dwa textarea (limit długości jak dotychczasowy appendix), wybór N; `GameRunner.tsx` albo nowy lekki `SeriesRunner.tsx`: tablica wyników serii (kafelki partii, wynik na żywo), po zakończeniu **karta wyniku** „Prompt A vs Prompt B — model X, N partii, wynik a:b" (bez treści promptów w grafice — treść zostaje lokalna; D10).
- Zapis: opcjonalny per partia istniejącym flow lab (`lab=true`, appendix już dziś nie jest wysyłany na serwer — tak zostaje).
- Testy: `series.test.ts` (zamiana stron, determinizm seedów, agregacja, abort w połowie), UI smoke setupu i tablicy wyników.

---

## 9. Zmiany przekrojowe

- **`packages/i18n`**: `RouteKey` + `'failures' | 'turing'`, `SEGMENTS` pl/en (D11). Typ wymusi aktualizację wszystkich konsumentów (front + sitemap/hreflang/OG) — to zamierzone.
- **SEO/OG**: `og/seo.ts` — wpisy sitemap dla dwóch nowych stron; opcjonalne dedykowane OG dla muzeum (kafel z cytatem) w etapie szlifu.
- **Dokumentacja**: `SPEC.md` — nowe podsekcje (§16 aktualizacja wg D1; nowe §: halucynacje, turing, psychologia); `DECISIONS.md` — wpisy D1–D12; `README.md`/`README.pl.md` — sekcja features (po etapie szlifu, ze screenami do `handoff/screens/`).
- **Bezpieczeństwo**: CSP bez zmian (żadnych nowych originów). Limit body na `/api/result` (D12). Wszystkie nowe endpointy GET są publiczne i nie zwracają PII (jak `analytics.ts`); `POST /api/turing/guess` identyfikuje się `player_token` (pseudonim, jak `predictions`).
- **Rozmiar danych**: caps z D4 dają pesymistycznie ~2.5 KB/ruch ekstra; realne partie (tictactoe 5–9, scrabble 30–60 ruchów) mieszczą się z zapasem w limicie body.

---

## 10. Etapy realizacji

Kolejność maksymalizuje wczesny efekt przy minimalnym ryzyku: najpierw to, co działa na danych historycznych, potem przechwytywanie nowych danych, potem konsumenci tych danych.

| Etap | Zakres | Moduł | Kryterium ukończenia (poza zielonymi testami) |
|---|---|---|---|
| **0** | Fundamenty: typy `thoughts`/`rejections` w game-core + orchestrator + `buildResultPayload`, zod z capami, strip/trim w `results.ts`, limit body (D12), wpisy D1/D4/D12 w `DECISIONS.md` | A+B | Round-trip: mecz z nowymi polami zapisuje się i wraca w replayu; stare payloady (bez pól) przechodzą bez zmian |
| **1** | Ranking halucynacji z danych historycznych: endpoint `/api/hallucinations` (na razie tylko metryka forfeit), kolumna „Dyscyplina" w leaderboardzie, sekcja na karcie modelu | B | Kolumna widoczna z danymi wstecz; tooltip z definicją metryki |
| **2** | Przechwycenie `rejections` w runnerze + migracja (`failure_gallery`, kolumny agregatów w `ratings`, indeksy D7) + zapis w `submitResult` + rozszerzenie `/api/hallucinations` o metrykę D5(b) | B | Nowa partia z nielegalnym ruchem zostawia wiersz w galerii i podbija agregaty |
| **3** | Muzeum wpadek: `/api/failures`, `FailureMuseumPage`, route+i18n+sitemap | B | Strona live pokazuje wpadki z realnych partii; link do replayu działa |
| **4** | Tok myślenia — przechwycenie: katalog (`supportsReasoning`), transport (param + D3 fallback + `message.reasoning`), runner (`thoughts`), zapis | A | Partia modelem reasoning zapisuje przycięte myśli per ruch |
| **5** | Tok myślenia — UI: panel w `GameRunner`, wskaźnik w `GameLog`, myśli w `ReplayPage`, toggle w ustawieniach | A | Replay z myślami da się przewijać ruch po ruchu; udostępniony link pokazuje to samo |
| **6** | Psychologia modeli: `lib/psychology.ts` + endpoint + cache + `BehaviorHeatmap` na karcie modelu i w porównaniu | C | Heatmapa pierwszych ruchów tictactoe i strzałów battleship na karcie modelu z realnych danych; empty state przy n<10 |
| **7** | Tryb Turinga: migracja `turing_guesses`, endpointy next/guess/leaderboard, `TuringPage`, route+i18n+sitemap | D | Pełny flow zagadka→odpowiedź→reveal→ranking na danych produkcyjnych |
| **8** | Demo WebLLM na stronie głównej: `DemoBattle` + gating WebGPU + integracja z orchestratorem | E | Na maszynie z WebGPU: klik → pobranie → rozegrana partia bez klucza; bez WebGPU: czytelny komunikat |
| **9** | Pojedynek promptów: store, `series.ts`, UI setupu, tablica serii, karta wyniku | F | Seria 5 partii z zamianą stron kończy się kartą wyniku; abort w trakcie nie psuje stanu |
| **10** | Szlif: streaming SSE toku myślenia (3.4, opcjonalnie), OG muzeum, `SPEC.md`/`README` (EN+PL, screeny), e2e nowych stron, `smoke:live` | — | README z nowymi features; e2e zielone |

Po każdym etapie: `pnpm test`, `pnpm typecheck`; etapy z migracjami dodatkowo `pnpm --filter @arena/server test:integration` (Docker). Etapy 1–3, 4–5, 6, 7, 8, 9 są wzajemnie niezależne PO etapie 0 — w razie potrzeby można zmienić kolejność, ale 0 jest przedwarunkiem wszystkiego poza 6/8.

---

## 11. Ryzyka i pułapki (sprawdź w trakcie, nie po)

1. **Parametr reasoning na OpenRouterze** różni się między modelami (część wymaga `effort`, część `max_tokens`, część nie wspiera wcale) — dlatego D3 (fallback) jest obowiązkowy, a flaga pochodzi z katalogu, nie z listy hardcoded. Zweryfikuj kształt na 2–3 realnych modelach zanim uznasz etap 4 za skończony.
2. **Zod wycina nieznane klucze** — jeśli zapomnisz dodać pole do `result-schema.ts`, dane znikną PO CICHU (żadnego błędu). Test round-trip z etapu 0 ma to łapać.
3. **`retries` ≠ halucynacje** w danych historycznych (zawiera błędy transportu). Nie prezentuj historycznych retries jako „halucynacji" — tylko forfeit rate (D5a) działa wstecz uczciwie.
4. **Telemetria zdradza bota w trybie Turinga** — payload zagadki budowany jest ręcznie (whitelist pól), nie przez „usuń niepotrzebne". Test: snapshot payloadu next NIE zawiera kluczy `telemetry`, `thoughts`, `durationMs`, id modeli.
5. **Muzeum renderuje output modelu** — tylko tekst (React escapuje), bez markdown/linkifikacji, twardy limit długości. Ryzyko wulgaryzmów jest realne, ale niskie (output to próby ruchów); odnotuj w DECISIONS możliwość flagowania/purge po `match_id`.
6. **VRAM/OOM w demo WebLLM** — jeden silnik, obie strony (D9). Nie ulegnij pokusie „dwóch różnych modeli" bez zmierzenia pamięci na średnim laptopie.
7. **Rozrost jsonb** — capy z D4/D12 są częścią kontraktu; przy okazji etapu 2 sprawdź `pg_column_size` przykładowych partii scrabble z myślami w teście integracyjnym (asercja rozsądnego górnego pułapu, np. <256 KB).
8. **Pula zagadek Turinga może być mała** na starcie (mało partii human_vs_model bez forfeitów) — empty state jest częścią definicji ukończenia etapu 7, nie edge casem.
9. **Cache psychologii** trzyma dane w pamięci procesu — po deploy'u zimny start = pierwszy request wolniejszy; nie dodawaj Redisa, to świadomy trade-off (D7).
10. **Nazewnictwo w UI**: „halucynacja" ma tu znaczenie potoczne (nielegalny ruch/zmyślone słowo), nie akademickie — lead na stronie muzeum musi to uczciwie mówić (jedno zdanie), inaczej wiarygodność areny cierpi.
