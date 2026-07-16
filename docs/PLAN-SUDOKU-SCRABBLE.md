# PLAN: Sudoku Duel + Scrabble (PL/EN) — nowe gry areny

> Dokument dla Claude Code. Samowystarczalny — czytaj razem z `SPEC.md` (architektura §5, protokół LLM §8, walidacja §15).
> Cel: dodać do areny dwie nowe gry — **Sudoku Duel** (pojedynek turowy na wspólnej planszy) i **Scrabble** (wariant polski i angielski, ukryta informacja, słowniki).
> Realizuj etapami (sekcja 10). Po każdym etapie `pnpm test` + `pnpm typecheck` zielone. Nie przechodź dalej z czerwonymi testami.

---

## 1. Kontekst — co już jest i z czego korzystamy

Arena ma architekturę wielogrową (SPEC §5): czysty silnik `GameDefinition<S, M, V>` w `packages/game-core` (bez DOM i Node — ten sam kod gra w przeglądarce i waliduje replay na serwerze), game-agnostyczny orchestrator (`apps/web/src/game/orchestrator.ts`), wspólną maszynerię ruchu LLM z retry/forfeit (`apps/web/src/providers/llm-runner.ts`), rankingi Elo per `mode × game × variant` (bez zmian w schemacie DB!) oraz walidację replay po stronie serwera (`packages/game-core/src/replay.ts` + `apps/server/src/routes/result.ts`).

**Nowa gra = implementacja `GameDefinition` + rejestracja + UI planszy + etykiety.** Schemat PostgreSQL, Elo, telemetria, powtórki, zgadywanka — wszystko działa automatycznie, bo kluczem rankingu jest `(subject, mode, game, variant)`.

Kompletna lista punktów integracji (wyznaczona grepem po `battleship` — 47 plików):

| Warstwa | Pliki do zmiany |
|---|---|
| game-core | `types.ts` (GameId, widoki, hooki), `index.ts` (getGame), `replay.ts` (resolveGame + walidacja), `commentary.ts` (kontekst komentatora), `daily.ts` (pula gier), nowe: `sudoku.ts`, `scrabble.ts`, `scrabble-data.ts` |
| web | `SetupScreen.tsx` (kafle gier + warianty), `GameRunner.tsx` (rendering + wejście człowieka + bezpieczniki), `GameGlyph.tsx`, `GameLog.tsx` (format ruchu), `AnalysisView.tsx`, `ReplayPage.tsx`, `i18n/pl.ts` + `en.ts`, `providers/commentator.ts`, `lib/model-copy.ts`, nowe komponenty: `SudokuBoard.tsx`, `ScrabbleBoard.tsx`, `ScrabbleRack.tsx` |
| server | `db/result-schema.ts` (z.enum gier), `routes/result.ts` (lexicon przy replayu), `og/render.ts` + `og/meta.ts` + `og/seo.ts` (etykiety + render finalnej planszy), `lib/arena-totals.ts`, `routes/commentary.ts`, `scripts/seed-ranking.ts` |
| nowy pakiet | `packages/lexicons` — słowniki PL/EN jako binarne DAWG + loader (sekcja 6) |
| pozostałe | `e2e/human-play.spec.ts`, `deploy/` (artefakty słowników w obrazie), `README.md`/`README.pl.md`, `DECISIONS.md` |

---

## 2. Decyzje projektowe (podjęte — nie renegocjuj w trakcie implementacji)

