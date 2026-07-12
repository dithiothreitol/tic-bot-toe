# Plan: assety marki i rozgrywek generowane modelami Gemini

Źródło techniki: `grzybiarz-mono` (generatory grafik przez REST Gemini + post‑processing `sharp`).
Cel: logo + favicon/ikony + grafiki i wideo ilustrujące rozgrywki, spójne z L&F **Cyber‑HUD / Tactical**, osadzone na stronach `apps/web`.

## Decyzje (potwierdzone z właścicielem)

| Temat | Decyzja |
|---|---|
| Logo / favicon / ikony | **Generowane przez Gemini** (dosłownie). Mitygacja ostrości 16–32 px: master w wysokiej rozdz. + prosty wariant małego rozmiaru + kilka wariantów do wyboru. |
| Wideo | **Nagranie realnej partii** (Playwright headless Chrome → zapętlony `webm`) do hero / „jak to działa". Nie Veo. |
| Zakres | Wszystkie 4 grupy: rdzeń marki, grafiki rozgrywek, hero+sekcje+stany, identikony+OG w brandzie. |
| Dodatkowo | **Sekcja „Quick Start"** na stronie głównej — wprowadzenie w obsługę aplikacji (4 kroki z ilustracjami). |

## Technika przeniesiona z grzybiarza

- **Bez SDK** — bezpośredni REST `POST …/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`
  z `body = { contents:[{ parts:[{ text }] }], generationConfig:{ responseModalities:['TEXT','IMAGE'] } }`.
- Model domyślny: `gemini-3-pro-image-preview` (env `GEMINI_IMAGE_MODEL`), klucz `GEMINI_API_KEY` z root `.env`.
- Dekodowanie: pierwsza część `candidates[0].content.parts` z `inlineData.mimeType = image/*`, `Buffer.from(data,'base64')`.
- **API ignoruje rozmiar / aspect / seed** → wymiar wymusza `sharp.resize(...,{fit:'cover'})`; spójność serii wyłącznie prozą; rate‑limit ~10 req/min.
- Przezroczystość: render na płaskim **chroma‑tle**, wycinane po **odległości euklidesowej** do koloru matte (`chromaKeyToAlpha`) + tłumienie spilla.
  **Uwaga (ważne):** marka używa **jednocześnie** cyanu (P1 `#35E7FF`) i magenty (P2 `#FF3D9A`) — więc ani cyan, ani magenta nie nadają się na matte (wycięłyby połowę znaku). Domyślny matte to **zieleń `#00FF00`** (dystans od zieleni: cyan ≈262, magenta ≈355, lime ≈192 — wszystko zachowane); magenta tylko jako fallback dla grafik zdominowanych zielenią.
- Logo z Gemini na chroma‑tle → chroma‑key → z jednego mastera `sharp` wyprowadza cały zestaw ikon; `.ico` pakujemy bajtowo (`buildIco`, PNG‑in‑ICO).

## Ograniczenia aplikacji docelowej

- **CSP** (`apps/server/src/middleware/security.ts`): `img-src 'self' data: blob:`, `font-src 'self'`. Zero zewnętrznych CDN — wszystko self‑hosted. Dla `<video>` trzeba dodać **`media-src 'self'`**.
- **Dark‑only** `#05070C`; styl HUD (radius 0, clip‑path, siatka, brackety, scanline); fonty Rajdhani + JetBrains Mono.
- `apps/web/public/` serwuje się z roota; dziś jest tam tylko `og.png`. Brak favicon/manifestu; `index.html` nie ma `<link rel="icon">`.
- Dynamiczne OG per‑mecz: `@napi-rs/canvas` fontem DejaVu (nie marki) — do podmiany na fonty marki w Fazie 5.

## Paleta (mirror `apps/web/src/index.css` — trzymać w synchronie)

`bg #05070C` · `panel #080D18` · `inset #060A14` · **P1 cyan `#35E7FF`** · **P2 magenta `#FF3D9A`** · `edu lime #B6FF3C` · `danger #FF4D6A` · `warn #FF8A3C` · `violet #A78BFA` · `text #DCE6F5` · `dim #6E7B9E`.

## Struktura promptu (jeden STYLE_PREAMBLE — bez dwóch sprzecznych stylów jak w grzybiarzu)

