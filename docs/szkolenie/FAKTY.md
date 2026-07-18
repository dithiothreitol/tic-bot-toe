# FAKTY — źródło prawdy dla materiałów szkoleniowych

> Ten plik jest jedynym dozwolonym źródłem liczb, dat i cytatów w Zeszytach 1–4 i na slajdach LinkedIn (decyzja D5 w [`docs/PLAN-MATERIALY-SZKOLENIOWE.md`](../PLAN-MATERIALY-SZKOLENIOWE.md)).
> Czego nie ma tutaj ani w `PYTANIA-DO-AUTORA.md` — tego w materiałach nie ma.
> **Stan: 18.07.2026** (gałąź `feat/sudoku-scrabble`). Wszystkie liczby policzalne z `git log` tego repozytorium.

---

## 1. Jednozdaniowe streszczenie

Działająca, publiczna aplikacja webowa (arena, w której modele językowe grają w gry logiczne przeciw sobie i ludziom) powstała w **6 dni kalendarzowych** (12–18.07.2026), w **71 commitach**, których kod w całości napisały agenty AI. Człowiek odpowiadał za koncepcję, specyfikację, briefy, decyzje i weryfikację — nie za pisanie kodu.

---

## 2. Kto za co odpowiadał (rola × wykonawca)

| Rola | Wykonawca | Dowód w repo |
|---|---|---|
| Koncepcja, research, pozycjonowanie | Człowiek (Dariusz Tyszka) + **Claude (Cowork)** | zapis rozmowy: [`zrodla/research-cowork.md`](./zrodla/research-cowork.md) |
| Specyfikacja wymagań (v1→v4) | Człowiek + Cowork → dokument | ewolucja w [`zrodla/research-cowork.md`](./zrodla/research-cowork.md); finał [`SPEC.md`](../../SPEC.md) |
| Briefy inicjatyw | Człowiek + Cowork → dokumenty | [`docs/PLAN-SUDOKU-SCRABBLE.md`](../PLAN-SUDOKU-SCRABBLE.md), [`docs/PLAN-EFEKT-WOW.md`](../PLAN-EFEKT-WOW.md), [`docs/PLAN-TOZSAMOSC-ANTYBOT.md`](../PLAN-TOZSAMOSC-ANTYBOT.md), [`docs/ASSETS-PLAN.md`](../ASSETS-PLAN.md) |
| **Realizacja rdzenia + większość funkcji** | **Claude Code + Opus 4.8 (1M context)** | 49 commitów, trailer `Co-Authored-By: Claude Opus 4.8 (1M context)` |
| Code-review / poprawki bezpieczeństwa | Claude Code + Opus 4.8 | 6 commitów, trailer `Co-Authored-By: Claude Opus 4.8` |
| **Realizacja pakietu „Efekt WOW"** | **Claude Code + Claude Fable 5** | 16 commitów, trailer `Co-Authored-By: Claude Fable 5` |
| Decyzje, recenzje, weryfikacja na żywo | Człowiek (Dariusz Tyszka) | autor wszystkich 71 commitów (`git log --format=%an`); `DECISIONS.md` |

> Podział „koncepcja = człowiek + Cowork, realizacja = Claude Code" jest kluczowym przesłaniem materiałów. Modele Opus 4.8 i Fable 5 pracowały **wewnątrz Claude Code** (agent w VS Code, który czyta/edytuje/uruchamia/testuje/commituje repo). Cowork był narzędziem fazy koncepcyjnej i dokumentowej.

---

## 2a. Faza koncepcji — jak SPEC rósł v1→v4 w Claude (Cowork)

Źródło: [`zrodla/research-cowork.md`](./zrodla/research-cowork.md). Cała specyfikacja powstała w **jednej rozmowie** z Claude (Cowork), przyrostowo — każde pytanie autora dokładało warstwę. To modelowy przykład „researchu przez dialog", zanim padła pierwsza linia kodu.

> **Headline do slajdu:** cała faza koncepcji — research, analiza konkurencji i SPEC v1→v4 — zajęła **~30 minut**, prowadzona **z telefonu, jako pasażer w samochodzie** (potwierdzone przez autora). Kod ruszył dopiero później (12.07.2026).

