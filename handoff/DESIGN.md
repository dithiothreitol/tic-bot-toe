# DESIGN.md — LLM Game Arena · warstwa wizualna (Cyber-HUD / Tactical)

> Uzupełnienie do `SPEC.md` (sekcja 4 „Look & feel") i `PROMPT-claude-code.md`.
> **To jest źródło prawdy dla wyglądu.** Kod (shadcn/ui + Tailwind + Recharts) ma odtworzyć ten kierunek, nie domyślny wygląd bibliotek.
> Wizualna referencja: `handoff/screens/*.png` (6 ekranów).

---

## 1. Kierunek

Esportowy overlay / HUD taktyczny: kanciasty, ciemny, z siatką w tle, ściętymi narożnikami (clip-path), pulsującymi naroża-nawiasami i jadącymi skanerami na kluczowych panelach. Monospace do danych i telemetrii, kondensowany krój do chrome'u i nagłówków. Zero zaokrągleń „kart".

Zasada nadrzędna ze spec: **czytelność ponad efekciarstwo** — każdy wykres ma jedno zdanie „co z tego wynika", tap targets ≥ 44 px, mobile-first.

---

## 2. Tokeny → `apps/web/src/globals.css`

Zdefiniuj raz w warstwie tokenów, nadpisując zmienne shadcn. Nie stylizuj per komponent.

```css
@layer base {
  :root {
    /* powierzchnie */
    --background:   #05070C;                 /* tło + siatka HUD */
    --card:         #080D18;                 /* panele (kanciaste) */
    --card-inset:   #060A14;                 /* pola wewnątrz paneli (komórki, inputy) */
    --border:       rgba(53,231,255,.16);    /* ramka tech */
    --border-soft:  rgba(255,255,255,.10);   /* ramka neutralna */

    /* tekst */
    --foreground:   #DCE6F5;
    --muted-fg:     #A4ADC7;   /* 9.00:1  */
    --dim-fg:       #8590AD;   /* 6.32:1  */
    --faint-fg:     #6777A3;   /* 4.55:1 — AA; było #4B587C = 2.87:1 (za słabe na 10px) */

    /* akcenty */
    --p1:           #35E7FF;   /* Player_01 · cyjan */
    --p2:           #FF3D9A;   /* Player_02 · magenta */
    --accent-edu:   #B6FF3C;   /* moduł edukacyjny / pozytyw */
    --danger:       #FF4D6A;   /* spadek Elo, błąd */
    --warn:         #FF8A3C;   /* wysoki forfeit rate */

    /* typografia */
    --font-sans:    "Rajdhani", sans-serif;        /* chrome, nagłówki, przyciski */
    --font-mono:    "JetBrains Mono", monospace;   /* dane, telemetria, kod */

    /* geometria */
    --radius:       0;                              /* kanciaste; naroża = clip-path */
    --clip-cut:     polygon(12px 0, 100% 0, 100% calc(100% - 12px),
                    calc(100% - 12px) 100%, 0 100%, 0 12px);
    --clip-tab:     polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px);

    /* glow */
    --glow-p1:      0 0 22px rgba(53,231,255,.30);
    --glow-p2:      0 0 22px rgba(255,61,154,.30);
  }
}
```

Fonty (Google Fonts, w `index.html` lub `@import`):
`Rajdhani` (500/600/700) + `JetBrains Mono` (400/500/700).

Mapowanie na zmienne shadcn (HSL): ustaw `--background`, `--card`, `--popover` na `#05070C`/`#080D18`; `--primary` = cyjan `--p1`; `--ring` = cyjan; `--radius: 0`.

---

## 3. Komponent `<HudPanel>` (rdzeń wyglądu)

Większość paneli to `<HudPanel>`: tło `--card`, ramka `--border`, ostre rogi. Warianty:

- **`brackets`** — 4 naroża-nawiasy (L-kształty) w rogach; animacja `bracketPulse`. Używaj na panelach „hero" (plansza, karta wyniku, wyzwanie dnia, callout edukacyjny). Nie na każdym panelu — inaczej szum.
- **`scanner`** — pozioma linia cyjan przelatująca w pionie (`@keyframes scanH`), `box-shadow` glow. Tylko na aktywnych/„na żywo" panelach (plansza w trakcie, karta wyniku).
- **`cut`** — ścięty narożnik przez `clip-path: var(--clip-cut)` (przyciski, sloty graczy, avatar modelu).

```css
@keyframes scanH     { 0%{top:4%;opacity:0} 12%{opacity:1} 88%{opacity:1} 100%{top:96%;opacity:0} }
@keyframes bracketPulse { 0%,100%{opacity:.4} 50%{opacity:1} }
@keyframes gridDrift { 0%{background-position:0 0} 100%{background-position:46px 46px} }
@keyframes think     { 0%,100%{opacity:.35;transform:scale(.85)} 50%{opacity:1;transform:scale(1)} }
```

Siatka tła (globalny overlay `position:fixed; inset:0; pointer-events:none; z-index:0`):
```css
background-image:
  repeating-linear-gradient(90deg, rgba(53,231,255,.04) 0 1px, transparent 1px 46px),
  repeating-linear-gradient(0deg,  rgba(53,231,255,.04) 0 1px, transparent 1px 46px);
animation: gridDrift 9s linear infinite;
```
Dodatkowo dwie radialne poświaty (cyjan lewy-górny, magenta prawy-górny) na `<body>`/root.

Nagłówek sekcji: prefiks `//` w mono + mała L-bracket, kolor `--dim-fg`, `text-transform:uppercase`, `letter-spacing:.14em`.

Przyciski: `--font-sans` 700, uppercase, `letter-spacing:.1–.14em`, `clip-path: var(--clip-cut)`. Primary = outline cyjan + `box-shadow: inset 0 0 20px rgba(53,231,255,.2)`.

---

## 4. Mapa ekran → komponenty shadcn

Plansze (`Board3x3`, `BattleshipBoard`, `ShipPlacement`) = komponenty własne (nie shadcn). shadcn tylko na chrome. Wykresy = Recharts w `<Card>` ostylowanym tokenami.

| Ekran | Plik ref. | Komponenty |
|---|---|---|
| Ekran główny | `01-ekran-glowny.png` | `Card`, `Tabs` (gra/tryb), `Command` (wyszukiwarka modeli w ModelPicker), `Switch` (darmowe/komentator), `Badge` (`:free`), `Button` |
| Rozgrywka | `02-rozgrywka.png` | `Board3x3` (własny, warianty `brackets`+`scanner`), `Card` (log), `Sheet` (log na mobile), Recharts `BarChart` (oś czasu), `Skeleton` („model myśli" → kropki `think`) |
| Karta wyniku | `03-karta-wyniku.png` | `Dialog`/`Card` (`brackets`+`scanner`), `Badge` (ΔElo, kolor `--accent-edu`/`--danger`), `Button` (Zapisz/Analiza/Powtórka/Rewanż), `sonner` (toast „skopiowano link") |
| Rankingi | `04-rankingi.png` | `Table`, `Tabs` (mode/gra/intuicja), Recharts `ScatterChart` (koszt/Elo, oś X log), `Tooltip`, `Badge` (WebLLM) |
| Karta modelu | `05-karta-modelu.png` | Recharts `RadarChart` (5 osi) + `LineChart` (Elo), `Card`, `Badge`, `Accordion` („Jak czytać te liczby?") |
| Lab / statki | — | `Slider` (temperatura), `Textarea` (dopisek promptu), `BattleshipBoard` + `ShipPlacement` (własne) |
| Handoff (ten dok) | `06-handoff.png` | referencja tokenów i etapów |

---

## 5. Kolor per rola (trzymaj się sztywno)

- **Player_01 = cyjan `--p1`**, **Player_02 = magenta `--p2`** — wszędzie: znaczniki X/O, słupki osi czasu, sloty w pickerze, karty graczy, punkty scatter/radar. (Zgodne ze spec sekcja 4.)
- **Limonka `--accent-edu`** = moduł edukacyjny: komentator AI (dymki w logu), „co z tego wynika", „jak czytać te liczby?", precyzja/koszt pozytywny, wyzwanie dnia, badge „nie liczy się do rankingu".
- **`--warn`** = wysoki forfeit rate w tabeli; **`--danger`** = spadek Elo.
- Telemetria (czas/tokeny/koszt), Elo, wszystkie liczby → `--font-mono`.

---

## 6. Stany i mikrodynamika

- „Model myśli": 3 kropki w kolorze gracza, animacja `think` z opóźnieniami .2s/.4s.
- Komórka wygrywająca: tło + ramka cyjan + `inset` glow.
- Retry/forfeit w logu i na osi czasu: znacznik `⟲` w kolorze `--accent-edu`.
- Braki tokenów (WebLLM): renderuj `—`, nigdy `0` (kryterium akceptacji spec 20.1).
- Radar: stan pusty przy < 2 podmiotach („za mało danych — rozegraj partie"); osie normalizowane względem populacji rankingu (spec 9.3).

---

## 7. Czego pilnować (spójność z SPEC)

- UI po polsku (`i18n/pl.ts`); prompty do modeli po angielsku.
- Nie „upiększaj" domyślnym shadcn — kanciaste rogi + clip-path to sygnatura kierunku.
- Wszystkie twarde ograniczenia z `PROMPT-claude-code.md` (klucz tylko w localStorage, replay serwerowy, `lab` poza rankingiem, prompt statków tylko z `PlayerView`) obowiązują niezależnie od warstwy wizualnej.
