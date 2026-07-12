# SPECYFIKACJA v4: LLM Game Arena (VPS + PostgreSQL, telemetria + moduł edukacyjny)

> Dokument dla Claude Code (model Opus 4.8). **Samowystarczalny — zastępuje v1–v3.**
> Delta względem v3: telemetria per ruch (czas, tokeny, koszt), wykresy w gamingowo-edukacyjnym L&F, moduł edukacyjny (komentator AI, analiza optymalności, karty modeli, laboratorium promptów, zgadywanka widza), powtórki z permalinkami, wyzwanie dnia, licznik kosztów. Infrastruktura: własny VPS + dedykowany PostgreSQL.
> Realizuj etapami (sekcja 19). Etapy 1–8 = rdzeń (v3), etapy 9–12 = nowe moduły. Po każdym etapie `pnpm test`.

---

## 1. Cel i pozycjonowanie

Arena gier logicznych dla modeli językowych i ludzi, która **uczy przez grę**: użytkownik bez orientacji w mnogości modeli ma po kilku partiach rozumieć, czym różnią się modele (szybkość, koszt, jakość rozumowania, dyscyplina formatu) — bez czytania benchmarków.

**Gry:** kółko i krzyżyk (3×3), statki (6×6 / 8×8 / 10×10). Architektura przygotowana na kolejne gry (sekcja 5).
**Tryby:** LLM vs LLM (obserwacja), człowiek vs LLM.
**Rankingi:** Elo + statystyki + telemetria, per tryb × gra × wariant.
**Moduł edukacyjny:** komentator AI, analiza po partii, karty modeli, laboratorium promptów, zgadywanka widza.

Wymagania nadrzędne:
- **Właściciel nie płaci za inferencję.** BYOK (OpenRouter), WebLLM w przeglądarce, opcjonalnie Ollama na VPS. Komentator AI również w tych ramach (sekcja 12.1).
- **Dowolny model** — dynamiczny katalog OpenRouter.
- **Anti-bot** — Cloudflare Turnstile (usługa darmowa, niezależna od hostingu).
- Język UI: **polski**, treści edukacyjne po polsku.

Świadome NIE-cele (nie implementuj): czatowe porównywanie odpowiedzi (robi to LMArena), ogólny leaderboard benchmarkowy (Kaggle Game Arena, Artificial Analysis), quizy oderwane od rozgrywki.

---

## 2. Model kosztowy inferencji (KRYTYCZNE)

### 2.1 BYOK przez OpenRouter (główna ścieżka)
- Użytkownik podaje własny klucz OpenRouter; klucz żyje **wyłącznie w `localStorage`** i jest wysyłany **tylko** do `https://openrouter.ai/api/v1` (CORS wspierany). Klucz NIGDY nie trafia do backendu — utrzymuj w CSP i opisz w README.
- Katalog modeli z `GET /api/v1/models` (cache 1 h), z cenami — ceny wykorzystuje telemetria (sekcja 9). Filtr „tylko darmowe" (warianty `:free`).

### 2.2 WebLLM (darmowy, bez klucza)
- `@mlc-ai/web-llm` (WebGPU): `Llama-3.2-3B-Instruct`, `Phi-3.5-mini-instruct`, `Qwen2.5-3B-Instruct` (q4f16). Detekcja `navigator.gpu`, pasek pobierania wag, cache przez Cache API.

### 2.3 Ollama na VPS (opcjonalne, flaga `ENABLE_OLLAMA=false`)
- Proxy `POST /api/ollama/chat` → `http://127.0.0.1:11434`; sekcja „Serwer (Ollama)" w selektorze. Jedyny provider zużywający zasoby właściciela → kolejka: maks. 1 równoległa partia. Partie tym providerem oznaczane `server_verified`.

---

## 3. Stack technologiczny

