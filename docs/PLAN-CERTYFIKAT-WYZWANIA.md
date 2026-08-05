# PLAN: Certyfikat ukończenia wyzwania (PDF A5 poziomo + karta social)

> Dokument dla Claude Code. Samowystarczalny — czytaj razem z `SPEC.md` (§11 OG, §12.6 wyzwanie dnia, §16 prywatność) oraz `docs/ASSETS-PLAN.md` (pipeline grafik).
> Cel: po **każdym wygranym queście** (wyzwaniu dnia) gracz dostaje **certyfikat premium**: PDF A5 poziomo do pobrania na dysk, z informacją o serii (streak), oraz link do udostępnienia na social media z perfekcyjnym podglądem.
> **Ton: satyra na branżę kursów o AI** — dokument wygląda i brzmi jak dyplom „AI Transformation Strategy", a jego drobny druk to zweryfikowane fakty z prawdziwej partii. Pełna treść i uzasadnienie tonu: sekcja 6.0.
> Realizuj etapami (sekcja 13). Po każdym etapie `pnpm test` + `pnpm typecheck` zielone. Nie przechodź dalej z czerwonymi testami.

---

## 1. Kontekst — co już jest i z czego korzystamy

**„Quest" w tej aplikacji = „Wyzwanie dnia" (SPEC §12.6).** To jedyny byt o tej semantyce: „Pokonaj dziś {model} w {gra}". Nie ma innego systemu questów, więc certyfikat wystawiamy dokładnie za zaliczony dzień wyzwania. (Gdyby w przyszłości doszły inne questy, `CertificateFacts` z sekcji 3 jest na to gotowy — źródło faktów jest jednym adapterem.)

Co już mamy i czego **nie** budujemy od zera:

| Warstwa | Istniejące, do ponownego użycia |
|---|---|
| Wyliczanie wyzwania | `packages/game-core/src/daily.ts` — `dailyChallenge(day)`, `streakFrom(days, today)`, `dailySubjectId`, `paidEquivalent` |
| Weryfikacja zaliczenia | `apps/server/src/routes/daily.ts` — `POST /api/daily/result` sprawdza wszystko po stronie serwera (gra, wariant, przeciwnik, strona, wygrana, realne ruchy przeciwnika) |
| Dane | `daily_results (player_token, day, completed, match_id)`, `matches`, `players.nickname` |
| Render obrazu na serwerze | `apps/server/src/og/render.ts` — `@napi-rs/canvas`, rejestracja fontów marki, rysowanie **finalnej planszy** dla 4 gier, `ellipsize`, `short()` |
| Fonty marki | `apps/server/src/og/fonts/` (Rajdhani-Bold, JetBrainsMono Regular/Bold) — kopiowane do `dist/fonts` przez `tsup.onSuccess` i do `/app/fonts` w obrazie |
| SEO/OG na trasach SPA | `apps/server/src/og/meta.ts` (`injectSeo`, `matchOgTags`) + handler `/replay/:id` w `apps/server/src/index.ts` |
| Tabela tras dwujęzycznych | `packages/i18n/src/index.ts` — `RouteKey`, `localePath`, `translatePath` |
| Pipeline grafik generowanych | `scripts/gen/` — `prompt-kit.ts` (STYLE_PREAMBLE, PALETTE), `lib/render.ts`, `lib/sharp.ts`, `place-assets.ts` |
| Pobieranie pliku w przeglądarce | `apps/web/src/lib/chart-export.ts` — wzorzec `<a download>.click()` |

Punkt startowy w UI: `apps/web/src/components/GameRunner.tsx` (`handleSave` → `claimDaily` → `dailyClaim`) i `apps/web/src/components/DailyChallengeCard.tsx` (`todayCompleted`).

---

## 2. Decyzje projektowe (podjęte — nie renegocjuj w trakcie implementacji)

1. **Certyfikat renderuje SERWER, nie przeglądarka.** Trzy powody, każdy wystarczający: (a) podgląd na social media czytają crawlery bez JS — karta musi mieć stały URL obrazka; (b) fonty marki i dekodowanie tła są już na serwerze (`@napi-rs/canvas`, `dist/fonts`); (c) treść certyfikatu to **twierdzenie o faktach** („X pokonał Y, seria 7") — musi być wyprowadzona z bazy, nigdy z payloadu klienta. Klient nie przekazuje ŻADNEGO pola, które ląduje na dokumencie; podaje wyłącznie `matchId`.

2. **PDF jest wektorowy, nie zrzutem ekranu.** Tło (atmosfera) to jeden osadzony JPEG, ale **cała typografia, ramki, plakietka serii i miniatura planszy to wektory**. Konsekwencje: ~300 kB zamiast ~2 MB, ostrość w każdym powiększeniu, zaznaczalny i wyszukiwalny tekst (nick, data, id partii), idealny druk A5. Rasteryzowany PDF byłby „obrazkiem w kopercie PDF" — to nie jest certyfikat premium.

3. **Jedna scena, dwa backendy.** `scene.ts` produkuje **listę wyświetlania** (typowane prymitywy: `rect`, `line`, `text`, `image`, `qr`, `board`) w przestrzeni punktów PDF; `backend-pdf.ts` rysuje ją przez `pdf-lib`, `backend-canvas.ts` przez `@napi-rs/canvas` w dowolnej skali. Dzięki temu PDF i karta social **nie mogą się rozjechać**, a scena jest testowalna jednostkowo bez porównywania pikseli. (Dopasowanie/ucinanie tekstu robi backend — tylko on zna metryki swojego fontu.)

4. **Karta social to OSOBNA kompozycja, nie przeskalowany certyfikat.** A5 poziomo ma proporcje 1,419, a `summary_large_image` / OG to 1,905. Skalowanie A5 do 1200×630 dałoby albo pasy, albo obcięte rogi dokumentu. Karta social pokazuje **certyfikat jako dokument leżący na tle HUD** + wyciągnięte fakty (nick, przeciwnik, seria) — czytelne w miniaturze na telefonie. Cały nośny content w bezpiecznym pasie centralnym (patrz §7.2).

5. **Serii NIE zapisujemy w bazie — jest w pełni odtwarzalna.** `streakFrom(days, day)` liczy wstecz od danego dnia, a `POST /api/daily/result` wstawia wyłącznie wiersz `day = dzisiaj` — nikt nigdy nie doda dnia wstecz. Zatem seria „na dzień D" wyliczona dziś jest identyczna z tą sprzed roku. **Zero migracji schematu poza jednym indeksem** (§3.2). Odwrotna decyzja (kolumna `streak`) dokładałaby migrację i drugie źródło prawdy dla tej samej liczby.

6. **Klucz publiczny certyfikatu = `match_id` (UUID).** Ten sam identyfikator, którym już dziś dzieli się gracz (`/replay/:id`), więc certyfikat i powtórka są tym samym zdarzeniem pod tym samym adresem. Nie wprowadzamy drugiego identyfikatora do wycieku ani do pomylenia.

7. **Endpointy certyfikatu są publiczne (bez tokenu gracza).** Certyfikat istnieje po to, żeby go pokazać; wymaganie tokenu uniemożliwiłoby podgląd u odbiorcy linku. Ujawniane fakty: nick (już publiczny w rankingu ludzi), przeciwnik, gra, data, długość serii, id partii — czyli dokładnie to, co gracz świadomie publikuje. UUID jest niezgadywalny, nie ma endpointu listującego, certyfikaty nie trafiają do `sitemap.xml`.

8. **Nick, nie „imię i nazwisko".** Aplikacja nie zbiera PII (§16) i nie zamierza zacząć od certyfikatu. Na dokumencie ląduje `players.nickname`; gdy go brak — neutralna etykieta („Anonimowy gracz areny") i wyraźna podpowiedź w UI: ustaw nick, żeby był na certyfikacie. Pole tekstowe „wpisz swoje imię" jest **odrzucone**: certyfikat przestałby być weryfikowalnym twierdzeniem, a stałby się edytowalnym obrazkiem.

