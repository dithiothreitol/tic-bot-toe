# POSTĘP — dziennik decyzji redakcyjnych produkcji

Odpowiednik `DECISIONS.md` dla materiałów szkoleniowych. Jednozdaniowe decyzje per etap. Najnowsze na górze.

## Etapy 1–4 — Cztery zeszyty PDF (gotowe, do recenzji)

- **Wszystkie 4 zeszyty napisane jako Markdown → PDF A4** przez `tools/render-notebooks.mjs` (Chromium/Playwright) z własnym mini-konwerterem Markdown (brak biblioteki MD w repo). Jasny, czytelny motyw druku z akcentami brandu (Rajdhani + JetBrains Mono + Inter), okładka + ramki callout (checkpoint/prompt/warn/note).
- **Zeszyt 1** fundamenty (czat vs agent, Cowork vs Code, pętla pracy, słowniczek, koszty/bezpieczeństwo, FAQ). **Zeszyt 2** case study wyłącznie z `FAKTY.md` (headline „30 min w aucie", 5 zasad metody, „co poszło nie tak"). **Zeszyt 3** środowisko Windows 11 krok po kroku z punktami kontrolnymi i datą weryfikacji (D3). **Zeszyt 4** pierwsza aplikacja (lista zadań) z gotowymi promptami i komentarzem „dlaczego".
- **Uwaga autora wdrożona:** Zeszyt 4 mówi wprost, że Claude Code używamy jako **rozszerzenia VS Code**, a alternatywy to **CLI** (`claude`) lub **GitHub Copilot** — metoda i prompty identyczne.
- **Stopka PDF (uwaga autora):** na każdej stronie „Treść wygenerowana przez AI (Claude) · moderacja: Dariusz Tyszka" + tytuł zeszytu + numer strony.
- **Naprawiony błąd konwertera:** placeholder inline-code kolidował z liczbami w tekście („6 dni" → `<code>undefined</code>`); zmieniony na sentinel `@@C…@@`. Zweryfikowane podglądem PNG (liczby renderują się poprawnie).
- **Ograniczenie weryfikacji:** brak `poppler` → stopki PDF nie podejrzano wizualnie (podgląd PNG pokazuje treść strony, nie stopkę druku). Treść body zweryfikowana.
- **Do recenzji autora:** długość/ton zeszytów; wybór projektu w Zeszycie 4 (domyślnie lista zadań); brzmienie stopki.

## Etap 5 — Karuzela LinkedIn (gotowa, do recenzji)

- **10 slajdów 1080×1350 (4:5), render @2x** → PNG (post wielo-obrazkowy) + `karuzela.pdf` (post dokumentowy). Toolchain: `tools/slides.html` + `tools/render-slides.mjs` (Chromium/Playwright), deterministycznie — poprawka to edycja HTML i ponowny render.
- **Fonty Rajdhani + JetBrains Mono z Google Fonts** ładowane w czasie renderu; skrypt czeka na `document.fonts.ready` (bez tego pierwszy render łapał fallback). Zweryfikowane wizualnie: polskie znaki OK.
- **Headline = „30 minut w samochodzie"** (slajd 1) — najmocniejszy fakt z researchu; prowadzi całą narrację. Slajd 2 osadza realny zrzut produkcji w ramce HUD.
- **Fakty tylko z `FAKTY.md`** (D5): 71 commitów, 49 (Opus 4.8 1M) / 16 (Fable 5), 6 dni, v1→v4, „0 linii kodu ręcznie". Zero kosztów/godzin (pominięte przez autora).
- **Tekst posta w `karuzela/POST.md`**: po dwóch iteracjach z autorem — kontynuacja poprzedniego posta w tonie **praktycznej ciekawostki, nie szkolenia**. Autor odrzucił wersję „copywriterską" (za gładka, brzmiała jak AI) i pozycjonowanie edukacyjne („nie chcę nikogo uczyć"). Finalny tekst: luźny, naturalny, bez zapowiedzi pakietu; CTA = „prześledź commit po commicie, repo w komentarzu". Hashtagi spójne z poprzednim postem.
- **Slajdy 9–10 przerobione spójnie z tonem**: 9 „Twoja kolej / pakiet 4 zeszytów" → „Wszystko jawne / Prześledź to sam" (repo, SPEC.md, DECISIONS.md, podpisy modeli); 10 CTA „napisz po materiały" → „Zagraj z modelem / bez konta i bez danych". Pakiet zeszytów zostaje w repo jako produkt, ale post go nie sprzedaje. Alt-teksty 9–10 zaktualizowane. Zweryfikowane wizualnie (slajd 9).
- **Do recenzji autora:** brzmienie posta; czy publikować jako PNG-e czy PDF.

## Etap 0b — Toolchain + zrzuty (gotowe)

- **Zrzuty przez Playwright z produkcji** (`tools/capture-screens.mjs`): home, leaderboard, karta modelu — z danymi; muzeum i turing renderują się poprawnie, ale w pustym stanie (za mało partii na produkcji). Heatmapy brak (model ma 10 partii). Spisane w `zrzuty/README.md`.

## Etap 0 — Pakiet źródłowy (gotowy, zacommitowany 3e00a5e)

- `FAKTY.md`, `PYTANIA-DO-AUTORA.md`, `BRAND.md`, `zrodla/` (prompt startowy + research), `zrzuty/`, `README.md`. Wszystkie liczby policzone z gita; luki domknięte przez autora lub świadomie pominięte.