| Warstwa | Technologia |
|---|---|
| Build | Vite; React 18 + TypeScript (strict); Tailwind CSS; Zustand |
| Wykresy | **Recharts** |
| Inferencja | OpenRouter REST (przeglądarka), `@mlc-ai/web-llm`, opcjonalnie Ollama (proxy) |
| Backend | Node.js 22 LTS + Hono (`@hono/node-server`), serveStatic dla frontu (jeden port) |
| ORM / migracje | Drizzle ORM + drizzle-kit |
| Baza | PostgreSQL ≥ 15 (istniejąca instancja właściciela) |
| Anti-bot | Cloudflare Turnstile |
| Proxy/TLS | Caddy (Caddyfile w repo) + snippet nginx w README |
| Deploy | Docker Compose (app; Postgres zewnętrzny) + alternatywny systemd unit |
| Testy | Vitest; testy integracyjne API z testcontainers-postgres |

---

## 4. Look & feel (obowiązujący kierunek)

- **Gamingowo-edukacyjny:** ciemny motyw (tło ~#0B1020), neonowe akcenty per gracz (P1 cyjan, P2 magenta), monospace w logach i statystykach, subtelne glow na aktywnych elementach, animacje ruchów (spring), dźwięki opcjonalne (toggle, domyślnie off).
- **Karty postaci:** model prezentowany jak bohater gry — awatar generowany deterministycznie z id (identicon), pasek Elo, radar cech.
- Wykresy w tej samej stylistyce: siatka o niskim kontraście, tooltips z pełnymi danymi, etykiety po polsku.
- Czytelność ponad efekciarstwo: każdy wykres ma jedno zdanie objaśnienia „co z tego wynika" (stały slot UI).
- Nie zostawiaj generycznego wyglądu bibliotek. Mobile-first, tap targets ≥ 44 px.

---

## 5. Architektura wielogrowa

Pakiet współdzielony `packages/game-core` (czysty TS, bez DOM i Node API — działa w przeglądarce i na serwerze):

```ts
interface GameDefinition<S, M> {
  id: 'tictactoe' | 'battleship';
  variants: Variant[];
  createInitialState(variant: Variant, config: SetupConfig): S;
  legalMoves(state: S, player: PlayerSide): M[];
  applyMove(state: S, player: PlayerSide, move: M): S;   // immutable, throw na nielegalny
  status(state: S): 'playing' | 'p1_won' | 'p2_won' | 'draw';
  viewFor(state: S, player: PlayerSide): PlayerView;      // gry z ukrytą informacją!
  renderPrompt(view: PlayerView, legal: M[]): { system: string; user: string };
  parseMove(raw: string, legal: M[]): M | null;
  serializeSetup(state: S): SetupRecord;                  // do walidacji replay
  // NOWE (moduł edukacyjny, opcjonalne per gra):
  evaluateMove?(state: S, player: PlayerSide, move: M): MoveEval; // sekcja 12.2
}

interface Player {
  id: string;            // "openrouter:<model>", "webllm:<model>", "ollama:<model>", "human"
  displayName: string;
  kind: 'human' | 'llm';
  getMove(view: PlayerView, legal: Move[]): Promise<MoveResult>; // MoveResult = ruch + telemetria
}

interface MoveTelemetry {
  latencyMs: number;
  promptTokens?: number;      // z pola usage odpowiedzi API (OpenRouter/Ollama); WebLLM: z runtime stats
  completionTokens?: number;
  retries: number;            // 0..3
  forfeit: boolean;           // ruch losowy po wyczerpaniu prób
  costUsd?: number;           // tokeny × cennik modelu (snapshot cen z katalogu w momencie partii)
}
```

Orchestrator (frontend) wspólny dla gier: widok → gracz → walidacja → aplikacja → log (ruch + telemetria).
**Zasada bezwzględna:** prompt budowany wyłącznie z `PlayerView`; model nigdy nie widzi rozstawienia przeciwnika. Test snapshotowy w `game-core`.

---

## 6. Gra 1: Kółko i krzyżyk

Plansza 3×3, pola 0–8. `viewFor` zwraca pełny stan (brak ukrytej informacji).

System prompt (EN, stały):
```
You are playing tic-tac-toe. You play as {SYMBOL}.
The board uses cell indices 0-8 (left-to-right, top-to-bottom).
Current board:
{ASCII_BOARD_WITH_INDICES_ON_EMPTY_CELLS}
Occupied cells: {list}
Legal moves: {list}
Respond with ONLY a JSON object: {"move": <cell_index>}
No explanation, no markdown, no code fences.
```
Historia ruchów partii w wiadomości user. Parsowanie: (1) `JSON.parse`, (2) regex `\{[^}]*"move"\s*:\s*(\d)[^}]*\}`, (3) pierwsza samotna cyfra 0–8. Walidacja: lista legalnych.

**Solver minimax (NOWE, `game-core/solvers/tictactoe.ts`):** pełny minimax z memoizacją (przestrzeń stanów trywialna). Zwraca wartość każdego legalnego ruchu (`win/draw/loss` z perspektywy grającego). Używany WYŁĄCZNIE w analizie po partii i komentarzu (12.2) — nigdy jako gracz w rankingu.

---

## 7. Gra 2: Statki

### 7.1 Warianty i floty
| Wariant | Plansza | Flota (długości) |
|---|---|---|
| `small` | 6×6 | 3, 2, 2, 1, 1 |
| `medium` | 8×8 | 4, 3, 3, 2, 2, 1 |
| `classic` | 10×10 | 5, 4, 3, 3, 2 |

Rozstawienie: linie proste, bez zachodzenia, **bez stykania — również po skosie** (otoczka 1 pola). Rozgrywka: współrzędne `A..J` × `1..10`; tura = strzał; **dodatkowy strzał po trafieniu** (flaga `extraShotOnHit`, domyślnie `true`, w promptcie); wynik `miss|hit|sunk` (zatopienie ujawnia komórki statku); wygrywa zatopienie floty; bezpiecznik `2 × N²` tur.

### 7.2 Rozstawienie
Człowiek: ekran rozstawiania (tap + obrót, „Rozstaw losowo", walidacja na żywo). LLM: **zawsze losowe z silnika** (seed w rekordzie partii) — nie proś modelu o rozstawienie (małe modele produkują nielegalne układy; losowość jest strategicznie neutralna).

### 7.3 Protokół LLM
`PlayerView`: własna plansza, plansza śledzenia (`?`/`M`/`H`/`S`), zatopione statki wroga + długości pozostałych, pełna lista legalnych celów.

```
You are playing Battleship on a {N}x{N} grid. Columns A-{maxCol}, rows 1-{N}.
Rule: {extra shot on hit: yes/no}. Ships cannot touch each other.
Your tracking board ('?' unknown, 'M' miss, 'H' hit, 'S' sunk):
{TRACKING_BOARD}
Enemy ships remaining (lengths): {list}
Cells not yet fired at: {compact list}
Respond with ONLY a JSON object: {"shot": "<cell>"} e.g. {"shot": "C5"}
No explanation, no markdown, no code fences.
```
Parsowanie: (1) `JSON.parse`, (2) regex `"shot"\s*:\s*"?([A-J](?:10|[1-9]))"?`, (3) pierwsza wolna współrzędna w tekście.

**Heurystyka oceny strzału (NOWE, `game-core/solvers/battleship.ts`):** statki nie mają pełnego solvera; do analizy po partii licz mapę prawdopodobieństw (liczba możliwych ułożeń pozostałych statków przechodzących przez każdą komórkę, zgodnych z historią strzałów). Ocena ruchu = percentyl strzału względem tej mapy + rozpoznanie trybu „polowanie po trafieniu" (strzał przyległy do świeżego `H` = dobry). Wynik: `optimal | good | weak | blunder`.

### 7.4 UI statków
Dwie plansze („Twoja flota"/„Twoje strzały"; mobile: przełącznik), animacje plusk/eksplozja/zatopienie, licznik statków. LLM vs LLM: widok boga + log z telemetrią.

---

## 8. Wspólny protokół LLM

Retry: nielegalny/nieparsowalny ruch → komunikat korygujący z listą legalnych → maks. **3 próby** → **losowy legalny ruch** + `forfeit=true` w telemetrii. Timeout 30 s; `temperature` domyślnie 0.2 (patrz 12.4 — suwak w laboratorium); `max_tokens: 50–60`.

---

## 9. Telemetria (NOWE)

### 9.1 Zbieranie
Provider mierzy per wywołanie: `latencyMs` (od fetch do odpowiedzi, suma przy retry), tokeny z pola `usage` odpowiedzi (OpenRouter i Ollama je zwracają; WebLLM: statystyki runtime; braki = null, UI pokazuje „—"), `retries`, `forfeit`, `costUsd` = tokeny × cennik modelu z katalogu (snapshot ceny zapisywany w partii, żeby historyczne partie nie zmieniały kosztu po zmianie cennika).

### 9.2 Agregacja w rankingu
Obok Elo/W/L/D per podmiot: mediana czasu ruchu, śr. tokeny/ruch, śr. koszt/partię, **forfeit rate** (% ruchów wymuszonych). Agregaty przeliczane transakcyjnie przy zapisie partii (kolumny w `ratings`, sekcja 13).

### 9.3 Wykresy (Recharts, L&F z sekcji 4)
1. **Oś czasu partii** (ekran gry, na żywo + powtórka): słupki czasu myślenia per ruch, kolory graczy, markery retry/forfeit. Objaśnienie: „dłuższy słupek = model dłużej 'myślał'".
2. **Radar modelu** (karta modelu i ekran rankingu): 5 osi znormalizowanych 0–100 względem populacji rankingu — Siła (Elo), Szybkość (odwrotność mediany czasu), Dyscyplina (100 − forfeit rate), Oszczędność (odwrotność tokenów/ruch), Taniość (odwrotność kosztu/partię).
3. **Scatter koszt vs skuteczność** (ekran rankingów): X = śr. koszt/partię (log), Y = Elo, promień = liczba partii. Objaśnienie: „drożej nie zawsze znaczy lepiej".
4. **Przebieg Elo w czasie** (karta modelu): linia po każdej zapisanej partii.
5. **Porównanie 2 modeli** (ekran „Porównaj"): radar nałożony + tabela head-to-head z historii wspólnych partii.

Każdy wykres: tooltip z surowymi liczbami, stan pusty („za mało danych — rozegraj partie"), eksport PNG (funkcja Recharts/canvas).

---

## 10. Rankingi

Zakres: **mode** (`model_vs_model` | `human_vs_model`) × **game** × **variant**. Elo start 1000, K=32, remis 0.5 (czysta funkcja + testy). `human_vs_model`: ranking modeli przeciw ludziom + osobny ranking ludzi (opcjonalny pseudonim + `player_token` w localStorage; bez pseudonimu człowiek nie pojawia się w tabeli). Tabela: pozycja, podmiot (awatar), Elo, partie, W/L/D, forfeit %, mediana czasu, koszt/partię. Zapis wyniku **opt-in** (karta po partii: zmiana Elo ±, „Zapisz do rankingu", „Rewanż", „Udostępnij powtórkę").

---

## 11. Powtórki i udostępnianie (NOWE)

- Każda zapisana partia ma permalink `/replay/:id` (публiczny, bez logowania): odtwarzacz krok-po-kroku (prev/next/auto-play), plansza + oś czasu telemetrii + adnotacje analizy (12.2) + komentarze komentatora, jeśli były.
- Meta-tagi OG (tytuł: „GPT-x vs Claude-y — statki 10×10", obrazek: render finalnej planszy przez endpoint `GET /api/og/:id` generujący PNG z canvas po stronie serwera — użyj `@napi-rs/canvas`).
- Przycisk „Skopiuj link" po partii. Powtórka czyta dane z `matches` — zero dodatkowego stanu.

---

## 12. Moduł edukacyjny (NOWE — wyróżnik produktu)

### 12.1 Komentator AI
- Trzeci model komentuje partię LLM vs LLM (a na życzenie także partię człowieka) prostym polskim językiem, 1–2 zdania po wybranych ruchach.
- **Koszt:** komentator używa TEGO SAMEGO źródła co gracze — klucza OpenRouter użytkownika (rekomenduj w UI tani/darmowy model, np. wariant `:free`) albo WebLLM/Ollama. Domyślnie wyłączony; włączenie = wybór modelu komentatora.
- Prompt komentatora dostaje: stan planszy (widok boga — komentator może widzieć wszystko, bo nie gra), ostatni ruch, ocenę ruchu z solvera/heurystyki (12.2) i instrukcję: po polsku, maks. 2 zdania, ton lekki, wyjaśniaj „dlaczego", zero technicznego żargonu. Komentarze renderowane jako dymki w logu partii, zapisywane w rekordzie partii (opcjonalnie), widoczne w powtórce.
- Wywołania komentatora nie blokują rozgrywki (fire-and-forget z kolejką; spóźniony komentarz doklejany do właściwego ruchu).

### 12.2 Analiza po partii („Powtórka z trenerem")
- Kółko i krzyżyk: minimax (6) klasyfikuje każdy ruch: `optimal` (nie pogarsza wyniku) / `blunder` (zmienia wygraną→remis lub remis→przegraną) / `weak`. Statki: heurystyka percentylowa (7.3).
- Ekran analizy: plansza krok-po-kroku z kolorowymi znacznikami (zielony/żółty/czerwony), % ruchów optymalnych per gracz, „moment zwrotny" partii (pierwszy blunder zwycięzcy/przegranego).
- Metryka `% ruchów optymalnych` agregowana per model w rankingu kółka i krzyżyka (kolumna „Precyzja") — obiektywna, zrozumiała dla laika miara jakości rozumowania.

### 12.3 Karty modeli po ludzku
- Karta modelu (`/model/:id`): radar, przebieg Elo, staty + **opis po polsku dla laika** generowany z metadanych katalogu OpenRouter szablonem reguł (rozmiar/ceny/kontekst → zdania typu „szybki i tani model do prostych zadań; bywa niezdyscyplinowany w formacie odpowiedzi"). Generowanie szablonem (deterministyczne, zero kosztów), NIE modelem.
- Sekcja „Jak czytać te liczby?" — stały, ręcznie napisany tekst edukacyjny (dostarcz treść w `i18n/pl.ts`): czym jest token, czemu modele halucynują ruchy, czemu mały model bywa lepszy do prostych zadań.

### 12.4 Laboratorium promptów
- Przed partią (tryb „Lab", opt-in): edycja **dopisku do system promptu** swojego modelu (np. „graj agresywnie, zawsze zaczynaj od rogu") + suwak `temperature` 0–1.5 z objaśnieniem.
- Dopisek jest doklejany PO stałym rdzeniu promptu (rdzeń z sekcji 6/7 nienaruszalny — format odpowiedzi musi przetrwać). Partie z trybu Lab **nie liczą się do rankingu** (flaga `lab=true`, wykluczone z Elo) — inaczej ranking przestaje porównywać modele.
- Po partii: porównanie telemetrii z partią bazową („z Twoim promptem model robił 2× mniej forfeitów").

### 12.5 Zgadywanka widza
- Przed startem partii LLM vs LLM widz obstawia zwycięzcę (przycisk P1/P2/remis). Trafienia = punkty intuicji zapisywane pod `player_token`; osobna tabela „Ranking intuicji" (najlepsi w przewidywaniu wyników). Zero hazardu, zero stawek — wyłącznie punkty.

### 12.6 Wyzwanie dnia
- Codziennie deterministycznie losowana para (gra+wariant, model przeciwnika z puli darmowych/WebLLM): „Pokonaj dziś {model} w statki 8×8". Wynik dnia (zaliczone/nie) pod `player_token`, licznik serii (streak). Konfiguracja wyzwania liczona z daty (seed = data), bez cronu.

---

## 13. Schemat PostgreSQL (Drizzle → migracje)

```sql
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL CHECK (mode IN ('model_vs_model','human_vs_model')),
  game TEXT NOT NULL, variant TEXT NOT NULL,
  p1_id TEXT NOT NULL, p2_id TEXT NOT NULL,
  winner TEXT CHECK (winner IN ('p1','p2','draw')),
  moves JSONB NOT NULL,          -- [{player, move, telemetry:{latencyMs,promptTokens,completionTokens,retries,forfeit,costUsd}, eval?}]
  setup JSONB,                   -- statki: rozstawienia + seed
  commentary JSONB,              -- [{moveIndex, text, modelId}] — opcjonalne
  price_snapshot JSONB,          -- cennik modeli w momencie partii
  moves_hash TEXT NOT NULL,
  lab BOOLEAN NOT NULL DEFAULT false,
  server_verified BOOLEAN NOT NULL DEFAULT false,
  forfeit_moves_p1 INT NOT NULL DEFAULT 0, forfeit_moves_p2 INT NOT NULL DEFAULT 0,
  duration_ms INT, client_ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX matches_dedup ON matches (moves_hash);
CREATE INDEX matches_lb ON matches (mode, game, variant, created_at DESC);

CREATE TABLE ratings (
  subject_id TEXT NOT NULL, mode TEXT NOT NULL, game TEXT NOT NULL, variant TEXT NOT NULL,
  elo REAL NOT NULL DEFAULT 1000,
  wins INT NOT NULL DEFAULT 0, losses INT NOT NULL DEFAULT 0, draws INT NOT NULL DEFAULT 0,
  games INT NOT NULL DEFAULT 0, forfeit_moves INT NOT NULL DEFAULT 0, total_moves INT NOT NULL DEFAULT 0,
  latency_ms_sum BIGINT NOT NULL DEFAULT 0,          -- do średnich; mediana z matches on-demand (cache 5 min)
  tokens_sum BIGINT NOT NULL DEFAULT 0,
  cost_usd_sum NUMERIC(12,6) NOT NULL DEFAULT 0,
  optimal_moves INT NOT NULL DEFAULT 0,              -- kółko i krzyżyk: Precyzja
  PRIMARY KEY (subject_id, mode, game, variant)
);

CREATE TABLE elo_history (
  id BIGSERIAL PRIMARY KEY,
  subject_id TEXT NOT NULL, mode TEXT NOT NULL, game TEXT NOT NULL, variant TEXT NOT NULL,
  match_id UUID NOT NULL REFERENCES matches(id),
  elo_after REAL NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX elo_hist_idx ON elo_history (subject_id, mode, game, variant, created_at);

CREATE TABLE predictions (             -- zgadywanka widza
  id BIGSERIAL PRIMARY KEY,
  player_token TEXT NOT NULL, nickname TEXT,
  match_id UUID REFERENCES matches(id),
  predicted TEXT NOT NULL CHECK (predicted IN ('p1','p2','draw')),
  correct BOOLEAN, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE daily_results (           -- wyzwanie dnia
  player_token TEXT NOT NULL, day DATE NOT NULL,
  completed BOOLEAN NOT NULL, match_id UUID REFERENCES matches(id),
  PRIMARY KEY (player_token, day)
);

CREATE TABLE used_jti (jti UUID PRIMARY KEY, used_at TIMESTAMPTZ NOT NULL DEFAULT now());
```

Zapis partii + `ratings` (dwa wiersze, `FOR UPDATE`) + `elo_history` w jednej transakcji. Partie `lab=true`: zapis do `matches` dozwolony (powtórki), zero wpływu na `ratings`/`elo_history`.

---

## 14. API backendu (Hono)

| Endpoint | Opis |
|---|---|
| `POST /api/verify` | Turnstile `siteverify` → session JWT (HS256, TTL 30 min, unikalny `jti`) |
| `POST /api/result` | Zapis partii (JWT wymagany, `jti` jednorazowe). Walidacja replay + sanity checks (15). Transakcyjna aktualizacja ratingów, o ile `lab=false` |
| `GET /api/leaderboard?mode=&game=&variant=` | Ranking z telemetrią; cache in-memory 60 s |
| `GET /api/model/:id` | Karta modelu: staty, przebieg Elo, head-to-head |
| `GET /api/matches/recent` / `GET /api/replay/:id` | Ostatnie partie / dane powtórki |
| `GET /api/og/:id` | PNG finalnej planszy (`@napi-rs/canvas`) do OG |
| `POST /api/prediction` `GET /api/predictions/leaderboard` | Zgadywanka (JWT wymagany do POST) |
| `GET /api/daily` `POST /api/daily/result` | Wyzwanie dnia (seed = data) |
| `GET /api/health` | ping DB |
| `/api/ollama/*` | za flagą `ENABLE_OLLAMA`, z kolejką |

Rate limiting (in-memory sliding window per IP): `verify` 30/h, `result` 60/h, `prediction` 60/h, `og` 120/h. Za proxy: `X-Forwarded-For` tylko przy `TRUSTED_PROXY=true`.

---

## 15. Walidacja wyników (anty-oszustwo)

Gra toczy się w przeglądarce — pełnej gwarancji uczciwości nie ma. Warstwy:
1. **Replay serwerowy:** backend odtwarza partię z `moves`+`setup` współdzielonym `game-core`; odrzuca przy nielegalnym ruchu lub niezgodnym wyniku. Rewaliduje też `eval` (12.2) — liczy sam, nie ufa klientowi.
2. **JWT z Turnstile**, jednorazowy `jti`.
3. **Sanity:** min. średni czas ruchu LLM ≥ 3 s (nie dotyczy WebLLM/Ollama — te bywają szybkie lokalnie; flaga providera w payloadzie), limit partii/IP/dzień, deduplikacja `moves_hash`, telemetria w rozsądnych widełkach (koszt ≤ 1 USD/partię, tokeny ≤ 5k/ruch — powyżej: zapis bez agregacji telemetrii + log ostrzeżenia).
4. **Uczciwa komunikacja:** dopisek w UI, że wyniki pochodzą ze środowiska klienckiego; wyjątek `server_verified` dla partii Ollama.

Nie buduj serwerowego proxy dla kluczy OpenRouter użytkowników.

---

## 16. Bezpieczeństwo i prywatność

- Klucz OpenRouter: tylko `localStorage`, tylko do `openrouter.ai` (+ `HTTP-Referer`, `X-Title`). Checklist w README.
- CSP: `connect-src 'self' https://openrouter.ai https://challenges.cloudflare.com` + CDN MLC. HSTS, `X-Content-Type-Options`, `Referrer-Policy`.
- `moves` bez treści promptów/odpowiedzi (wyjątek: `commentary` — jawnie opt-in). `player_token` = losowy UUID, bez danych osobowych; pseudonimy moderuj prostym filtrem wulgaryzmów.
- Sekrety w `.env` (`DATABASE_URL`, `TURNSTILE_SECRET`, `JWT_SECRET`, `ENABLE_OLLAMA`, `TRUSTED_PROXY`); `.env.example` w repo. Rola Postgres tylko do schematu aplikacji.

---

## 17. UI / ekrany (komplet)

1. **Główny:** kafle gier → wariant → tryb → selektor modeli (wyszukiwarka, filtr darmowych, sekcje OpenRouter/WebLLM/Ollama) → opcje (komentator on/off + model; tryb Lab) → Turnstile → Start. Obok: kafel „Wyzwanie dnia" ze streakiem.
2. **Gra:** plansza per gra, log z telemetrią i dymkami komentatora, wykres osi czasu na żywo, pauza/krok/rewanż, wskaźnik „model myśli".
3. **Rozstawianie statków** (człowiek).
4. **Karta wyniku:** rezultat, ΔElo, mini-podsumowanie telemetrii („partia kosztowała ~$0.004"), przyciski: Zapisz do rankingu / Analiza / Powtórka+link / Rewanż.
5. **Analiza po partii** (12.2).
6. **Rankingi:** tabela + scatter koszt/Elo + przełączniki; zakładka „Ranking intuicji".
7. **Karta modelu** (12.3) + ekran **Porównaj** (2 modele).
8. **Powtórka** `/replay/:id` (11).
9. **Ustawienia:** klucz OpenRouter (test/usuń/komunikat o lokalności), pseudonim, dźwięki.
10. Sekcja edukacyjna „Jak czytać te liczby?" (12.3) linkowana z rankingu i kart.

---

## 18. Struktura projektu (monorepo pnpm)

```
/
├─ packages/game-core/
│  ├─ tictactoe.ts  battleship.ts  elo.ts  replay.ts
│  ├─ solvers/tictactoe.ts  solvers/battleship.ts     (+ testy do wszystkiego)
├─ apps/web/
│  ├─ src/providers/{openrouter,webllm,ollama,human}.ts
│  ├─ src/game/orchestrator.ts  src/game/commentator.ts
│  ├─ src/auth/turnstile.ts  src/store/  src/i18n/pl.ts
│  └─ src/components/   # Board3x3, BattleshipBoard, ShipPlacement, ModelPicker, GameLog,
│                       # TimelineChart, RadarCard, ScatterCostElo, EloHistory, CompareView,
│                       # Leaderboard, ResultCard, AnalysisView, ReplayPlayer, DailyChallenge, PredictionBar
├─ apps/server/
│  ├─ src/index.ts  src/routes/*.ts  src/db/schema.ts  src/og/render.ts
│  └─ drizzle/
├─ deploy/  (docker-compose.yml, Dockerfile multi-stage, Caddyfile, llm-arena.service)
├─ .env.example
└─ README.md
```

---

## 19. Plan implementacji (kolejność obowiązkowa)

**Rdzeń (jak v3):**
1. Monorepo; `game-core`: `GameDefinition` + kółko i krzyżyk + testy; plansza 3×3 grywalna lokalnie.
2. Providery (OpenRouter BYOK + selektor, Human), parser + retry/forfeit, oba tryby; **od początku zbieraj `MoveTelemetry`** (latency, retries; tokeny/koszt gdy dostępne).
3. `battleship.ts` + generator rozstawień + testy (1000 losowych układów legalnych); UI statków, 3 warianty, oba tryby.
4. `WebLlmProvider`.
5. Backend: health, verify (Turnstile) + JWT; blokada startu; serveStatic.
6. Postgres: schemat + migracje; `elo.ts`, `replay.ts`; result/leaderboard/matches; rate limiting; ekran rankingów (z kolumnami telemetrii); karta wyniku z opt-in zapisem; testy integracyjne (testcontainers).
7. (flaga) Ollama provider + proxy + kolejka + `server_verified`.
8. Deploy: Dockerfile, compose, Caddyfile, systemd, `.env.example`, README, CSP.

**Moduły v4:**
9. **Wykresy:** TimelineChart (gra na żywo), RadarCard, ScatterCostElo, EloHistory (+ `elo_history` w transakcji zapisu), CompareView. Objaśnienia pod wykresami.
10. **Analiza:** solvery (minimax + heurystyka statków) + testy (minimax: znane pozycje, np. ruch blokujący jest jedynym optymalnym); ekran analizy; kolumna Precyzja w rankingu; rewalidacja `eval` na serwerze.
11. **Powtórki + OG:** `/replay/:id`, ReplayPlayer, `GET /api/og/:id`, meta-tagi, „Skopiuj link".
12. **Edukacja i społeczność:** komentator (12.1), karty modeli + teksty „Jak czytać te liczby?" (12.3), laboratorium (12.4, flaga `lab`), zgadywanka (12.5), wyzwanie dnia (12.6).

Po każdym etapie: `pnpm test` + smoke test. Nie przechodź dalej z czerwonymi testami. Etapy 1–8 dają kompletny, wdrażalny produkt — moduły 9–12 dokładaj na działającym rdzeniu.

---

## 20. Kryteria akceptacji (delta względem rdzenia)

Rdzeń: wszystkie kryteria v3 (partie do końca w obu grach i trybach, WebLLM offline od OpenRouter, legalne rozstawienia, prompt bez informacji ukrytej — test snapshotowy, odrzucanie nielegalnych/zduplikowanych wyników, poprawne Elo, klucz tylko do openrouter.ai, `docker compose up` + README wystarczają do wdrożenia).

Nowe:
1. Każdy ruch LLM w logu i w `matches.moves` ma telemetrię; braki tokenów (WebLLM) renderowane jako „—", nie 0.
2. Koszt partii liczony ze snapshotu cen; suma na karcie wyniku zgadza się z sumą per ruch.
3. Radar normalizuje osie względem populacji rankingu i nie wybucha przy < 2 podmiotach (stan pusty).
4. Minimax: 100% poprawności na zestawie testowych pozycji; klasyfikacja blunderów zgodna z definicją 12.2; serwer rewaliduje `eval` i odrzuca sfałszowany.
5. Partie `lab=true` nigdy nie zmieniają `ratings` ani `elo_history`.
6. Komentator nie blokuje rozgrywki; wyłączony domyślnie; działa na darmowym modelu `:free`.
7. `/replay/:id` działa bez JWT i bez klucza API; OG-obrazek renderuje się < 1 s.
8. Zgadywanka: przewidywanie można złożyć tylko przed pierwszym ruchem partii; wynik rozliczany przy zapisie partii.
9. Wyzwanie dnia deterministyczne per data (ten sam dzień = ta sama konfiguracja dla wszystkich), streak liczony poprawnie przez zmianę miesiąca/roku.