9. **Tło generujemy tym samym pipeline'em co resztę grafik** (`scripts/gen`, Cyber-HUD, zakaz złota/amber, brak tekstu w grafice). Grafika daje **atmosferę** (gradienty, poświata, głębia); cała ostra geometria (siatka, narożniki, linijki, ramka) rysowana jest wektorowo w scenie — to ta sama zasada, którą repo stosuje do plansz („board cells and game tiles are sharp geometry instead", `scripts/gen/README.md`).

10. **Seria to „ścieżka kariery", plakietka od 2 dni.** „SERIA: 1" wygląda jak pocieszenie; pierwszy dzień dostaje certyfikat bez plakietki. Progi nadają **stopień służbowy** (parodia tytulatury z LinkedIna) i kolor ramki: 2–6 cyan, 7–13 magenta, 14–29 fiolet, 30+ limonka. Nazwy stopni w §6.0. Limonka jest dozwolona, bo tło certyfikatu jest **nieprzezroczyste** (zakaz limonki dotyczy tylko assetów kluczowanych na zielono).

11. **Certyfikat nigdy nie zwraca 500.** Ta sama umowa co `/api/og/:id` (SPEC §20.7): brak tła, brak fontu, nieodtwarzalna plansza → degradujemy grafikę, nie żądanie. Wyjątkiem jest 404, gdy partia nie zaliczyła żadnego dnia — to nie awaria, tylko brak certyfikatu.

12. **Ton satyryczny, ale fakty bezwzględnie prawdziwe.** Żart polega wyłącznie na **tytulaturze i oprawie** („Certyfikat Ukończenia Kursu Strategii AI", „efekty kształcenia", stopnie kariery). Każda liczba na dokumencie — przeciwnik, gra, data, liczba ruchów, seria, hash — pochodzi z bazy i jest odtwarzalna z powtórki. To jest cała mechanika dowcipu: **pompatyczna forma kursu + weryfikowalna treść**. Gdyby fakty też były podkręcone, dokument stałby się zwykłym memem i przestałby cokolwiek mówić o branży.

13. **Jeden ton, bez przełącznika „poważny/żartobliwy".** Przełącznik podwaja copy do utrzymania w dwóch językach, rozmywa dowcip i zmusza do decyzji użytkownika, który przyszedł po plik. Wersja poważna to jedna stała w `copy.ts`, gdyby kiedyś była potrzebna — nie ekspozycja w UI.

