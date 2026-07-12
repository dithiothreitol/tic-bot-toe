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
- Przezroczystość: render na płaskim **chroma‑tle**, wycinane po **dominacji koloru** (`g − max(r,b)`), nie po odległości — model maluje matte o zmiennej jasności (zmierzone od `#069a06` do `#05c704`), więc próg odległości zostawia teal.
  **Uwaga 1:** marka używa **jednocześnie** cyanu (P1) i magenty (P2) — więc ani cyan, ani magenta nie nadają się na matte. Domyślny matte: **zieleń `#00FF00`**.
  **Uwaga 2 (twarde ograniczenie):** **zielony matte i lime `#B6FF3C` wykluczają się.** Lime jest zielono‑dominująca (`g 255 > max(r,b) 182`) → keyer ją wycina, a de‑spill zamienia resztki w **oliwkę/złoto**. Dlatego `buildPrompt` **zakazuje lime na assetach keyowanych**; lime wolno używać **tylko na nieprzezroczystych** (np. hero). Magenta matte nie jest wyjściem — zjadłaby markową magentę.
- Dwie nawracające awarie modelu: malowanie matte **na biało** zamiast zielono oraz dryf w **złoto/amber**. Oba kontrowane w prompt‑kicie — mimo to **zawsze obejrzyj `-preview.png`** przed wdrożeniem.
- Logo z Gemini na chroma‑tle → chroma‑key → z jednego mastera `sharp` wyprowadza cały zestaw ikon; `.ico` pakujemy bajtowo (`buildIco`, PNG‑in‑ICO).

## Ograniczenia aplikacji docelowej

- **CSP** (`apps/server/src/middleware/security.ts`): `img-src 'self' data: blob:`, `font-src 'self'`. Zero zewnętrznych CDN — wszystko self‑hosted. Dla `<video>` trzeba dodać **`media-src 'self'`**.
- **Dark‑only** `#05070C`; styl HUD (radius 0, clip‑path, siatka, brackety, scanline); fonty Rajdhani + JetBrains Mono.
- `apps/web/public/` serwuje się z roota; dziś jest tam tylko `og.png`. Brak favicon/manifestu; `index.html` nie ma `<link rel="icon">`.
- Dynamiczne OG per‑mecz: `@napi-rs/canvas` fontem DejaVu (nie marki) — do podmiany na fonty marki w Fazie 5.

## Paleta (mirror `apps/web/src/index.css` — trzymać w synchronie)

`bg #05070C` · `panel #080D18` · `inset #060A14` · **P1 cyan `#35E7FF`** · **P2 magenta `#FF3D9A`** · `edu lime #B6FF3C` · `danger #FF4D6A` · `warn #FF8A3C` · `violet #A78BFA` · `text #DCE6F5` · `dim #8590AD`.

**Drabina tekstu przeszła na AA** (WCAG 4,5:1 na `#05070C`), bo wszystkie trzy poziomy niosą realny tekst 10–12 px:
`--muted-fg #A4ADC7` (9,00:1) · `--dim-fg #8590AD` (6,32:1) · `--faint-fg #6777A3` (4,55:1 — wcześniej `#4B587C` = **2,87:1**, poniżej nawet luźniejszego progu 3,0). Odcień i nasycenie bez zmian — podniesiona wyłącznie jasność. Pilnuje tego `pnpm assets:check`.

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
| 0 | Fundament: devDeps (`sharp`,`tsx`,`dotenv`,`@types/node`), env, `scripts/gen/lib/*`, `assets/generated/*` | brak | **gotowe** |
| 1 | Prompt‑kit Cyber‑HUD (`prompt-kit.ts`) + `preview-prompts.ts` (`--dry-run`) | brak | **gotowe** |
| 2 | Rdzeń marki: logo (Gemini, wariant v5) → `favicon.ico`/apple‑touch/PWA 192‑512/maskable + `manifest.webmanifest` + linki w `index.html` + znak w headerze | tak | **gotowe** |
| 3 | Kafle gier + efekty strzałów. **Świadomie BEZ AI** — screen 01 i SPEC §7.4 wymagają ostrej geometrii i *animacji*, nie rastra (komórka planszy = 20–28 px). `GameGlyph.tsx` + keyframes `shotSplash/shotHit/shotSunk` | brak | **gotowe** |
| 4 | Hero + Quick Start (4 kroki) + callout „dlaczego to działa" + stany puste | tak | **gotowe** |
| 5 | Identikony (deterministyczne, `identicon.ts`) + OG w fontach marki (`@napi-rs/canvas` + TTF w `src/og/fonts`) | częściowo | **gotowe** |
| 6 | Wideo: Playwright nagrywa **realną** partię (2 różne darmowe modele OpenRoutera) → ffmpeg przycina → `match.webm` + poster; sekcja „Zobacz partię" | brak (Gemini) | **gotowe** |
| 7 | QA: `check-assets.ts` (alfa / kontrast WCAG / CSP) + `place-assets.ts` + pełny `typecheck`/`test`/`build` | brak | **gotowe** |

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
# bez kosztów API:
pnpm assets:prompts     # przykładowe prompty → assets/generated/_prompts/
pnpm assets:typecheck   # typecheck generatorów
pnpm assets:place       # dystrybucja assets/generated → apps/web/public (WebP + wideo)
pnpm assets:check       # QA: alfa / kontrast WCAG / brak zasobów spoza domeny

# generowanie (wymaga GEMINI_API_KEY w .env):
pnpm tsx scripts/gen/brand.ts    --only=logo-mark --variants=6   # znak marki
pnpm tsx scripts/gen/brand.ts    --only=logo-mark --rekey        # re-keying BEZ API
pnpm tsx scripts/gen/icons.ts    --from=logo-mark-v5             # cały zestaw ikon
pnpm tsx scripts/gen/sections.ts --dry-run                       # prompty sekcji
pnpm tsx scripts/gen/sections.ts --only=hero-banner --variants=3

# wideo (wymaga OPENROUTER_API_KEY, ffmpeg i działającego `vite preview`):
pnpm tsx scripts/gen/record-match.ts
```

## Znane luki (stan na koniec Fazy 7)

- **Animacje strzałów (§7.4) nie zostały zweryfikowane wizualnie** — nagrano partię w kółko i krzyżyk, nie w statki. Są otestowane jednostkowo i obecne w zbudowanym CSS.
- **`og.png`** (statyczna karta społecznościowa) nadal pochodzi sprzed rebrandingu; dynamiczne OG per‑mecz są już w fontach marki.

## Ryzyka

- **Koszt Gemini** — dziesiątki wywołań × warianty; `--dry-run` pozwala dopracować prompty bez opłat.
- **Favicon z AI** — ostrość 16–32 px (mitygacja: master hi‑res + wariant uproszczony + wybór z kilku).
- **Chroma‑key** — użyć magenty/zieleni, nie cyanu (kolizja z P1).
- **`media-src` w CSP** — warunek działania `<video>`.
- **Fonty do canvas** — `@fontsource` daje woff2; `@napi-rs/canvas` potrzebuje TTF → self‑hostować Rajdhani/JetBrains.

Styl pracy: fazowo, każda faza kończy się zielonym `test`/`build`, commitem i aktualizacją pamięci.
