# POSTĘP — dziennik decyzji redakcyjnych produkcji

Odpowiednik `DECISIONS.md` dla materiałów szkoleniowych. Jednozdaniowe decyzje per etap. Najnowsze na górze.

## Etap 5 — Karuzela LinkedIn (gotowa, do recenzji)

- **10 slajdów 1080×1350 (4:5), render @2x** → PNG (post wielo-obrazkowy) + `karuzela.pdf` (post dokumentowy). Toolchain: `tools/slides.html` + `tools/render-slides.mjs` (Chromium/Playwright), deterministycznie — poprawka to edycja HTML i ponowny render.
- **Fonty Rajdhani + JetBrains Mono z Google Fonts** ładowane w czasie renderu; skrypt czeka na `document.fonts.ready` (bez tego pierwszy render łapał fallback). Zweryfikowane wizualnie: polskie znaki OK.
- **Headline = „30 minut w samochodzie"** (slajd 1) — najmocniejszy fakt z researchu; prowadzi całą narrację. Slajd 2 osadza realny zrzut produkcji w ramce HUD.
- **Fakty tylko z `FAKTY.md`** (D5): 71 commitów, 49 (Opus 4.8 1M) / 16 (Fable 5), 6 dni, v1→v4, „0 linii kodu ręcznie". Zero kosztów/godzin (pominięte przez autora).
- **Tekst posta w `karuzela/POST.md`**: dwa hooki (osobisty / liczbowy), treść, hashtagi, 10 alt-tekstów.
- **Do recenzji autora:** wybór hooka; ewentualne dane osobowe/stanowisko na slajdzie 10; czy publikować jako PNG-e czy PDF.

## Etap 0b — Toolchain + zrzuty (gotowe)

- **Zrzuty przez Playwright z produkcji** (`tools/capture-screens.mjs`): home, leaderboard, karta modelu — z danymi; muzeum i turing renderują się poprawnie, ale w pustym stanie (za mało partii na produkcji). Heatmapy brak (model ma 10 partii). Spisane w `zrzuty/README.md`.

## Etap 0 — Pakiet źródłowy (gotowy, zacommitowany 3e00a5e)

- `FAKTY.md`, `PYTANIA-DO-AUTORA.md`, `BRAND.md`, `zrodla/` (prompt startowy + research), `zrzuty/`, `README.md`. Wszystkie liczby policzone z gita; luki domknięte przez autora lub świadomie pominięte.