| Wersja | Impuls od autora | Co doszło |
|---|---|---|
| **v1** | „kółko i krzyżyk, modele grają przeciw sobie i człowiekowi, odporne na boty, dowolny model, ja nie płacę" | OpenRouter BYOK + WebLLM (darmowy), Turnstile (anti-bot), rdzeń: parser ruchów z retry i fallbackiem (najbardziej awaryjny element) |
| *(research)* | „są apki, które to robią?" | Cowload przeszukał sieć: Kaggle Game Arena, game-arena.ai, LAION, TextArena → wniosek: **ta konkretna nisza jest wolna** |
| **v2** | „rankingi + statki z wyborem planszy" | Elo (1000, K=32) per tryb×gra×wariant, forfeit rate, walidacja partii przez replay; statki 6×6/8×8/10×10; architektura `GameDefinition` |
| **v3** | „hostuję na własnym VPS z Postgresem" | zejście z Cloudflare (poza Turnstile) na Node 22 + Hono + Docker Compose + Postgres/Drizzle; opcjonalny Ollama + `server_verified` |
| **v4** | „dodaj telemetrię, wykresy, wartość edukacyjną — bez powielania innych" | telemetria per ruch, wykresy (oś czasu / radar / koszt-vs-skuteczność), moduł edukacyjny (komentator AI, analiza optymalności, karty modeli, lab promptów, zgadywanka); podział rdzeń 1–8 / moduły 9–12 |
| **prompt** | „napisz najlepszy prompt dla Claude Code (shadcn ui)" | [`zrodla/PROMPT-claude-code.md`](./zrodla/PROMPT-claude-code.md) — spec jako plik w repo, shadcn jako jawne nadpisanie, `DECISIONS.md` zamiast pytań |

**Liczba iteracji:** ~11 wymian w rozmowie — z tego ~6 budujących specyfikację (v1 → research → v2 → v3 → dyskusja telemetrii → v4 → prompt) i ~4 wokół sensu projektu i nazwy.

**Ciekawostka do case study:** Cowork **odradził** budowę pełnego v4 („nie buduj v4 — zbuduj rdzeń minimalny, wypuść, wrzuć posta"). Autor zbudował całość — i to więcej niż v4 (4 gry zamiast 2, 6 modułów „WOW"). To dobry punkt narracyjny: model rekomendował MVP, człowiek świadomie poszedł szerzej.

## 3. Liczby (do slajdów i case study)

| Metryka | Wartość | Jak policzone |
|---|---|---|
| Faza koncepcji (research + SPEC v1→v4) | **~30 min**, rozmowa mobilna jako pasażer w aucie | potwierdzone przez autora; zapis w [`zrodla/research-cowork.md`](./zrodla/research-cowork.md) |
| Dni kalendarzowych od pierwszego do ostatniego commita | **6** (12→18.07.2026) | `git log --format=%as` |
| Commitów łącznie | **71** | `git log --oneline \| wc -l` |
| — w tym Opus 4.8 (1M context) | **49** | trailer `Co-Authored-By` |
| — w tym Claude Fable 5 | **16** | trailer `Co-Authored-By` |
| — w tym Opus 4.8 (bez 1M) | **6** | trailer `Co-Authored-By` |
| Commitów napisanych ręcznie przez człowieka (bez agenta) | **0** | każdy commit ma trailer `Co-Authored-By` modelu |
| Rdzeń grywalny (etapy 1–8) | **1 dzień** (12.07) | 14 commitów tego dnia |
| Publiczna produkcja live | **2. dzień** (13.07, `ticbottoe.lol`) | commit `ed1657d` |
| Gry | **4** (kółko i krzyżyk, statki, Sudoku Duel, Słowna bitwa/Scrabble) | `README.pl.md` |
| Tryby | **2** (LLM vs LLM, człowiek vs LLM) | `SPEC.md` §1 |
| Języki UI | **2** (PL, EN) | commit `b5ab595` |

> Uwaga redakcyjna: liczby „71 commitów / 6 dni" opisują **stan zamrożony na 18.07.2026**. Projekt żyje — materiały datujemy i mówimy to wprost (ryzyko #6 w planie).

---

## 4. Oś czasu — dzień po dniu (do grafiki „timeline")