1. **Sudoku jako pojedynek turowy („Sudoku Duel"), nie solo-łamigłówka.** Arena jest z natury dwuosobowa (`p1`/`p2`, Elo, remis). Obaj gracze na ZMIANĘ dokładają cyfry do wspólnej planszy z jednoznacznym rozwiązaniem. Trafienie w rozwiązanie = +1 pkt, pomyłka (spójna z regułami, ale niezgodna z rozwiązaniem) = −1 pkt i cofnięcie wpisu. Wygrywa wyższy wynik po zapełnieniu planszy. To mierzy dokładnie to, co arena ma mierzyć: zdolność dedukcji vs zgadywanie.
2. **Język scrabble = wariant gry** (`pl`, `en`), nie osobna gra. Ranking per wariant istnieje już w schemacie — dostajemy za darmo osobne tabele „który model lepiej gra po polsku vs po angielsku". Sudoku jest językowo neutralne — jego warianty to rozmiary planszy.
3. **Prompty gier pozostają po angielsku** (konwencja SPEC §6/§7 — stały rdzeń EN, format JSON). W scrabble PL prompt jest po angielsku, ale słowa i litery są polskie („Play words valid in the Polish dictionary"). UI ma już pełne i18n pl/en.
4. **Bez pełnego generatora ruchów scrabble** (algorytm Appel–Jacobson) w pierwszym wydaniu. Enumeracja wszystkich legalnych ułożeń nie jest potrzebna do gry ani walidacji — wystarczy walidacja KONKRETNEGO ruchu. Konsekwencja: mały, wsteczniekompatybilny rozszerzenie kontraktu `GameDefinition` (sekcja 3). Analiza „najlepszy dostępny ruch" (evaluateMove dla scrabble) — poza zakresem, odnotowana jako przyszłość.
5. **Słowniki:** EN = **ENABLE1** (domena publiczna, ~173k słów). PL = **słownik sjp.pl** (`slowa.txt`, licencja do zweryfikowania przy pobraniu — sjp.pl publikuje listę na wolnej licencji (GPL 2 / CC), dołącz plik licencji i atrybucję do repo). Kompilowane w build-time do binarnego DAWG (sekcja 6). Klient pobiera słownik leniwie tylko dla scrabble, z cache.
6. **Znak towarowy:** „Scrabble" to znak Mattel/Hasbro, a repo i ticbottoe.lol są publiczne. Id wewnętrzne gry: `scrabble` (techniczne, w DB). **Nazwa w UI: „Słowna bitwa" / „Word Battle"**, z dopiskiem w README „zasady zgodne z klasyczną grą słowną". Decyzję odnotuj w `DECISIONS.md`. (Jeśli właściciel woli inną nazwę — to jedno pole w i18n.)
7. **Rozstawienie/losowość zawsze z silnika, seedowana** (jak statki): plansza sudoku generowana z `seed`, worek scrabble tasowany z `seed`. Seed w `SetupRecord` → serwer odtwarza partię w 100% deterministycznie.
8. **Reguła bezwzględna (SPEC §5) obowiązuje scrabble:** widok gracza NIGDY nie zawiera stojaka przeciwnika ani zawartości/kolejności worka. Test snapshotowy obowiązkowy.
9. **Wyzwanie dnia:** sudoku wchodzi do puli `GAMES` w `daily.ts`; scrabble NIE (darmowe modele są w nim za słabe + wymusza pobranie słownika). Uwaga: zmiana długości puli zmienia wyzwania także „wstecz" (hash % length) — nieszkodliwe (wyniki historyczne są zapisane per dzień), ale wdrożenie musi być atomowe (jeden serwer serwuje front i API — jest).

---

## 3. Rozszerzenie kontraktu `GameDefinition` (game-core, wstecznie kompatybilne)

Problem: dla scrabble `legalMoves()` nie może zwrócić kompletnej listy (dziesiątki tysięcy ułożeń), a właśnie na niej opierają się dziś trzy mechanizmy: walidacja w `parseMove(raw, legal)`, komunikat korygujący `correction(legal)` w `llm-runner.ts` (wypisuje CAŁĄ listę!) i losowy ruch przy forfeicie. Dla sudoku lista jest enumerowalna (~setki), ale wypisanie jej w promptcie/korekcie **zdradzałoby kandydatów** (pola z jednym kandydatem = darmowa odpowiedź) — czyli też potrzebujemy furtki.

Dodaj do `GameDefinition` trzy OPCJONALNE hooki (w `types.ts`), z zachowaniem obecnych ścieżek jako domyślnych:

```ts
export interface MoveRejection { ok: false; reason: string }   // reason: krótki EN, trafia do komunikatu korygującego
export type MoveValidation = { ok: true } | MoveRejection;

interface GameDefinition<S, M, V> {
  // ... istniejące pola bez zmian ...

  /**
   * Walidacja konkretnego ruchu z perspektywy WIDOKU (nie stanu) — llm-runner
   * i UI człowieka mają tylko widok. Gdy zdefiniowane, zastępuje
   * `legal.includes(move)` jako test legalności. Musi być czyste i deterministyczne.
   */
  validateMove?(view: V, move: M): MoveValidation;

  /**
   * Komunikat korygujący po nielegalnym/nieparsowalnym ruchu — zamiast
   * domyślnego "Choose ONLY from: <cała lista legalnych>". Dostaje powód
   * odrzucenia, gdy znany.
   */
  renderCorrection?(view: V, rejection?: MoveRejection): string;

  /**
   * Ruch zastępczy przy forfeicie — zamiast losowego z `legalMoves()`.
   * Scrabble: 'PASS'. Sudoku/domyślnie: losowy legalny (rng w [0,1)).
   */
  fallbackMove?(view: V, legal: M[], rng: () => number): M;
}
```

Zmiany w konsumentach:

- **`llm-runner.ts`**: legalność = `def.validateMove?.(view, parsed) ?? legal.includes(parsed)`. `parseMove` dla nowych gier robi parsowanie SKŁADNIOWE (kaskada jak w SPEC §6), a legalność sprawdza `validateMove`. Korekta = `def.renderCorrection?.(view, rejection) ?? correction(legal)`. Forfeit = `def.fallbackMove?.(view, legal, rng) ?? legal[floor(rng()*len)]`. Guard `legal.length === 0` zostaje (scrabble zawsze zwraca co najmniej `PASS`, sudoku zawsze ma ruch — sekcja 4).
- **`replay.ts`**: w pętli walidacji `def.validateMove ? def.validateMove(def.viewFor(state, side), entry.move).ok : def.legalMoves(state, side).includes(entry.move)`. Reszta bez zmian.
- **`orchestrator.ts`**: bez zmian (walidacją i tak jest `applyMove`, który rzuca).
- **Uwaga na sygnaturę `parseMove(raw, legal)`**: zostaje. Tic-tac-toe i statki — zero zmian zachowania (hooki niezdefiniowane). Testy regresji: istniejące zestawy muszą przejść bez modyfikacji.

`GameId` rośnie do `'tictactoe' | 'battleship' | 'sudoku' | 'scrabble'`; `PlayerView` = unia 4 widoków; `getGame`/`resolveGame` — dwa nowe case'y.

---

## 4. Gra 3: Sudoku Duel

### 4.1 Warianty

| Wariant | Plansza | Boksy | Cyfry | Wskazówki (start) |
|---|---|---|---|---|
| `mini` | 4×4 | 2×2 | 1–4 | ~6 (z 16) |
| `classic6` | 6×6 | 2×3 | 1–6 | ~14 (z 36) |
| `classic9` | 9×9 | 3×3 | 1–9 | ~34 (z 81) |

`mini` jest dla małych modeli (WebLLM) — jak `small` w statkach. Etykiety wariantów po polsku w silniku (konwencja `TICTACTOE_VARIANTS`).

### 4.2 Reguły pojedynku

- Silnik generuje z `seed` pełne rozwiązanie (backtracking z seedowanym PRNG — **reużyj/wydziel `mulberry32` z `battleship.ts` do `rng.ts`**), potem usuwa pola utrzymując JEDNOZNACZNOŚĆ rozwiązania (licznik rozwiązań z odcięciem na 2). Determinizm: ten sam seed → ta sama łamigłówka na kliencie i serwerze.
- Gracze wykonują ruchy NA ZMIANĘ (p1 zaczyna). Ruch = wpis cyfry w puste pole, **spójny z regułami sudoku względem bieżącej planszy** (wiersz/kolumna/boks) — to jest definicja legalności.
- Rozstrzygnięcie wpisu: zgodny z rozwiązaniem → zostaje na planszy, **+1 pkt**; niezgodny (choć spójny) → **−1 pkt i natychmiastowe cofnięcie** (plansza pozostaje zawsze podzbiorem rozwiązania ⇒ zawsze istnieje ≥1 legalny ruch ⇒ guard `legal.length===0` nie strzela).
- Koniec gry: (a) plansza kompletna, albo (b) **twardy limit silnika**: `3 × liczba pustych pól na starcie` wykonanych ruchów (obrona przed wiecznym zgadywaniem — stan liczy ruchy, więc replay jest deterministyczny). Wynik: wyższa suma punktów wygrywa; równość = remis.
- Wynik pomyłki jest JAWNY dla obu graczy (wpis znika z planszy, punkty widoczne) — to informacja pełna, bez sekretów.

### 4.3 Stan, ruch, widok

```ts
interface SudokuState {
  variant: string; size: number; boxRows: number; boxCols: number;
  seed: number;
  solution: number[];          // length N², NIGDY w widoku
  board: (number | null)[];    // bieżąca plansza (podzbiór rozwiązania)
  givenMask: boolean[];        // wskazówki startowe (nieusuwalne)
  scores: { p1: number; p2: number };
  history: SudokuHistoryEntry[]; // {player, cell, digit, correct}
}
// Move (wire): string "r4c7=3" — 1-indeksowane, digit 1..size
interface SudokuView extends PlayerViewBase {
  game: 'sudoku'; size: number; boxRows: number; boxCols: number;
  board: (number | null)[]; givenMask: boolean[];
  scores: { p1: number; p2: number };
  /** Ostatnie wpisy z wynikiem — model musi widzieć, że pomyłki kosztują. */
  annotatedHistory: { player: PlayerSide; cell: string; digit: number; correct: boolean }[];
  movesRemaining: number;      // do limitu silnika
}
```

`viewFor` zwraca to samo obu stronom (pełna informacja) — ale **bez `solution`**. Test snapshotowy: serializowany widok nie zawiera pól spoza planszy/wyników.

### 4.4 Prompt (rdzeń EN, stały)

```
You are playing competitive Sudoku Duel as {p1|p2}. Players alternate placing one digit.
Board {N}x{N}, boxes {bR}x{bC}, digits 1-{N}. '.' = empty cell.
{ASCII_GRID_Z_WSPÓŁRZĘDNYMI r/c I SEPARATORAMI BOKSÓW}
Scoring: digit matching the unique solution = +1; a consistent but WRONG digit = -1 and it is removed.
Current score: you {X}, opponent {Y}. Recent placements: {annotatedHistory, np. "r4c7=3 WRONG(-1)"}.
Only place a digit you can DEDUCE. Cell must be empty; digit must not repeat in its row, column or box.
Respond with ONLY a JSON object: {"move": "r4c7=3"}
No explanation, no markdown, no code fences.
```

**KRYTYCZNE: prompt ani korekta NIE wymieniają listy legalnych ruchów** (wypisanie kandydatów per pole rozwiązywałoby zagadkę za model). Test snapshotowy promptu: brak enumeracji kandydatów. Tryb `reasoning` (PromptOptions): dodaj wskazówkę „scan rows/columns/boxes for a cell with exactly one candidate; think in at most 3 short sentences" + JSON na ostatniej linii.

- `parseMove` — kaskada: (1) `JSON.parse` całości i pole `move`, (2) regex `"move"\s*:\s*"(r\d{1,2}c\d{1,2}=\d)"`, (3) luźny wzorzec `r(\d{1,2})\s*c(\d{1,2})\s*=\s*(\d)` w tekście. Zwraca ruch po składni; legalność w `validateMove`.
- `validateMove`: pole w zakresie, puste, cyfra 1..N, brak konfliktu wiersz/kolumna/boks. `renderCorrection`: powód + przypomnienie zasad, BEZ listy ruchów.
- `legalMoves`: pełna enumeracja (pole×kandydat) — używana przez forfeit (losowy spójny wpis; zwykle zły → −1, co jest spójne z „forfeit boli") oraz testy. Sudoku nie definiuje `fallbackMove` (domyślny losowy wystarcza).
- `evaluateMove` (analiza §12.2, tani): `optimal` = wpis poprawny w polu, które w danym momencie miało dokładnie JEDNEGO kandydata (naked single) lub cyfra miała jedno miejsce w jednostce (hidden single); `good` = poprawny, ale niewymuszony (zgadnięty trafnie); `blunder` = wpis błędny. Zasila kolumnę „Precyzja" jak w kółku i krzyżyku.
- `serializeSetup`: `{ game:'sudoku', variant, seed }` — plansza odtwarzalna z seeda.

### 4.5 Testy silnika (vitest, w `game-core`)

Generator: 200 seedów per wariant → plansza ma jednoznaczne rozwiązanie, właściwa liczba wskazówek, determinizm (seed → identyczna łamigłówka dwukrotnie). Scoring: poprawny/+1, błędny/−1 + revert. Koniec: komplet planszy i limit ruchów. `parseMove` kaskada (JSON / proza / śmieci). Widok bez `solution`. Replay: pełna partia przechodzi `replayMatch`, ruch niespójny odrzucany.

---

## 5. Gra 4: Scrabble („Słowna bitwa", warianty `pl` / `en`)

### 5.1 Zasady (klasyczne, z jawnie wybranymi uproszczeniami)

- Plansza 15×15 z pełnym układem premii (DL/TL/DW/TW, gwiazdka H8 = DW, pierwszy ruch musi pokrywać H8). Stojak 7 płytek. Bingo (7 płytek w ruchu) = +50.
- Rozkłady i wartości liter: **oficjalne** dla PL (100 płytek, z ą ć ę ł ń ó ś ź ż; bez q/v/x) i EN (100 płytek). Tabele jako dane w `scrabble-data.ts` + test: suma płytek = 100, suma punktów zgodna z oficjalną (PL: blank×2, EN: blank×2).
- Ruchy: `PLACE` (ułożenie słowa), `EXCHANGE` (wymiana 1–7 płytek, dozwolona tylko gdy worek ≥ 7 — reguła oficjalna), `PASS`.
- **Bez instytucji „challenge"** — słownik sprawdza silnik automatycznie: słowo (i WSZYSTKIE słowa krzyżowe) spoza słownika = ruch nielegalny → normalna ścieżka retry/forfeit z §8. To naturalne dla areny LLM i mierzy znajomość słownika wprost.
- Koniec gry: (a) worek pusty i jeden gracz opróżnił stojak → od wyniku każdego gracza odejmij sumę wartości pozostałych płytek, a opróżniający dostaje sumę płytek przeciwnika (reguła klasyczna); (b) **4 kolejne ruchy bez punktów** (PASS/EXCHANGE/ułożenie za 0) → koniec, odejmij wartości stojaków obu graczom. Wyższy wynik wygrywa; równość = remis.
- Blanki: 2 w worku, w notacji słowa mała litera = blank grający tę literę (`"H8>koTY"` → blank jako „k", blank jako „o").

### 5.2 Notacja ruchu (wire, string — `Move` bez zmian)

```
"H8>KOTY"    – ułożenie w poziomie (across) od kolumny H, wiersza 8; słowo PEŁNE (wraz z literami już na planszy)
"H8vKOTY"    – ułożenie w pionie (down)
"EXCH:AĄŁ"   – wymiana wymienionych płytek ze stojaka ('?' = blank)
"PASS"       – pas
```

Kolumny `A–O`, wiersze `1–15`. Kanoniczna forma (uppercase poza blankami) — `applyMove` normalizuje, `movesHash` liczy się z formy kanonicznej.

### 5.3 Stan, determinizm worka, widok

```ts
interface ScrabbleState {
  variant: 'pl' | 'en'; seed: number;
  board: (PlacedTile | null)[];        // 225, PlacedTile = {letter, isBlank, points}
  bag: Tile[];                          // potasowany seedem raz, na starcie; dobieranie = pop z końca
  racks: { p1: Tile[]; p2: Tile[] };
  scores: { p1: number; p2: number };
  scorelessStreak: number;              // do reguły końca (b)
  history: ScrabbleHistoryEntry[];      // {player, move, words:[{word,score}], total}
  toMove: PlayerSide;
}
```

**Determinizm wymiany:** `EXCHANGE` odkłada płytki do worka i dobiera nowe wg ustalonej reguły: dobierz z końca worka, POTEM wstaw zwracane płytki w pozycje wyliczone kolejnymi wywołaniami seedowanego PRNG (stan PRNG = licznik użyć w stanie). Dzięki temu replay z samego `(seed, moves)` odtwarza identyczne stojaki. Test obowiązkowy: partia z wymianami replayuje się do identycznego stanu.

```ts
interface ScrabbleView extends PlayerViewBase {
  game: 'scrabble'; language: 'pl' | 'en';
  board: (PlacedTile | null)[];
  rack: string[];                       // TYLKO własny stojak ('?' = blank)
  scores: { p1: number; p2: number };
  bagCount: number; opponentRackCount: number;
  scorelessStreak: number;
  annotatedHistory: { player: PlayerSide; notation: string; words: {word:string; score:number}[]; total: number }[];
  premiumsLegend: true;                 // plansza ASCII niesie znaczniki premii
}
```

**Ukryta informacja:** widok nie zawiera stojaka przeciwnika, zawartości ani kolejności worka. Test snapshotowy (jak statki): `JSON.stringify(viewFor(state,'p1'))` nie zawiera żadnej płytki ze stojaka p2 ani z worka.

### 5.4 Prompt (rdzeń EN, stały)

```
You are playing a Scrabble-style word game in {POLISH|ENGLISH}. You play as {p1|p2}.
Board 15x15, columns A-O, rows 1-15. Premium squares: '2'/'3' = double/triple LETTER, 'D'/'T' = double/triple WORD, '*' = center (first word must cover H8).
{ASCII_BOARD — litery na planszy, znaczniki premii na pustych polach, '.' zwykłe pole}
Your rack: {A, Ą, K, O, T, Y, ?}   ('?' = blank)
Scores: you {X}, opponent {Y}. Tiles left in bag: {n}. Opponent holds {m} tiles.
Recent moves: {annotatedHistory, np. "p2: H8>KOTY (KOTY 12) = 12"}
Rules: your word must use only your rack tiles plus letters already on the board, connect to existing tiles (except the first move), and every word formed (including cross-words) must be a valid {POLISH|ENGLISH} dictionary word. Letter values and premiums score automatically. Exchanging is allowed only when the bag has at least 7 tiles.
Respond with ONLY a JSON object, one of:
{"move": "H8>WORD"}  (horizontal)  |  {"move": "H8vWORD"}  (vertical)  |  {"move": "EXCH:ABC"}  |  {"move": "PASS"}
Use a lowercase letter in WORD to play a blank as that letter. No explanation, no markdown, no code fences.
```

Tryb `reasoning`: pozwól na 2–3 zdania (szukaj miejsc z premią, sprawdź krzyżówki), JSON na ostatniej linii. Uwaga: prompt scrabble jest największy w arenie (~1,5–2k tokenów) — bez zmian w `moveMaxTokens` (odpowiedź to nadal krótki JSON), ale odnotuj w README koszt/ruch wyższy niż w innych grach.

### 5.5 Walidacja ruchu (`validateMove`, z widoku) — serce silnika

Kolejno, z czytelnymi powodami odrzucenia (`reason` trafia do korekty):
1. Składnia notacji; współrzędne w planszy; słowo mieści się w planszy.
2. `PASS` zawsze legalny. `EXCH` legalny gdy `bagCount ≥ 7` i wszystkie wymieniane płytki są na stojaku.
3. `PLACE`: pola pod nowymi literami wolne; litery istniejące na planszy zgodne ze słowem; co najmniej 1 nowa płytka; wszystkie nowe płytki z własnego stojaka (multiset, blanki jako `?`); pierwszy ruch pokrywa H8, kolejne stykają się z istniejącymi płytkami; słowo główne ma ≥ 2 litery.
4. Słownik: słowo główne + KAŻDE powstałe słowo krzyżowe ∈ leksykon wariantu (sekcja 6). Korekta wymienia, które słowo odpadło: `"POKS" is not a valid Polish word`.

`legalMoves` zwraca tylko ruchy zawsze-legalne: `['PASS', ...legalne EXCH]` (kombinacje wymiany ograniczone do rozsądnych: pojedyncze litery + cały stojak; pełne 127 kombinacji niepotrzebne). Dokumentacja w kodzie: **lista NIE jest wyczerpująca — konsumenci używają `validateMove`**. `fallbackMove` = `'PASS'` (forfeit nie może losować słów). Punktacja w `applyMove`: litery × premie literowe, iloczyn premii słownych, premie tylko od NOWYCH płytek, suma słów krzyżowych, +50 za 7 płytek.

### 5.6 Testy silnika

Dane: sumy rozkładów (100/100), wartości oficjalne. Punktacja: przypadki znane (pierwsze słowo przez H8 z DW, krzyżówki, TW róg, bingo, blank = 0 pkt). Walidacja: każda reguła z 5.5 ma test negatywny z właściwym `reason`. Worek/wymiana: determinizm replay. Koniec gry: obie ścieżki + rozliczenie stojaków. Widok: snapshot bez przecieków. `parseMove`: kaskada JSON/regex/proza, polskie znaki (NFC!), lowercase-blank. Leksykon w testach: mini-słownik wstrzykiwany (sekcja 6.3) — testy game-core NIE czytają plików.

---

## 6. Pakiet `packages/lexicons` — słowniki jako DAWG

### 6.1 Źródła i budowa (skrypt Node, poza game-core)

- `scripts/lexicon/build.ts` (uruchamiany ręcznie: `pnpm lexicon:build`): pobiera/wczytuje źródła → filtruje (długość 2–15; wyłącznie litery alfabetu płytek danego języka — odpadają np. słowa z „q/v/x" w PL; NFC; uppercase) → buduje **DAWG** (minimalizacja acyklicznego automatu) → emituje zwarty format binarny + nagłówek z metadanymi (język, liczba słów, hash źródła).
- Artefakty: `packages/lexicons/dist/pl.dawg`, `en.dawg` + `LICENSES/` (ENABLE1 public domain; licencja sjp.pl + atrybucja). **Artefakty commitowane do repo** (build deterministyczny, deploy bez kroku pobierania). Szacunek: EN ~1 MB, PL ~5–15 MB (po filtrze długości ≤15 z ~3M form sjp) — jeśli PL przekroczy ~20 MB, ogranicz do długości ≤ 10 (99% zagrań) i odnotuj w DECISIONS.md.
- Vite: artefakty serwowane jako statyczne assety (`apps/web/public/lexicons/` — symlink/kopiowanie w build), serwer czyta z dysku.

### 6.2 API runtime

```ts
export interface Lexicon {
  language: 'pl' | 'en';
  has(word: string): boolean;        // O(len), po NFC+uppercase
  wordCount: number;
}
export function decodeLexicon(bytes: Uint8Array): Lexicon;   // czysty TS, działa wszędzie
```

Loadery per środowisko (w `packages/lexicons`, NIE w game-core): `loadLexiconBrowser(lang)` — `fetch` + cache (Cache API), pasek postępu (jak `ModelLoadBar`); `loadLexiconNode(lang)` — `fs.readFile` przy starcie serwera.

### 6.3 Wstrzyknięcie do silnika (game-core zostaje czysty)

`Lexicon` nie jest serializowalny — nie może iść przez `SetupConfig`. Rejestr modułowy w game-core:

```ts
// packages/game-core/src/lexicon-registry.ts
export function registerLexicon(lang: 'pl'|'en', lexicon: Lexicon): void;
export function getLexicon(lang: 'pl'|'en'): Lexicon;   // throw z czytelnym komunikatem, gdy brak
```

- Web: `GameRunner` przed startem partii scrabble ładuje i rejestruje leksykon wariantu (ekran ładowania; błąd = czytelny komunikat zamiast startu).
- Serwer: przy bootcie ładuje OBA leksykony i rejestruje; dopóki nie są załadowane, `POST /api/result` dla `game='scrabble'` zwraca 503 (test integracyjny).
- Testy game-core: `registerLexicon('pl', miniLexicon([...]))` — słownik z ręki.

---

## 7. Integracja web (apps/web)

1. **SetupScreen**: kafle gier 2→4 (Tabs → siatka 2×2 na mobile); opisy wariantów w `i18n` (`games`, `gameDescriptions`, etykiety wariantów). Scrabble: badge z językiem (🇵🇱/🇬🇧), przy wybraniu — informacja o pobraniu słownika (rozmiar).
2. **GameRunner** (największa praca):
   - gałęzie renderowania: `sudoku` → `SudokuBoard`, `scrabble` → `ScrabbleBoard` + `ScrabbleRack`;
   - bezpieczniki per gra: sudoku `safetyMaxMoves = 3×puste+2` (limit i tak jest w silniku), scrabble `= 200`;
   - **wejście człowieka — sudoku**: tap na puste pole → picker cyfr (1–N, tap-target ≥ 44 px) → ruch; pokazuj punkty i animację cofnięcia błędnego wpisu;
   - **wejście człowieka — scrabble**: tap na pole startowe → przełącznik kierunku (→/↓) → wpisywanie słowa z klawiatury ekranowej złożonej z płytek stojaka + liter z planszy na trasie; walidacja NA ŻYWO przez `validateMove` (komunikat powodu po polsku/angielsku); przyciski PAS i WYMIANA (wybór płytek); potwierdź/anuluj. To najbardziej złożony komponent planu — buduj mobile-first;
   - ładowanie leksykonu przed startem scrabble (6.3).
3. **Komponenty**: `SudokuBoard` (siatka z separatorami boksów, wskazówki wyróżnione, ostatni ruch podświetlony, znacznik +1/−1), `ScrabbleBoard` (premie kolorami, płytki z wartościami, ostatnie słowo podświetlone), `ScrabbleRack` (płytki gracza; w LLM vs LLM widok boga — oba stojaki, jak w statkach), `GameGlyph` — ikony 2 nowych gier.
4. **GameLog**: formatowanie ruchu per gra (sudoku: `r4c7=3 ✓/✗`; scrabble: notacja + słowa + punkty). **AnalysisView**: znaczniki `evaluateMove` sudoku; scrabble bez analizy (komunikat „analiza niedostępna dla tej gry").
5. **ReplayPage**: rendering per gra (reużyj komponentów plansz w trybie read-only); scrabble replay wymaga leksykonu? NIE — replay tylko odtwarza `applyMove` po stronie serwera; klientowa powtórka odtwarza stany z ruchów, więc też potrzebuje silnika: leksykon ładowany przy wejściu na powtórkę scrabble (jak przy grze). Prościej: `applyMove` w trybie replay nie sprawdza słownika ponownie (ruchy już zwalidowane) — NIE, nie rozdwajaj semantyki; ładuj leksykon. Odnotuj w DECISIONS.md.
6. **Commentator** (`providers/commentator.ts` + `game-core/commentary.ts`): konteksty per gra — sudoku: plansza + wynik wpisu; scrabble: słowo, punkty, premie (komentator widzi wszystko — nie gra).
7. **i18n**: komplet nowych kluczy w `pl.ts` i `en.ts` (gry, warianty, UI plansz, komunikaty walidacji scrabble, teksty ładowania słownika). `model-copy.ts` — zdania opisujące wyniki w nowych grach.
8. **Daily**: `daily.ts` GAMES += `'sudoku'` (wariant losowany z 3), `DailyChallengeCard` — etykiety.

---

## 8. Integracja server (apps/server)

1. `db/result-schema.ts`: `z.enum(['tictactoe','battleship','sudoku','scrabble'])`. Warianty walidowane replayem (jak dziś).
2. Boot (`index.ts`): `loadLexiconNode('pl'|'en')` + `registerLexicon` przed przyjmowaniem wyników; scrabble przed załadowaniem → 503 (sekcja 6.3). Ścieżka artefaktów przez env `LEXICON_DIR` (default: `node_modules/@arena/lexicons/dist` lub kopiowane w Dockerfile).
3. `routes/result.ts`: bez zmian logiki (replay obsłuży nowe gry po sekcji 3). Sanity checks (§15) — bez zmian; limit tokenów/ruch 5k wystarcza także dla scrabble.
4. **OG render** (`og/render.ts`): finalna plansza sudoku (siatka + cyfry, wskazówki vs wpisy kolorem) i scrabble (plansza z płytkami). `og/meta.ts` + `og/seo.ts` + `lib/arena-totals.ts`: mapy etykiet gier ×2 nowe pozycje (PL i EN).
5. `routes/commentary.ts` (serwerowy komentator): konteksty nowych gier (jak web).
6. `scripts/seed-ranking.ts`: opcjonalnie seedy dla nowych gier (niski priorytet).
7. **Deploy**: Dockerfile — artefakty `packages/lexicons/dist` w obrazie; sanity: rozmiar obrazu. README (EN+PL): sekcja o słownikach (źródła, licencje, `pnpm lexicon:build`).

---

## 9. Testy end-to-end i jakościowe

- `e2e/human-play.spec.ts`: sudoku — człowiek wykonuje poprawny i błędny wpis, wynik się zgadza; scrabble — człowiek układa pierwsze słowo przez H8, pasuje, wymienia (z mini-słownikiem wstrzykniętym przez tryb testowy LUB pełnym EN — decyzja przy implementacji wg czasu ładowania).
- Testy integracyjne serwera (testcontainers): zapis poprawnej partii sudoku i scrabble → ratingi rosną; partia scrabble z nielegalnym słowem → odrzucona; wynik scrabble przed załadowaniem leksykonu → 503.
- Snapshot promptów (`scripts/gen/preview-prompts.ts` jeśli dotyczy): dodaj nowe gry, sprawdź brak przecieków i brak enumeracji kandydatów sudoku.
- Smoke z prawdziwym modelem (`pnpm smoke:live`, ręcznie): jedna partia sudoku `mini` i scrabble `en` na tanim modelu — obserwuj forfeit rate; jeśli scrabble na małych modelach = same PASS-y, odnotuj w README rekomendację modeli.

---

## 10. Etapy implementacji (kolejność obowiązkowa; po każdym: `pnpm test` + `pnpm typecheck`)

**Etap 0 — kontrakt.** Sekcja 3: `GameId`, hooki `validateMove`/`renderCorrection`/`fallbackMove`, zmiany `llm-runner.ts` i `replay.ts`, `rng.ts` (wydzielony mulberry32). Zero zmian zachowania istniejących gier (regresja: pełny istniejący zestaw testów zielony bez modyfikacji). *DoD: testy hooki-default + regresja.*

**Etap 1 — silnik sudoku.** `sudoku.ts` (generator, reguły, prompt, parse, validate, evaluate) + rejestracja w `getGame`/`replay`/`daily` + testy 4.5. *DoD: pełna partia sudoku przechodzi `replayMatch`; prompt snapshot bez kandydatów.*

**Etap 2 — sudoku UI.** `SudokuBoard`, gałęzie `GameRunner` (LLM vs LLM i człowiek), `GameLog`, `AnalysisView`, `GameGlyph`, i18n pl+en, `SetupScreen` (siatka kafli). *DoD: partia grywalna w obu trybach lokalnie (`pnpm dev`), e2e sudoku zielone.*

**Etap 3 — sudoku serwer.** `result-schema`, OG render/meta/seo, arena-totals, commentary, testy integracyjne, daily (pula + karta). *DoD: zapis do rankingu działa na dev-stacku (web :5173 + server :8090 + DB `tic_bot_toe`), powtórka i OG renderują się.*

**Etap 4 — leksykony.** `packages/lexicons` + `scripts/lexicon/build.ts` + artefakty + licencje + loadery + rejestr w game-core + README. *DoD: `has()` poprawny na próbkach (test z listą kontrolną słów PL/EN, w tym polskie znaki), rozmiary artefaktów w budżecie, licencje w repo.*

**Etap 5 — silnik scrabble.** `scrabble-data.ts` + `scrabble.ts` (5.1–5.6) + rejestracja + testy z mini-słownikiem. *DoD: pełna partia (z wymianami i blankami) przechodzi `replayMatch` deterministycznie; snapshot widoku bez przecieków.*

**Etap 6 — scrabble UI.** `ScrabbleBoard`/`ScrabbleRack`, wejście człowieka (7.2), ładowanie leksykonu z paskiem, GameLog/Replay, i18n, nazwa „Słowna bitwa/Word Battle" + DECISIONS.md. *DoD: partia grywalna w obu trybach i obu językach; e2e scrabble zielone.*

**Etap 7 — scrabble serwer + deploy.** Boot leksykonów + 503, result-schema, OG, testy integracyjne, Dockerfile/README/README.pl. *DoD: pełny przepływ na dev-stacku: partia PL → zapis → leaderboard `scrabble/pl` → powtórka; `docker build` zawiera artefakty.*

**Etap 8 — szlif.** Smoke live (sekcja 9), model-copy, seed-ranking, przegląd forfeit-rate i ewentualne poprawki promptów (dozwolone TYLKO przed publicznym startem gry — potem prompt jest zamrożony, bo zmienia warunki rankingu).

---

## 11. Ryzyka i otwarte decyzje

| Ryzyko | Mitygacja |
|---|---|
| Rozmiar słownika PL (do ~15 MB) | filtr długości (≤15, awaryjnie ≤10), lazy-load tylko dla scrabble, cache przeglądarki, Brotli na Caddy |
| Licencja słownika PL | zweryfikuj przy pobraniu; dołącz licencję i atrybucję; awaryjnie inne wolne źródło PL (np. słowniki ispell/aspell GPL) |
| Znak towarowy „Scrabble" | nazwa UI „Słowna bitwa/Word Battle"; id techniczne zostaje `scrabble` |
| Małe modele nie ułożą żadnego słowa (same PASS/forfeit) | tryb reasoning rekomendowany w UI dla scrabble; rekomendacja modeli w opisie gry; reguła 4 ruchów bez punktów szybko kończy martwe partie |
| Prompt scrabble ~2k tokenów → koszt | jawna informacja w UI (szacunek kosztu/ruch już istnieje w telemetrii); bez zmian mechanizmu |
| Zgadywanie w sudoku (spam −1) | limit silnika 3×puste ruchów; Precyzja w rankingu obnaża zgadywaczy |
| Determinizm PRNG worka przy wymianach | licznik użyć PRNG w stanie + test replay z wymianami (obowiązkowy) |
| `pick()` w daily zmienia historyczne wyzwania po powiększeniu puli | akceptowane (sekcja 2.9); wdrożenie atomowe |

Otwarte (decyzje domyślne, zmień tylko świadomie): kara −1 w sudoku (alternatywa: −2 przy powtórnej pomyłce); pula wymian w `legalMoves` scrabble (pojedyncze + cały stojak); nazwa UI gry słownej.

## 12. Poza zakresem tego planu

Generator wszystkich ruchów scrabble (Appel–Jacobson) i `evaluateMove`/„Precyzja" dla scrabble; scrabble w wyzwaniu dnia; warianty planszy scrabble (mini 11×11); sudoku solo (tryb jednoosobowy poza areną); słowniki innych języków (architektura `packages/lexicons` jest na to gotowa).