```
STYLE_PREAMBLE  (Cyber-HUD / Tactical, medium, twarde bany)
ASSET:        co to jest + gdzie użyte + min. czytelny rozmiar
SUBJECT:      dokładny obiekt do narysowania
COMPOSITION:  rozmieszczenie, strefy bezpieczne, negative space
COLORS:       jawne hexy ("użyj tych, nie wymyślaj")
BACKGROUND:   chroma-matte (dla przezroczystych) albo solidne tło HUD
NO:           twarde negatywy (brak tekstu/liter/cyfr, brak zaokrągleń, ...)
TECHNICAL:    nominalny rozmiar + format
```

## Fazy

| Faza | Zakres | Koszt API | Status |
|---|---|---|---|
| 0 | Fundament: devDeps (`sharp`,`tsx`,`dotenv`,`@types/node`), env, `scripts/gen/lib/*`, `assets/generated/*` | brak | **w toku** |
| 1 | Prompt‑kit Cyber‑HUD (`prompt-kit.ts`) + `preview-prompts.ts` (`--dry-run`) | brak | **w toku** |
| 2 | Rdzeń marki: logo (Gemini) → favicon/`.ico`/apple‑touch/PWA 192‑512/maskable + `manifest.webmanifest` + `og.png` + linki w `index.html` | tak | plan |
| 3 | Grafiki rozgrywek: kafle gier, splash/eksplozja/zatopienie (§7.4), grafika wyniku | tak | plan |
| 4 | Hero + sekcje (edu, modele AI) + stany puste/ładowania + **QuickStartSection** | tak | plan |
| 5 | Identikony (deterministyczne) + OG w fontach marki (`@napi-rs/canvas`) | częściowo | plan |
| 6 | Wideo: Playwright nagrywa realny mecz → `webm`; `<video>` + `media-src` w CSP | brak API | plan |
| 7 | QA: `check-transparency`, `check-contrast`, `place-assets`, `pnpm build`+`typecheck`, zrzut headless | brak | plan |

## Mapa osadzenia (punkty wstawienia)

- Favicon/PWA → `apps/web/index.html` `<head>` + `apps/web/public/**`.
- Logo (znak) → `apps/web/src/App.tsx` (podmiana CSS‑rombu na `<img src="/logo.png">`; wordmark zostaje tekstem).
- Hero → `apps/web/src/pages/ArenaPage.tsx`.
- Kafle gier → `apps/web/src/components/SetupScreen.tsx`.
- Plansze/efekty → `apps/web/src/components/{Board3x3,BattleshipBoard}.tsx`.
- Karta wyniku → `apps/web/src/components/GameRunner.tsx`.
- Stany puste → `apps/web/src/components/charts/ChartFrame.tsx`; ładowanie → `ModelLoadBar.tsx`.
- Identikony → `PlayerSlot` w `GameRunner.tsx`.
- OG dynamiczne → `apps/server/src/og/render.ts`.
- Quick Start → nowy `QuickStartSection` + i18n `apps/web/src/i18n/pl.ts`.

## Uruchamianie

```bash
# fundament, bez kosztów API:
pnpm assets:prompts          # zapisuje przykładowe prompty do assets/generated/_prompts/
pnpm assets:typecheck        # typecheck skryptów generatorów

# generowanie (wymaga GEMINI_API_KEY w .env), np.:
pnpm tsx scripts/gen/<generator>.ts --dry-run   # najpierw prompty, bez API
pnpm tsx scripts/gen/<generator>.ts --variants=6 --only=logo-mark
```

## Ryzyka

- **Koszt Gemini** — dziesiątki wywołań × warianty; `--dry-run` pozwala dopracować prompty bez opłat.
- **Favicon z AI** — ostrość 16–32 px (mitygacja: master hi‑res + wariant uproszczony + wybór z kilku).
- **Chroma‑key** — użyć magenty/zieleni, nie cyanu (kolizja z P1).
- **`media-src` w CSP** — warunek działania `<video>`.
- **Fonty do canvas** — `@fontsource` daje woff2; `@napi-rs/canvas` potrzebuje TTF → self‑hostować Rajdhani/JetBrains.

Styl pracy: fazowo, każda faza kończy się zielonym `test`/`build`, commitem i aktualizacją pamięci.