### Dzień 1 — 12.07.2026 · rdzeń w jeden dzień · Opus 4.8 (1M) · 14 commitów
Od zera do grywalnej areny z rankingami. Kolejne etapy z briefu:
- `96fafc3` monorepo + silnik kółko i krzyżyk + grywalna plansza 3×3
- `89e3ee8` providery (OpenRouter BYOK + człowiek) + orchestrator + telemetria + UI gry
- `00349b9` silnik statków (3 warianty) + rozstawianie + UI
- `04cbc45` provider WebLLM (WebGPU, w przeglądarce, za darmo, bez klucza)
- `9dae52d` backend (Hono): health, Turnstile→JWT, rate limit, CSP, serwowanie statyków
- `54f2d22` Postgres/Drizzle: walidacja wyniku, Elo, leaderboard, replay
- `6957a81` provider Ollama + proxy + kolejka single-flight
- `cdae087` deploy: bundle tsup, wielostopniowy Dockerfile, compose, Caddy, systemd, README
- `05cb24e` warstwa wizualna Cyber-HUD (na shadcn/ui)
- `720683d`…`40f898b` moduły 9–12: wykresy/telemetria, analiza + solvery, powtórki + SEO, tożsamość gracza + antybot

### Dzień 2 — 13.07.2026 · hardening + wyjście na produkcję · Opus 4.8 (1M) · 24 commity
- poprawki bezpieczeństwa (`a0deb14`: zarezerwowany namespace `human:`, twardsze limity)
- dostępność WCAG AA (`78291d1`), e2e w prawdziwej przeglądarce (`3b1ce5f`)
- angielska wersja językowa (`b5ab595`)
- **`ed1657d` produkcja na VPS → `ticbottoe.lol`**
- serwerowy trener AI na Gemini (`06b673f`), tryb rozumowania (`4b561e9`), liczniki i STOP
- `d2092fb` / `1fa6a20` przygotowanie repo do publicznego startu + link do dema

### Dzień 3 — 14.07.2026 · 1 commit
- `4997d06` fix: ustawienia partii przeżywają powrót z gry

### Dzień 4 — 16.07.2026 · nowe gry (start) · Opus 4.8 (1M) · 6 commitów
Wg briefu [`docs/PLAN-SUDOKU-SCRABBLE.md`](../PLAN-SUDOKU-SCRABBLE.md):
- `ebed6c7` opcjonalne hooki `GameDefinition` + `rng.ts` (Etap 0)
- `cf0dcd1`/`2bef787`/`583f589` Sudoku Duel: silnik, UI, integracja serwera + daily
- `6e752ec` pakiet `@arena/lexicons` + słowniki DAWG
- `de4d116` silnik Scrabble / Słowna bitwa

### Dzień 5 — 17.07.2026 · nowe gry (finisz) + start „Efektu WOW" · 23 commity
- Opus 4.8 (1M): UI Słownej bitwy (`d8c902f`), integracja serwera + deploy (`5271bde`), szlif + smoke live (`4f7c104`), fix Sudoku (`23512b7`)
- Opus 4.8: 6 commitów code-review/Dependabot (`a6412db`…`bbb2acb`)
- **Claude Fable 5** startuje „Efekt WOW" wg [`docs/PLAN-EFEKT-WOW.md`](../PLAN-EFEKT-WOW.md): tok myślenia, ranking halucynacji + Muzeum wpadek, psychologia modeli (heatmapy), tryb Turinga, demo WebLLM na home, pojedynek promptów (Etapy 0–9)

### Dzień 6 — 18.07.2026 · domknięcie · Claude Fable 5 · 3 commity
- `6fc61b8` poprawki z code-review (Etap 9)
- `b423521` README EN+PL z nowymi funkcjami + e2e nowych stron (Etap 10)
- `a075426` streaming SSE toku myślenia — „typewriter" na żywo (§3.4)

---

## 5. Narzędzia i stack (do słowniczka i zeszytu o środowisku)