14. **Satyra celuje w GATUNEK, nigdy w konkretną firmę, osobę ani akredytację.** Wystawcą jest sama arena („tic-bot-toe · Wydział Zastosowań Praktycznych"), instytucje są jawnie zmyślone i absurdalne, nie ma żadnego logo, pieczęci akredytacyjnej ani nazwy realnej platformy kursowej. Dokument nosi też jawny disclaimer (§6.0), więc nie da się go użyć jako fałszywego dowodu kwalifikacji.

---

## 3. Skąd biorą się fakty na certyfikacie

### 3.1 `CertificateFacts` — jedyne wejście renderu

```ts
// apps/server/src/certificate/facts.ts
export interface CertificateFacts {
  matchId: string;          // klucz publiczny + weryfikacja
  day: string;              // 'YYYY-MM-DD' — dzień wyzwania (nie data pobrania)
  playerName: string | null;// players.nickname albo null → etykieta anonimowa w copy
  opponentId: string;       // matches.p2_id (np. 'openrouter:meta-llama/...:free')
  opponentLabel: string;    // short(opponentId) — bez prefiksu providera
  game: GameId;
  variant: string;
  streak: number;           // seria NA DZIEŃ `day` (odtworzona, nie zapisana)
  movesHashPrefix: string;  // 12 znaków — „pieczęć" na dokumencie
  moveCount: number;        // liczba ruchów partii (drobiazg, ale uwiarygodnia)
  final: unknown;           // stan końcowy do miniatury planszy (może być null)
}
```

Zapytania (jedna funkcja `factsFor(db, matchId)`):

1. `daily_results` po `match_id` → `{ day, player_token, completed }`. Brak wiersza lub `completed = false` → `null` (route → 404 `no_certificate`).
2. `matches` po `id` → gra, wariant, `p2_id`, `moves`, `moves_hash`, `setup`.
3. `players` po `token_hash = daily_results.player_token` → `nickname` (może być `null`).
4. Wszystkie `day` z `daily_results` dla tego `player_token` z `completed = true` → `streakFrom(days, day)`.
5. Stan końcowy planszy — przez wyniesione `finalState()` z `og/render.ts` (§4.3), w `try/catch`; porażka → `final: null` i certyfikat bez miniatury.

**Uwaga o spójności:** `p2_id` bierzemy z partii, nie z `dailyChallenge(day).opponent`. Gracz mógł zagrać płatnym bliźniakiem (`paidEquivalent`) — certyfikat ma mówić, kogo naprawdę pokonał.

### 3.2 Jedyna zmiana w bazie: indeks

`daily_results` ma PK `(player_token, day)`; szukamy po `match_id`. Tabela jest mała, ale to zapytanie na ścieżce publicznej — dokładamy indeks i migrację `drizzle/0006_*.sql` (`pnpm --filter @arena/server db:generate`):

```ts
// apps/server/src/db/schema.ts — dopisz w (t) => [...] tabeli dailyResults
index('daily_results_match').on(t.matchId),
```

Żadnych nowych kolumn ani tabel.

---

## 4. Architektura renderu

### 4.1 Nowe pliki

```
apps/server/src/certificate/
  facts.ts            factsFor(db, matchId) → CertificateFacts | null   (§3.1)
  copy.ts             PL/EN teksty dokumentu (wzorzec CARD_COPY z og/render.ts)
  scene.ts            certificateScene(facts, locale) + shareCardScene(facts, locale)
  scene-types.ts      Scene, Node (rect | line | text | image | qr | board), Style
  backend-pdf.ts      renderPdf(scene) → Uint8Array          (pdf-lib + fontkit)
  backend-canvas.ts   renderPng(scene, scale) / renderJpeg(scene, scale, q)
  tiers.ts            tierFor(streak) → { color, label }      (§2.10)
  assets/
    certificate-bg.jpg    2480×1748, tło A5 (generowane, §5)
    certificate-share.jpg 1600×840, tło karty social (generowane, §5)
apps/server/src/routes/certificate.ts
apps/server/src/og/boards.ts    ← WYNIESIONE z og/render.ts (§4.3)
```

### 4.2 Lista wyświetlania (`scene-types.ts`)

Przestrzeń sceny to **punkty PDF** (1 pt = 1/72"), oś Y w dół (jak canvas); backend PDF przelicza `y_pdf = height - y`. A5 poziomo = `595.28 × 419.53 pt`.

```ts
export interface Scene { width: number; height: number; nodes: Node[] }

export type Node =
  | { kind: 'image'; src: 'bg'; x: number; y: number; w: number; h: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number;
      fill?: Rgb; stroke?: Rgb; lineWidth?: number; opacity?: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number;
      stroke: Rgb; lineWidth: number; opacity?: number }
  | { kind: 'text'; text: string; x: number; y: number; size: number;
      font: 'display' | 'mono'; bold?: boolean; color: Rgb;
      align?: 'left' | 'center' | 'right'; maxWidth?: number;
      /** 'shrink' zmniejsza stopień do dopasowania, 'ellipsis' ucina. */
      fit?: 'shrink' | 'ellipsis'; tracking?: number }
  | { kind: 'qr'; modules: boolean[][]; x: number; y: number; size: number; color: Rgb }
  | { kind: 'board'; game: GameId; state: unknown; x: number; y: number; size: number };
```

Kontrakt backendu (obowiązkowy, spisany w komentarzu pliku): **każdy backend musi obsłużyć każdy `kind`**; nieznany `kind` jest pomijany po cichu, nigdy nie rzuca (§2.11).

`kind: 'board'` jest celowo semantyczny (a nie rozwinięty do setek `rect`), bo rysowanie plansz już istnieje i ma być jednym źródłem prawdy — patrz niżej.

### 4.3 Refaktor: wyniesienie rysowania plansz

`og/render.ts` trzyma prywatnie `drawTicTacToe`, `drawBattleship`, `drawSudoku`, `drawScrabble`, `finalState`, `ellipsize`, `short`, `Ctx`. Certyfikat potrzebuje tego samego.

Wynieś **bez zmian zachowania** do `apps/server/src/og/boards.ts` i eksportuj:
`drawBoard(ctx, game, state, x, y, size)` (dispatcher), `finalState(match)`, `ellipsize`, `short`, typ `Ctx`, stałe kolorów (`P1`, `P2`, `DIM`, `GRID`). `og/render.ts` importuje je i traci ~110 linii. Testy `og/render.test.ts` muszą przejść bez zmian — to warunek poprawności refaktoru.

Backend PDF nie ma `Ctx` z canvasu, więc `boards.ts` dostaje **drugą, cienką implementację `Ctx` na `pdf-lib`** (`backend-pdf.ts` → `pdfCtx(page, fonts)`): `fillRect`/`strokeRect`/`fillText`/`measureText`/`beginPath`/`moveTo`/`lineTo`/`stroke`. Interfejs `Ctx` w repo jest już minimalny (12 metod) właśnie dlatego, że został spisany ręcznie — to adapter na 60 linii i dzięki niemu miniatura planszy w PDF jest wektorowa.

### 4.4 Zależność: `pdf-lib`

`apps/server/package.json` → `"pdf-lib": "^1.17.1"`, `"@pdf-lib/fontkit": "^1.1.1"`. Czysty JS (bez natywnych binariów), więc `tsup` z `noExternal: [/.*/]` wciąga go do bundla bez żadnych wyjątków — inaczej niż `@napi-rs/canvas`. **Nie dopisuj go do `external`.**

Fonty: `pdfDoc.registerFontkit(fontkit)` + `embedFont(ttf, { subset: true })` z tych samych plików co OG (`og/fonts/*.ttf`). Subsetting trzyma PDF w okolicach 250–350 kB razem z tłem.

Metadane dokumentu (widoczne we właściwościach pliku — element „premium"):
`setTitle`, `setAuthor('tic-bot-toe — LLM Game Arena')`, `setSubject`, `setKeywords`, `setProducer`, `setCreationDate(new Date(day))`.

⚠️ **Ryzyko do sprawdzenia w E1: pokrycie polskich diakrytyków przez Rajdhani.** Google Fonts deklaruje dla Rajdhani subset `latin-ext` (czyli ą/ć/ę/ł/ń/ó/ś/ź/ż), ale plik w repo mógł zostać pobrany jako sam `latin`. W canvasie brak glifu degraduje się do DejaVu (obraz wygląda znośnie), w PDF wyjdzie `.notdef` — pusty prostokąt na dokumencie. **Test jednostkowy obowiązkowy** (§12): dla każdego znaku z polskiego `copy.ts` sprawdź `font.getCharacterSet()` / `hasGlyphForCodePoint`. Gdy glifów brak — najtańsze wyjście: nagłówki po polsku składane JetBrains Mono (pełne pokrycie), zamiast dokładania czwartego pliku fontu.

---

## 5. Tło — generowane tak jak reszta grafik aplikacji

Nowy generator `scripts/gen/certificates.ts` (kopiuj strukturę `sections.ts`), dwa specy w `CATALOG`:

```ts
{
  id: 'certificate-bg',
  asset: 'Full-bleed background of a printable A5 landscape achievement certificate. Purely atmospheric — all text, frames and seals are drawn by the app on top of it.',
  subject:
    'A dark tactical command-console surface seen head-on: a deep near-black field with a faint receding cyan tech grid, a soft cyan glow rising from the lower-left and a soft magenta glow from the upper-right, thin telemetry traces dissolving into the dark at the edges, and a barely visible horizontal scanner sweep across the lower third. Woven into the darkest areas, extremely faint: an engraved guilloche rosette pattern of hairline concentric curves, like the security print of a banknote or a diploma, but drawn in thin cyan HUD lines instead of ink.',
  composition:
    'Wide landscape 1.42:1. The ENTIRE CENTRAL AREA (roughly the middle 80% of width and height) stays calm, dark and almost empty — a full page of text and a framed seal are laid over it. All energy, glow and detail live in the outer margin and fade to near-black at the very edge. Perfectly symmetrical left-to-right feel, no dominant subject, no focal point.',
  technical: '2480x1748 landscape, print resolution.',
},
{
  id: 'certificate-share',
  asset: 'Background of the social share card that announces a completed daily challenge.',
  subject:
    'The same tactical console field, tighter and slightly brighter: a cyan-to-magenta duotone glow sweeping across a dark grid, with faint corner brackets implied in the outer margin.',
  composition:
    'Wide 1.9:1. A calm dark plate in the centre-left where a document and a headline will sit; glow concentrated top-right and bottom-left; near-black at the edges.',
  technical: '1600x840 landscape.',
}
```

Uwagi wykonawcze:

- **Bez `transparent`** — oba tła są nieprzezroczyste, więc limonka `#B6FF3C` jest dozwolona (zakaz z `prompt-kit.ts` dotyczy assetów kluczowanych na zielono).
- **Bez tekstu w grafice** (twarda zasada repo) — `NEGATIVES` już to wymusza; dopisz per-asset `no: ['no seals, no medals, no laurel wreaths, no ribbons, no certificate borders, no frames — the frame is drawn by the app']`, bo model sam z siebie dorysuje pieczęć i wieniec do słowa „certificate". Guilloche z `subject` to **jedyny** dozwolony ukłon w stronę estetyki dyplomu i ma być na granicy widoczności — pieczęć rysuje aplikacja, a wieniec laurowy przewróciłby satyrę w kicz.
- Model ignoruje żądany rozmiar → rozmiar wymusza `sharp` w `place-assets.ts` (`fit: 'cover'`).
- Generuj `--variants=3` i wybierz ręcznie z contact sheeta (tło ma być **nudne** w środku — to najczęstszy powód odrzucenia wariantu).

**Dystrybucja — jedyna zmiana koncepcyjna w `place-assets.ts`:** dziś wszystko ląduje w `WEB_PUBLIC`. Tła certyfikatu potrzebuje **serwer** w czasie żądania. Dołóż drugi cel:

```ts
export const SERVER_ASSETS = join(REPO_ROOT, 'apps', 'server', 'src', 'certificate', 'assets'); // lib/assets.ts

// place-assets.ts — nowe operacje, JPEG zamiast WebP:
{ from: 'certificates/certificate-bg.png',    to: 'certificate-bg.jpg',    dest: SERVER_ASSETS, width: 2480, height: 1748, fit: 'cover', format: 'jpeg', quality: 88 },
{ from: 'certificates/certificate-share.png', to: 'certificate-share.jpg', dest: SERVER_ASSETS, width: 1600, height: 840,  fit: 'cover', format: 'jpeg', quality: 88 },
```

**Dlaczego JPEG, nie WebP:** `pdf-lib` osadza JPEG natywnie (`embedJpg`, filtr `DCTDecode`, bajt w bajt — bez rekompresji) i PNG (`embedPng`); WebP-a nie obsługuje w ogóle. JPEG q88 dla miękkiego, ciemnego tła to ~250–400 kB i zero widocznych artefaktów, bo nad nim nie ma rastrowanego tekstu (§2.2). Pliki wchodzą do repo (jak fonty OG) — są artefaktem builda, nie mogą zależeć od klucza Gemini w CI.

---

## 6. Projekt dokumentu

### 6.0 Ton i treść (`copy.ts`) — najważniejsza część tej funkcji

**Cel dowcipu.** Rynek jest pełen certyfikatów za obejrzenie sześciu godzin wideo o „wdrażaniu i skalowaniu AI w organizacji". Ten dokument wygląda dokładnie tak samo — pompatyczny tytuł, efekty kształcenia, stopień, pieczęć — tylko że **wymagał realnej wygranej z modelem językowym**, ruch po ruchu, do odtworzenia przez każdego pod QR-em. Cała satyra siedzi w tym zderzeniu: im poważniejsza forma, tym mocniej działa drobny druk.

**Zasada nadrzędna:** przesada dotyczy **tytułów**, nigdy **liczb**. Nie ma zdania, które byłoby nieprawdziwe — jest tylko opisane językiem prospektu szkoleniowego.

**Angielski pisany od zera, nie tłumaczony.** Sarkazm nie przeżywa tłumaczenia dosłownego: polski żartuje z „wdrożeń i synergii", angielski z „AI transformation journey" i „thought leadership". `copy.ts` trzyma dwa niezależne teksty, nie jedną strukturę z podmienionymi słowami.

**Reguła: każdy dowcip pada dokładnie raz.** Cztery ciosy, każdy w inny grzech branży, w czterech różnych miejscach dokumentu: **obecność zamiast wyniku** (formuła), **„efekty kształcenia", które są po prostu opisem tego, co się wydarzyło** (lista), **infrastruktura kursu, której nie było** (czas trwania), **akredytacja i lejek** (disclaimer). Powtórzenie tego samego gagu — trzy razy slajdy, dwa razy webinar — natychmiast zmienia dokument z suchego w nachalny; to najczęstszy sposób, w jaki ta funkcja może się zepsuć w trakcie pisania copy. Ton jest **rzeczowy i beznamiętny**: dokument nigdy nie mruga do czytelnika, tylko z kamienną twarzą stosuje żargon szkoleniowy do prawdziwych liczb.

#### Bloki tekstu na dokumencie

| Slot | PL | EN |
|---|---|---|
| kicker (góra) | `AKADEMIA STRATEGII AI · EDYCJA CODZIENNA` | `AI STRATEGY ACADEMY · DAILY COHORT` |
| tytuł | `CERTYFIKAT UKOŃCZENIA KURSU STRATEGII AI` | `CERTIFICATE OF COMPLETION — AI STRATEGY` |
| podtytuł | `poziom zaawansowany · moduł praktyczny` | `advanced level · hands-on module` |
| formuła | `Niniejszym zaświadcza się, na podstawie wyniku, a nie obecności, że` | `This is to certify, on results rather than attendance, that` |
| **nick** | (dane) | (dane) |
| lead | `ukończył(a) pełny program szkoleniowy, pokonując model` | `completed the full training programme by defeating` |
| **przeciwnik** | (dane) | (dane) |
| pod modelem | `w partii rozegranej na żywo, bez cofania ruchów` | `in a live match, with no takebacks` |
| nagłówek efektów | `EFEKTY KSZTAŁCENIA` | `LEARNING OUTCOMES` |
| efekt 1 | `Wdrożenie strategii AI: {gra} {wariant}` | `AI strategy deployment: {game} {variant}` |
| efekt 2 | `Skalowanie przewagi: {n} ruchów odtworzonych przez serwer` | `Scaling the advantage: {n} moves, all server-replayed` |
| efekt 3 (seria ≥ 2) | `Utrzymanie transformacji: {n} dni z rzędu` | `Sustaining the transformation: {n} days running` |
| efekt 3 (seria < 2) | `Time-to-value: jedna partia` | `Time-to-value: a single match` |
| czas trwania | `Czas trwania kursu: jedna partia. Materiały: brak. Webinar: nie odbył się.` | `Course length: one match. Materials: none. Webinar: never happened.` |
| podpis | `Wydział Zastosowań Praktycznych · tic-bot-toe` | `Faculty of Things That Actually Happened · tic-bot-toe` |
| weryfikacja | `Zweryfikuj każdy ruch: {url}` | `Verify every move: {url}` |
| **disclaimer** (6 pt, dim) | `Certyfikat nieakredytowany i nieakredytowalny. Nie uprawnia do prowadzenia szkoleń, prelekcji ani wątków na LinkedInie. Nie zawiera lejka sprzedażowego. Wszystkie dane powyżej są prawdziwe i możliwe do odtworzenia — to jedyna rzecz, która odróżnia go od pozostałych.` | `Unaccredited and unaccreditable. Confers no right to run workshops, keynotes or LinkedIn threads. Contains no sales funnel. Every figure above is real and independently replayable — which is the only thing separating it from the rest.` |

Disclaimer jest **puentą, nie prawnym zastrzeżeniem** — i dlatego jest na dokumencie zawsze, także przy serii 1. Jednocześnie robi robotę z §2.14: nikt nie użyje tego jako dowodu kwalifikacji.

#### Stopnie kariery (`tiers.ts`)

| Seria | PL | EN | Kolor |
|---|---|---|---|
| 1 | *(brak plakietki)* | — | cyan |
| 2–6 | `ENTUZJASTA AI` | `AI ENTHUSIAST` | cyan `#35E7FF` |
| 7–13 | `LIDER STRATEGII AI` | `AI STRATEGY LEAD` | magenta `#FF3D9A` |
| 14–29 | `DYREKTOR DS. TRANSFORMACJI AI` | `HEAD OF AI TRANSFORMATION` | fiolet `#A78BFA` |
| 30+ | `CHIEF AI VISIONARY (SAMOZWAŃCZY)` | `CHIEF AI VISIONARY (SELF-APPOINTED)` | limonka `#B6FF3C` |

Plakietka renderuje stopień **plus** twardą liczbę: `LIDER STRATEGII AI · SERIA 7 DNI`. Tytuł jest żartem, liczba nie jest.

⚠️ **Uwaga wykonawcza dla `fit`:** `CHIEF AI VISIONARY (SAMOZWAŃCZY)` to 32 znaki w plakietce zaprojektowanej pod ~18. Wszystkie stopnie muszą mieć `maxWidth` + `fit: 'shrink'`, a test §12 sprawdza najdłuższy wariant w obu językach — inaczej najrzadszy, najbardziej wyczekiwany tier będzie jedynym, który się rozjedzie.

### 6.1 Certyfikat A5 poziomo (595,28 × 419,53 pt)

Margines bezpieczny **22 pt (~8 mm)** od każdej krawędzi — poza nim nie ma żadnej treści (drukarki domowe nie drukują do krawędzi). Tło jest full-bleed.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⌐                    (tło: generowany HUD, full-bleed)             ¬ │  narożniki L-kształtne, kolor tieru
│   ┌────────────────────────────────────────────────────────────┐    │
│   │ AKADEMIA STRATEGII AI · EDYCJA CODZIENNA                    │    │  kicker mono 7,5pt, tracking, dim
│   │                                                            │    │
│   │      CERTYFIKAT UKOŃCZENIA KURSU STRATEGII AI               │    │  Rajdhani Bold 21pt, tracking 0.16em
│   │      poziom zaawansowany · moduł praktyczny                 │    │  Rajdhani 9pt, dim
│   │      ──────────────────────────────────────                 │    │  linia 0,8pt w kolorze tieru
│   │                                                            │    │
│   │  Niniejszym zaświadcza się, na podstawie wyniku,            │    │  8pt dim
│   │  a nie obecności, że                                        │    │
│   │        d i t h i o t h r e i t o l                          │    │  Rajdhani Bold 32pt, fit:'shrink', cyan
│   │  ukończył(a) pełny program szkoleniowy, pokonując model     │    │  8pt dim
│   │        meta-llama/llama-3.3-70b-instruct:free               │    │  Mono Bold 14pt, magenta, fit:'shrink'
│   │        w partii rozegranej na żywo, bez cofania ruchów      │    │  7,5pt dim, tracking
│   │                                                            │    │
│   │  EFEKTY KSZTAŁCENIA                        ┌────────┐       │    │  mono 7pt tier · lista 8,5pt
│   │  › Wdrożenie strategii AI: Sudoku Duel 6×6 │ plansza│       │    │  miniatura (kind:'board', 84×84 pt)
│   │  › Skalowanie przewagi: 47 ruchów           └────────┘      │    │
│   │    odtworzonych przez serwer                                │    │
│   │  › Utrzymanie transformacji: 7 dni z rzędu                  │    │  3. punkt zależny od serii
│   │                                                            │    │
│   │  Czas trwania kursu: jedna partia. Materiały: brak.         │    │  7,5pt dim
│   │  Webinar: nie odbył się.                                    │    │
│   │  ┌───────────────────────────────────┐                      │    │
│   │  │ LIDER STRATEGII AI · SERIA 7 DNI  │  12 lipca 2026       │    │  plakietka: ramka tieru + mono 9pt
│   │  └───────────────────────────────────┘  Wydział Zastosowań  │    │  podpis 8pt, prawa kolumna
│   │                                          Praktycznych       │    │
│   │ [QR] Zweryfikuj każdy ruch: ticbottoe.lol/certyfikat/3f9c…  │    │  QR 42×42 pt + mono 7pt
│   │ Certyfikat nieakredytowany i nieakredytowalny. Nie upraw…   │    │  disclaimer 6pt, faint, 2 wiersze
│   └────────────────────────────────────────────────────────────┘    │  podwójna ramka: 1,2pt tier + 0,4pt dim, rogi ścięte
│ ∟                              partia 3f9c2a1e · pieczęć a91f4c…  ⌡ │  mono 6,5pt, poza ramką, dim
└──────────────────────────────────────────────────────────────────────┘
```

Hierarchia jest celowo „dyplomowa": nick jest największy, tytuł kursu drugi, a **weryfikowalne dane są najmniejsze i najniżej** — dokładnie jak na prawdziwych certyfikatach kursowych, gdzie drobny druk mówi najwięcej. Tu drobny druk jest jedyną rzeczą, która się broni, i to jest puenta.

Reguły typograficzne (zgodne z DESIGN §2 i `og/render.ts`): **Rajdhani Bold** = chrome i nagłówki, **JetBrains Mono** = dane (id modeli, id partii, hash, data ISO). Wersaliki + tracking na kickerach. Bez zaokrągleń — narożniki ścięte (`clip-cut` w wersji wektorowej: `rect` z podciętym rogiem rysowany czterema `line`).

Elementy warunkowe:

- **Plakietka serii** — tylko `streak >= 2`; treść `t.certificate.streakBadge(n)` (PL „SERIA 7 DNI", EN „7-DAY STREAK"). Kolor z `tierFor(streak)`.
- **Miniatura planszy** — pomijana, gdy `final === null` (nieodtwarzalna partia); układ przesuwa stopkę, nie zostawia dziury.
- **Nick** — `playerName ?? t.certificate.anonymous`; przy braku nicku dodatkowo szara nota pod nazwiskiem: „ustaw nick w ustawieniach, aby podpisać kolejne certyfikaty" (PL/EN).
- **QR** — koduje pełny URL certyfikatu (`https://…/certyfikat/<matchId>`), rysowany jako `rect` per moduł. Dzięki temu wydrukowany certyfikat jest weryfikowalny telefonem. Biblioteka: `qrcode` (`create(text, { errorCorrectionLevel: 'M' })` → macierz modułów) — czysty JS, MIT. Macierz liczy `scene.ts`, więc oba backendy rysują identyczny kod.

### 6.2 Karta social 1200 × 630

```
┌───────────────────────────────────────────────────────────────┐
│  (tło certificate-share)                                      │
│   ✦ KURS STRATEGII AI — UKOŃCZONY                             │  mono 22pt tier, tracking
│                                                               │
│   dithiothreitol                       ┌───────────────┐      │  Rajdhani Bold 60pt, cyan
│   ma certyfikat strategii AI.          │  ▄▄▄▄▄▄▄▄▄▄▄  │      │  Rajdhani 30pt
│   Kurs trwał jedną partię              │  ▄▄▄▄▄▄▄  ▐█▌ │      │  miniatura certyfikatu:
│   i polegał na wygranej z modelem.     │  ▄▄▄▄▄▄▄▄▄▄▄  │      │  prostokąt A5 w ramce tieru
│                                        └───────────────┘      │  z zaznaczonymi liniami tekstu
│   llama-3.3-70b:free · Sudoku Duel 6×6 · 47 ruchów            │  mono 22pt, dim
│   ┌──────────────────────────────────┐                        │
│   │ LIDER STRATEGII AI · SERIA 7 DNI │                        │  plakietka tieru, 24pt
│   └──────────────────────────────────┘                        │
│   47 ruchów · wszystkie do odtworzenia pod tym linkiem        │  mono 20pt, faint
│   tic-bot-toe · LLM Game Arena                  ticbottoe.lol │
└───────────────────────────────────────────────────────────────┘
```

Nagłówek karty musi być **zrozumiały bez kliknięcia** — w feedzie widać go 1,5 sekundy. Dlatego puenta („kurs trwał jedną partię") stoi wysoko i dużą czcionką, a nie w drobnym druku jak na samym dokumencie. To jedyne miejsce, gdzie karta social świadomie odwraca hierarchię certyfikatu.

Zasady „perfekcyjnego podglądu":

- **Bezpieczny pas:** wszystko nośne w prostokącie `x ∈ [60, 1140]`, `y ∈ [80, 550]`. Discord/Slack/X pokazują pełne 1,91:1, ale WhatsApp i część klientów mobilnych przycinają do kwadratu wokół środka — nick i plakietka serii muszą przetrwać ten crop, dlatego stoją po lewej, ale **nie przy krawędzi**.
- **Minimalny stopień pisma 22 pt** w przestrzeni 1200×630 — miniatura w feedzie ma ~400 px szerokości, wszystko poniżej robi się szare.
- Render **JPEG q86** (~180–260 kB) zamiast PNG: tło jest fotograficzne, a limity crawlerów (X: 5 MB) i czas pobrania podglądu wolą lekki plik. `og:image:type = image/jpeg`. Istniejąca karta `/api/og/:id` zostaje PNG — nie ruszamy jej.
- Deklarujemy `og:image:width/height` (1200/630) i `og:image:alt` — bez wymiarów pierwszy podgląd u części klientów renderuje się jako mała miniatura.

---

## 7. API, trasy i SEO

### 7.1 Endpointy (`apps/server/src/routes/certificate.ts`, montowane w `app.ts` w bloku `if (deps.db)`)

| Metoda | Ścieżka | Zwraca |
|---|---|---|
| GET | `/api/certificate/:id.pdf?lang=pl` | `application/pdf` + `Content-Disposition: attachment; filename="tic-bot-toe-certyfikat-<day>.pdf"` |
| GET | `/api/certificate/:id.png?lang=pl` | `image/jpeg` — karta social (rozszerzenie `.png` w URL byłoby kłamstwem; endpoint nazywamy `.jpg`) |
| GET | `/api/certificate/:id` | JSON `CertificateFacts` (zasila stronę SPA bez rozbierania obrazka) |

- `lang`: `isLocale(lang) ? lang : 'pl'` — dokładnie jak `/api/og/:id`.
- Brak wiersza w `daily_results` → `404 { error: 'no_certificate' }`.
- `Cache-Control: public, max-age=31536000, immutable` — treść jest niezmienna per `(matchId, lang)` (§2.5 gwarantuje niezmienność serii).
- Rate limit w `app.ts`: `api.use('/certificate/*', rateLimit('certificate', 60, {...}))`. Render PDF to ~80–150 ms CPU; 60/h/IP starcza człowiekowi z zapasem i ogranicza koszt skanera.
- `Content-Disposition` **tylko** na PDF — to jest „pobranie na dysk lokalny".

### 7.2 Trasa SPA + OG

1. `packages/i18n/src/index.ts`: dopisz `RouteKey` `'certificate'`, segmenty `pl: 'certyfikat'`, `en: 'certificate'`. (`ROUTE_KEYS` i `translatePath` dostosują się same.)
2. `apps/web/src/App.tsx`: `<Route path={`${routeSegment(locale,'certificate')}/:id`} element={<CertificatePage />} />`.
3. `apps/server/src/og/meta.ts`: `certificateOgTags(facts, origin, locale)` + `certificateStructuredData` (schema.org `CreativeWork` / `Achievement`-ish: `name`, `about`, `dateCreated`, `url`). Wzorzec 1:1 jak `matchOgTags`.
4. `apps/server/src/index.ts`: handler bliźniaczy do `replayHandler` na `localePath('pl'|'en', 'certificate', ':id')` — wstrzykuje tagi przez `injectSeo` (`ogType: 'article'`).
5. `og/seo.ts`: **nie dokładamy** certyfikatów do `sitemap.xml` (§2.7). `robots.txt` zostaje bez `Disallow` — Twitterbot respektuje `robots.txt` przy pobieraniu karty, więc blokada zabiłaby podgląd, po który cała ta funkcja powstała.

---

## 8. UI w aplikacji

### 8.1 Po wygranym queście (`GameRunner.tsx`)

W bloku `{dailyClaim && (…)}` (dziś jeden wiersz „✓ Zaliczone · Seria: n") dołóż pas akcji:

- **`Pobierz certyfikat (PDF)`** — `variant="edu"`, `<a href={`/api/certificate/${saveResponse.matchId}.pdf?lang=${locale}`} download>`. Zwykły link, nie `fetch` + Blob: przeglądarka sama pokazuje pasek pobierania, a plik trafia do katalogu pobrań bez pośrednictwa JS.
- **`Udostępnij`** — `navigator.share({ title, text, url })`; gdy API brak → kopiowanie linku (wzorzec `copyReplayLink`). Na mobile, gdy `navigator.canShare({ files })`, dorzuć pobrany PDF jako plik — to jedno kliknięcie do Instagram Stories/WhatsApp.
- **`Zobacz certyfikat`** — link do `path('certificate', matchId)`.

Gdy `playerName === null`: nad przyciskami mikro-nota z linkiem do ustawień („podpisz certyfikat nickiem").

### 8.2 Karta wyzwania (`DailyChallengeCard.tsx`)

Gałąź `todayCompleted` dostaje link „Certyfikat →". Wymaga `matchId` — rozszerz `GET /api/daily` o `todayMatchId: string | null` (jedno pole z już pobieranych wierszy; `DailyState` w `apps/web/src/api/community.ts` + typ po stronie serwera).

### 8.3 Strona `/certyfikat/:id` (`apps/web/src/pages/CertificatePage.tsx`)

Minimalna i skupiona: `<img src="/api/certificate/:id.jpg">` jako podgląd (proporcje 1200×630, `loading="eager"`), pod nim fakty z `GET /api/certificate/:id`, przycisk pobrania PDF, przyciski „Udostępnij" / X / LinkedIn / Facebook (intent-linki z `encodeURIComponent(url)`), link do powtórki. Stan 404 → komunikat „ta partia nie zaliczyła wyzwania" + link do areny. Nie odtwarzamy tu certyfikatu w HTML-u — jedynym źródłem wyglądu jest render serwerowy (inaczej mielibyśmy trzeci renderer do utrzymania).

### 8.4 i18n

Nowy blok `certificate` w `apps/web/src/i18n/pl.ts` **i** `en.ts` (pl jest źródłem typu `Dict` — brak klucza w `en.ts` wywala build): `download`, `share`, `view`, `setNickHint`, `notFound`, `shareText(opponent, streak)`.

Ton przycisków idzie za dokumentem: `download` = „Odbierz dyplom (PDF)" / „Collect your diploma (PDF)", `view` = „Zobacz certyfikat", `notFound` = „Ta partia nie ukończyła kursu." / „This match did not complete the course."
Domyślny tekst udostępnienia (trafia do `navigator.share` i do intent-linków — to on niesie żart dalej, bo część klientów pokazuje go obok karty):
PL `Ukończyłem kurs strategii AI. Trwał jedną partię i polegał na pokonaniu {opponent}. Każdy ruch do sprawdzenia:`
EN `I completed an AI strategy course. It lasted one match and consisted of beating {opponent}. Every move is checkable:`

Teksty **na dokumencie** żyją osobno, w `apps/server/src/certificate/copy.ts` (serwer nie importuje z `apps/web`) — dokładnie tak, jak `CARD_COPY` w `og/render.ts`. Nazwy gier: skopiuj mapowanie z `CARD_COPY`, żeby karta OG i certyfikat mówiły tym samym językiem o tej samej grze.

---

## 9. Bezpieczeństwo i prywatność

- **Zero zaufania do klienta:** wejściem jest wyłącznie `matchId` z URL. Nick, przeciwnik, data i seria pochodzą z bazy. Nie ma parametru, którym da się podmienić treść dokumentu.
- **Token gracza nigdy nie wychodzi:** `daily_results.player_token` to SHA-256; służy wyłącznie do złączenia z `players` i do policzenia serii. Nie trafia do odpowiedzi ani na dokument.
- **Enumeracja:** brak endpointu listującego, brak certyfikatów w sitemapie, klucz to UUIDv4. Skanowanie przestrzeni UUID jest nieopłacalne, a rate limit ją domyka.
- **`no_certificate` zamiast `not_found` przy istniejącej partii:** nie potwierdzamy istnienia partii inaczej niż robi to już publiczne `/api/replay/:id`, więc nie dokładamy nowego kanału wycieku.
- **Odwołanie certyfikatu:** gdy partia zostanie usunięta (moderacja), `factsFor` zwróci `null` → 404. Nie ma osobnego stanu „unieważniony" do utrzymania.

---

## 10. Wydajność

- Render PDF: ~80–150 ms (osadzenie JPEG bez rekompresji + subset fontów + kilkadziesiąt prymitywów). Karta social (canvas 1200×630): ~40–80 ms.
- Tła wczytywane **raz** i trzymane w module (`let bgCache: Buffer | null`), jak `registerBrandFonts()` — nie czytamy pliku per żądanie.
- `Cache-Control: immutable` (rok) — reverse proxy i CDN przejmują powtórki.
- Opcjonalny bufor LRU (16 pozycji) na gotowe bajty PDF/JPEG — dołóż tylko, jeśli profil pokaże, że warto. Nie na start.

---

## 11. Deploy

1. `apps/server/tsup.config.ts` → w `onSuccess` dołóż kopiowanie assetów obok fontów:
   ```ts
   await cp('src/certificate/assets', 'dist/certificate-assets', { recursive: true });
   ```
   Ścieżka rozwiązywana w runtime tak jak `FONTS_DIR` (`dirname(fileURLToPath(import.meta.url))`), z override przez `CERT_ASSETS_DIR` — pokrywa dev (`src/certificate/assets`), `start:prod` (`dist/certificate-assets`) i obraz (`/app/certificate-assets`).
2. `deploy/Dockerfile` → `COPY --from=build /app/apps/server/dist/certificate-assets ./certificate-assets` (obok linii z `./fonts`).
3. `pdf-lib` i `qrcode` są czystym JS → wchodzą do bundla; **żadnych zmian w `external`** i żadnego `npm install` w runtime stage.
4. `.env.example` bez zmian — funkcja nie wprowadza sekretów.

---

## 12. Testy

**Jednostkowe (vitest, `apps/server`):**

- `og/boards.test.ts` — refaktor §4.3 nie zmienił renderu OG (istniejące `og/render.test.ts` musi przejść bez modyfikacji; to główny dowód).
- `certificate/scene.test.ts` — scena dla reprezentatywnych faktów: zawiera nick, id przeciwnika, datę i pieczęć; `streak: 1` **nie** produkuje plakietki, `streak: 2` produkuje; brak nicku → etykieta anonimowa; wszystkie węzły mieszczą się w marginesie bezpiecznym (`x >= 22 && x + w <= 573`); długi nick i długie id modelu mają ustawione `maxWidth` + `fit`.
- `certificate/tiers.test.ts` — progi 1/2/7/14/30, brak złota/amber w palecie, oraz **najdłuższy stopień w obu językach** (`CHIEF AI VISIONARY (SAMOZWAŃCZY)`) mieści się w szerokości plakietki po zastosowaniu `fit: 'shrink'` przy minimalnym dopuszczalnym stopniu pisma (§6.0).
- `certificate/copy.test.ts` (część tonalna) — disclaimer jest obecny na dokumencie **zawsze**, także przy serii 1 (§6.0); trzeci „efekt kształcenia" przełącza się na wariant bez serii dla `streak < 2`; **żaden gag nie powtarza się w dwóch slotach** (strażnik na słowa-klucze: `slajd`/`slide`, `webinar`, `lejek`/`funnel`, `LinkedIn` — każde dozwolone maksymalnie raz w całym dokumencie, §6.0); PL i EN nie są swoimi dosłownymi tłumaczeniami (prosty strażnik: różna liczba segmentów/długość — chodzi o to, żeby ktoś nie „naprawił" angielskiego, przepuszczając polski przez translator).
- `certificate/copy.test.ts` — **pokrycie glifów**: każdy znak z PL i EN copy ma glif w Rajdhani i JetBrains Mono (§4.4). Ten test jest powodem, dla którego wada wyjdzie w CI, a nie na wydrukowanym dokumencie.
- `certificate/backend-pdf.test.ts` — bajty zaczynają się od `%PDF-`, kończą `%%EOF`, rozmiar w [80 kB, 900 kB], strona ma 595,28 × 419,53 pt, metadane ustawione.
- `certificate/backend-canvas.test.ts` — sygnatura JPEG (`FF D8 FF`), wymiary 1200×630.
- `certificate/facts.test.ts` — odtworzenie serii: zestaw dni `[D-2, D-1, D]` → seria 3 dla `day = D` i seria 2 dla `day = D-1` (dowód, że certyfikat historyczny nie „rośnie" wraz z późniejszymi dniami).

**Integracyjne (testcontainers, wzorzec `community.integration.test.ts`):**

- zaliczenie dnia → `GET /api/certificate/:id.pdf` = 200, `application/pdf`, `Content-Disposition: attachment`;
- partia bez zaliczenia dnia → 404 `no_certificate`;
- `?lang=en` → inny dokument niż `?lang=pl` (różna długość bajtów wystarczy);
- gracz bez nicku → 200 (dokument z etykietą anonimową, nie błąd);
- `GET /api/daily` zwraca `todayMatchId` po zaliczeniu.

**E2E (Playwright, `e2e/`):** po symulowanym zaliczeniu — klik „Pobierz certyfikat" wyzwala `page.waitForEvent('download')`, `suggestedFilename()` kończy się `.pdf`. Osobno: `GET /certyfikat/<id>` zwraca HTML z `og:image` wskazującym na `/api/certificate/<id>.jpg` (regresja podglądu social, tania i wyłapuje najczęstszą wpadkę — obrazek OG pod względnym URL-em).

**Ręcznie przed wydaniem:** podgląd linku w [X Card Validator], [LinkedIn Post Inspector], Discordzie i WhatsAppie; wydruk A5 na domowej drukarce (marginesy!); otwarcie PDF w Acrobat + podglądzie macOS + Chrome (najczęstsze źródło różnic w osadzaniu fontów).

---

## 13. Etapy realizacji

**E1 — fakty + PDF wektorowy (bez grafiki).**
`facts.ts`, `copy.ts`, `tiers.ts`, `scene-types.ts`, `scene.ts` (bez `image` i `qr`), `backend-pdf.ts`, `routes/certificate.ts` (tylko `.pdf` i JSON), montaż w `app.ts` + rate limit, indeks `daily_results_match` + migracja, testy jednostkowe i integracyjne.
*Gotowe, gdy:* `curl -o cert.pdf localhost:8090/api/certificate/<id>.pdf` daje otwieralny, poprawnie otypografowany dokument A5 poziomo z polskimi znakami — **i gdy tekst z §6.0 przeszedł przegląd tonalny** (§2.14: zero nazw własnych; disclaimer obecny; EN nie jest tłumaczeniem PL). Copy jest tu produktem, nie wypełniaczem — jeśli dowcip nie działa na wydruku w E1, nie zacznie działać po dołożeniu tła w E3.

**E2 — refaktor plansz + karta social + strona + OG.**
`og/boards.ts` (wyniesienie), `pdfCtx` (miniatura planszy w PDF), `backend-canvas.ts`, `shareCardScene`, endpoint `.jpg`, `RouteKey 'certificate'`, `CertificatePage.tsx`, `certificateOgTags` + handler w `index.ts`, e2e podglądu.
*Gotowe, gdy:* wklejenie linku `/certyfikat/<id>` do Discorda pokazuje poprawną kartę, a `og/render.test.ts` nadal zielony.

**E3 — grafika premium.**
`scripts/gen/certificates.ts`, wybór wariantów, `place-assets.ts` + `SERVER_ASSETS`, węzeł `image` w obu backendach, ramki/narożniki/plakietka tieru, QR (`qrcode`), `tsup` + `Dockerfile`.
*Gotowe, gdy:* wydruk A5 wygląda jak dokument, a nie jak zrzut ekranu; QR ze zdjęcia telefonu otwiera stronę certyfikatu.

**E4 — integracja z UI.**
Przyciski w `GameRunner.tsx`, `todayMatchId` + link w `DailyChallengeCard.tsx`, Web Share API (+ udostępnianie pliku na mobile), i18n PL/EN, nota o nicku, e2e pobrania.
*Gotowe, gdy:* ścieżka „wygrywam wyzwanie → pobieram PDF → wrzucam na X" działa bez wchodzenia w URL-e ręcznie.

**E5 (opcjonalny) — historia certyfikatów.**
`GET /api/daily/history` (token-scoped: `[{ day, matchId }]`) + lista „Twoje certyfikaty" pod kartą wyzwania. Domyka „**każdy** wygrany quest ma certyfikat" także dla dni sprzed wdrożenia — a te certyfikaty działają wstecz bez migracji dzięki §2.5.

Po E4: wpis w `DECISIONS.md` (sekcja w stylu istniejących: dlaczego wektor zamiast rastra, dlaczego seria nie jest w bazie, dlaczego endpointy są publiczne, jaki kompromis przyjęto na karcie social) oraz akapit w `README.md` / `README.pl.md`.

---

## 14. Ryzyka

| Ryzyko | Wpływ | Reakcja |
|---|---|---|
| Rajdhani bez polskich diakrytyków | `.notdef` na dokumencie | Test pokrycia glifów w E1 (§4.4); fallback: nagłówki PL w JetBrains Mono |
| Generowane tło zbyt „zajęte" w środku | tekst nieczytelny, dokument tandetny | Spec wymusza pustkę w centrum + 3 warianty i ręczny wybór; wektorowa winieta jako dociążenie |
| Podgląd social przycięty do kwadratu (WhatsApp) | nick/seria poza kadrem | Bezpieczny pas §6.2 + ręczna weryfikacja w 4 klientach |
| `pdf-lib` w bundlu tsup | build serwera pada | Czysty JS — sprawdź `pnpm --filter @arena/server build` już w E1, przed napisaniem sceny |
| Koszt CPU przy skanowaniu endpointu | obciążenie VPS | Rate limit 60/h/IP + `immutable` cache; ewentualnie LRU |
| „Quest" ≠ „wyzwanie dnia" w intencji właściciela | zbudowane nie to | Jedyne założenie tego planu; `CertificateFacts` jest agnostyczne — podmiana źródła faktów to jeden plik (`facts.ts`) |
| Odbiorca nie łapie satyry i bierze dokument za prawdziwy dyplom | zażenowanie zamiast żartu | Disclaimer na dokumencie (§6.0) + jawnie absurdalny stopień + brak jakiegokolwiek logo akredytacyjnego. Testowane na 3 osobach spoza projektu **przed** wydaniem — jeśli ktokolwiek zapyta „to jest prawdziwe?", ton idzie o stopień wyżej |
| Żart czyta się jak atak na konkretną firmę/osobę | realny problem, nie tylko wizerunkowy | §2.14 jest twarde: zero nazw własnych platform, firm i ludzi w `copy.ts`; przegląd tekstu pod tym kątem jest częścią review E1 |
| Dosłowne tłumaczenie EN zabija dowcip | angielska wersja wypada żałośnie | Angielski pisany od zera (§6.0) + strażnik w `copy.test.ts` |

## 15. Poza zakresem

Podpis kryptograficzny PDF (PAdES), certyfikaty za inne osiągnięcia (Elo, ranking intuicji, tryb Turinga), wersje do druku wielkoformatowego, NFT/on-chain, wysyłka mailem, galeria publiczna certyfikatów.