**Narzędzia agentowe**
- **Claude Cowork** — research, koncepcja, praca na dokumentach (faza „co i dlaczego budujemy").
- **Claude Code** — agent w VS Code pracujący w repozytorium: czyta, edytuje, uruchamia, testuje, commituje (faza „jak to zbudować").
- Modele użyte w Claude Code: **Opus 4.8 (1M context)**, **Opus 4.8**, **Claude Fable 5**.

**Stack aplikacji** (z `SPEC.md` §3 i `README.pl.md`)
- Monorepo **pnpm workspaces**; pakiety: `game-core` (czysty TS: silniki, solvery, Elo, replay), `i18n`, `lexicons`, `apps/web`, `apps/server`.
- Frontend: **Vite + React + TypeScript + Tailwind + shadcn/ui + Zustand**; wykresy **Recharts**; styl „Cyber-HUD".
- Backend: **Node 22 + Hono**; ORM **Drizzle** + **PostgreSQL**.
- Inferencja (właściciel nie płaci): **OpenRouter BYOK** (klucz tylko w przeglądarce), **WebLLM** (WebGPU, lokalnie), opcjonalnie **Ollama** (proxy na serwerze).
- Anti-bot: **Cloudflare Turnstile**. Sesje: **JWT (HS256)**.
- Testy: **vitest** (unit), **testcontainers** (integracyjne), **Playwright** (e2e).
- Deploy: **Docker / compose + Caddy (auto-TLS) + systemd**, VPS współdzielony; domena `ticbottoe.lol`.
- Grafiki: własny pipeline `scripts/gen` (REST do Gemini) z kitem promptów Cyber-HUD.

---

## 6. Metoda pracy (właściwy przedmiot szkolenia)

1. **SPEC jako źródło prawdy.** Samowystarczalny dokument wymagań, pisany wprost pod konkretny model, z podziałem na etapy i jawnymi NIE-celami. Patrz cytaty §7.
2. **Briefy per inicjatywa** (`docs/PLAN-*.md`): kontekst zweryfikowany w kodzie, decyzje podjęte Z GÓRY („nie renegocjuj w trakcie"), etapy z DoD.
3. **`DECISIONS.md` jako dziennik decyzji.** Jednozdaniowe decyzje tam, gdzie SPEC nie rozstrzyga; rozjazdy względem planu jawnie odnotowane z powodem.
4. **Etapowe commity z bramkami.** Po każdym etapie `pnpm test` + `pnpm typecheck` zielone; konwencja `feat(zakres): opis (Etap N)`, komunikaty po polsku.
5. **Code-review jako osobny krok** (commity „poprawki z code-review").
6. **Weryfikacja na żywo, nie tylko testami.** e2e na prawdziwej przeglądarce i prawdziwym modelu; funkcje sprawdzane na darmowych modelach OpenRoutera przed uznaniem za gotowe.

---

## 7. Cytaty (dosłowne — wolno wklejać do materiałów)

Każdy cytat z podanym źródłem. Nie zmieniać treści; wolno skracać z zaznaczeniem `[…]`.

**C1 — cel produktu** · `SPEC.md` §1
> „Arena gier logicznych dla modeli językowych i ludzi, która **uczy przez grę**: użytkownik bez orientacji w mnogości modeli ma po kilku partiach rozumieć, czym różnią się modele […] — bez czytania benchmarków."

**C2 — SPEC pisany wprost dla agenta** · `SPEC.md` nagłówek
> „Dokument dla Claude Code (model Opus 4.8). **Samowystarczalny — zastępuje v1–v3.** […] Realizuj etapami (sekcja 19). Po każdym etapie `pnpm test`."

**C3 — decyzja architektoniczna z fazy koncepcji (model kosztowy)** · `SPEC.md` §2
> „**Właściciel nie płaci za inferencję.** BYOK (OpenRouter), WebLLM w przeglądarce, opcjonalnie Ollama na VPS."

**C4 — bramka jakości po etapie** · `docs/PLAN-EFEKT-WOW.md`
> „Realizuj etapami (sekcja 10). Po każdym etapie `pnpm test` + `pnpm typecheck` zielone. Nie przechodź dalej z czerwonymi testami. Konwencja commitów: `feat(zakres): opis (Etap N)` — po polsku, jak dotychczas."

**C5 — decyzje podjęte z góry** · `docs/PLAN-EFEKT-WOW.md` §2
> „Decyzje projektowe (podjęte — nie renegocjuj w trakcie implementacji)."

**C6 — „co poszło nie tak i jak to złapano" (najlepsza anegdota do Zeszytu 2)** · `DECISIONS.md`
> „Reguła »średni czas ruchu < 3 s = podejrzane« (SPEC §15) była błędna i zabijała produkt. Zmierzone: gpt-4o-mini odpowiada […] w ~1,1 s […]. Czyli uczciwa partia model-vs-model była odrzucana jako oszustwo […]. Testy tego nie łapały, bo wpisywały `latencyMs: 4000` — były pisane pod regułę, nie pod rzeczywistość."

**C7 — świadome odkładanie funkcji (dojrzałość procesu)** · `DECISIONS.md` (Etap 5, tok myślenia)
> „Efekt maszyny do pisania (char-by-char) ODŁOŻONY […] Prawdziwy typewriter »na żywo« wymaga strumieniowania SSE […]. Zamiast pół-budować animację teraz, panel pokazuje pełny ślad per ruch […]." (streaming domknięto dopiero commitem `a075426`, ostatniego dnia).

**C8 — dziennik decyzji, zasada** · `DECISIONS.md` nagłówek
> „Jednozdaniowe decyzje podejmowane tam, gdzie SPEC.md nie rozstrzyga […]. Najnowsze na górze."

**C9 — prompt startowy: bramka jakości i „reguła 5"** · [`zrodla/PROMPT-claude-code.md`](./zrodla/PROMPT-claude-code.md), sekcja „Sposób pracy"
> „Po każdym etapie: `pnpm test` musi być zielony […]. **Nie przechodź do kolejnego etapu z czerwonymi testami.**" oraz (pkt 5, „reguła 5"): „Gdy specyfikacja czegoś nie rozstrzyga — podejmij rozsądną decyzję, zapisz ją jednym zdaniem w `DECISIONS.md` i jedź dalej […]. Zatrzymaj się i zapytaj TYLKO, jeśli decyzja łamałaby któreś z wymagań nadrzędnych."

**C10 — jeden prompt, cała aplikacja** · [`zrodla/PROMPT-claude-code.md`](./zrodla/PROMPT-claude-code.md), zakończenie
> „Zbuduj kompletną aplikację według specyfikacji z pliku `SPEC.md` […]. Przeczytaj CAŁĄ specyfikację przed napisaniem pierwszej linii kodu […]. Zacznij od etapu 1."

**Fakt pokrewny (ustalony przez porównanie plików):** dostarczony `SPEC-llm-game-arena-v4.md` jest **bajt w bajt identyczny** z `SPEC.md` w repo (`diff` = 0 linii). Finalna specyfikacja **nie była zmieniana w trakcie budowy** — napisana raz, z góry, i zrealizowana bez modyfikacji dokumentu wymagań. (Do potwierdzenia intencji przez autora — `PYTANIA-DO-AUTORA.md` §1.3.)

**C11 — impuls początkowy (pierwszy prompt researchu)** · [`zrodla/research-cowork.md`](./zrodla/research-cowork.md)
> „Zaplanuj i zaprojektuj aplikację webową […] która będzie umożliwiała wybór pomiędzy różnymi modelami, które będą grały przeciw sobie w kółko i krzyżyk. […] Aplikacja powinna być odporna na boty […]. Ponadto ja nie chcę płacić za użycie z własnych pieniędzy."

**C12 — nisza potwierdzona researchem** · `zrodla/research-cowork.md` (po web search)
> „Twoja nisza — »arena dla zwykłego człowieka, który chce sam zobaczyć i zagrać« — jest realnie wolna […] (nisza rozrywkowo-edukacyjna, nie biznesowa)."

**C13 — model odradził pełen zakres; autor poszedł szerzej** · `zrodla/research-cowork.md`
> „Nie buduj v4. Zbuduj rdzeń w wersji minimalnej […], wypuść, wrzuć posta i zobacz, czy ktokolwiek poza Tobą rozegra 20 partii." — (w praktyce powstała cała aplikacja: 4 gry i 6 modułów „WOW").

**C14 — sam proces jako materiał (walidacja tego szkolenia)** · `zrodla/research-cowork.md`
> „Sam proces budowy specyfikacją przez Claude Code to case study wart osobnego posta" — ten pakiet szkoleniowy realizuje dokładnie tę myśl.

---

## 8. Stan uzupełnień od autora (18.07.2026)

✅ **Domknięte:**
- **Prompt startowy / „reguła 5"** — dostarczony, zapisany jako [`zrodla/PROMPT-claude-code.md`](./zrodla/PROMPT-claude-code.md). Patrz cytaty C9–C10.
- **Specyfikacja nie zmieniana w trakcie** — potwierdzone porównaniem plików (patrz nota pod C10).
- **Research w Cowork** — pełny zapis rozmowy dostarczony przez autora, zapisany jako [`zrodla/research-cowork.md`](./zrodla/research-cowork.md). Rozpisany w §2a; cytaty C11–C14.
- **Delta specyfikacji v1→v4** — udokumentowana w §2a (co dokładało każde pytanie autora).
- **Czas fazy koncepcji** — **~30 min, jako pasażer w samochodzie** (potwierdzone przez autora). Patrz §2a i §3.

⛔ **Świadomie pominięte przez autora (NIE wchodzą do materiałów, decyzja z 18.07.2026):**
- Koszty API/VPS; łączny czas pracy człowieka nad kodem.
- Co było najtrudniejsze / najbardziej zaskoczyło; dlaczego zmiana modeli (Opus → Fable).

Nie dopisujemy tych wątków „na oko" — autor prosił o ich pominięcie.
