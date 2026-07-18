# BRAND — styl dla slajdów LinkedIn i grafik w PDF-ach

> Wartości skopiowane 1:1 z kodu: paleta z [`scripts/gen/lib/prompt-kit.ts`](../../scripts/gen/lib/prompt-kit.ts) i tokeny z [`handoff/DESIGN.md`](../../handoff/DESIGN.md) (oba są zsynchronizowane z `apps/web/src/index.css`). Nie wymyślaj kolorów — używaj tylko tych.
> Kierunek: **Cyber-HUD / taktyczny overlay** — ciemny, kanciasty, z siatką w tle. „Czytelność ponad efekciarstwo".

---

## 1. Paleta (dokładne hexy)

| Rola | Hex | Użycie na slajdach |
|---|---|---|
| Tło strony | `#05070C` | główne tło każdego slajdu |
| Panel | `#080D18` | karty, bloki treści |
| Pole w panelu | `#060A14` | zagłębienia, ramki treści |
| **P1 · cyjan** | `#35E7FF` | akcent 1, „gracz 1", nagłówki-akcenty, ramki |
| **P2 · magenta** | `#FF3D9A` | akcent 2, „gracz 2", kontrast do cyjanu |
| **Edukacja · lime** | `#B6FF3C` | pozytyw, „to możesz zrobić Ty", CTA-akcent (oszczędnie) |
| Fiolet | `#A78BFA` | akcent uzupełniający |
| Danger | `#FF4D6A` | „co poszło nie tak", ostrzeżenia |
| Warn | `#FF8A3C` | uwagi |

**Tekst** (na tle `#05070C`, kontrasty z DESIGN.md):

| Rola | Hex | Kontrast | Użycie |
|---|---|---|---|
| Główny | `#DCE6F5` | — | treść, duże liczby |
| Muted | `#A4ADC7` | 9.00:1 | podtytuły |
| Dim | `#8590AD` | 6.32:1 | podpisy, metadane |
| Faint | `#6777A3` | 4.55:1 (AA) | najmniejszy dopuszczalny tekst — nie mniej |

Zasada duotonu: **cyjan vs magenta** to sygnatura marki (P1 vs P2). **Lime tylko jako akcent edukacyjny/pozytywny**, nigdy jako tło dużych obszarów. Zakaz ciepłych metali: żadnego złota, bursztynu, żółci, brązu (to najczęstszy dryf generatora — patrz `prompt-kit.ts`).

---

## 2. Typografia

- Nagłówki, chrome, przyciski, etykiety: **Rajdhani** (500/600/700), UPPERCASE dla nagłówków sekcji, `letter-spacing` ~0.1–0.14em.
- Dane, liczby, telemetria, kod, „terminalowe" napisy: **JetBrains Mono** (400/500/700). **Wszystkie liczby → mono.**
- Nagłówek sekcji w stylu HUD: prefiks `//` w mono + mała L-bracket, kolor dim, uppercase.
- Fonty są w projekcie self-hosted (`@fontsource`); do slajdów pobierz z Google Fonts (Rajdhani, JetBrains Mono) — licencja OFL, wolno.

---

## 3. Geometria i „urządzenia" HUD (do teł slajdów)

- **Zero zaokrągleń.** Rogi ścinane po skosie (clip-path), nie promień. Cięcie narożnika ~12 px.
- Sygnaturowe elementy: cienka **siatka techniczna** w cyjanie (ledwo widoczna), **L-kształtne nawiasy narożne**, pozioma **linia skanera**, delikatne **scanline'y**, miękka **neonowa poświata** wokół akcentów.
- Wektor energii: spokój/ciemność po jednej stronie → jasność/ruch/neon tam, gdzie „dzieje się akcja" (użyte w koncepcie hero LinkedIn — patrz historia `scripts/gen`).

---

## 4. Zasady tekstu na slajdach (D4)

- Slajd: **1080×1350 px (4:5)**. Bezpieczny margines ~64 px ze wszystkich stron.
- Min. rozmiar tekstu czytelny na telefonie: **≥ 28 pt** dla treści, nagłówek dużo większy.
- Maks. **~30 słów na slajd** — jedna myśl na slajd.
- Kontrast tekst/tło **≥ WCAG AA** (użyj kolorów tekstu z §1; nie schodź poniżej `#6777A3`).
- Jeden dominujący akcent na slajd (cyjan LUB magenta LUB lime) — nie trzy naraz.
- **Tekst renderowany w HTML/CSS, nie „wypalany" w generatorze obrazów** (D4: deterministyczne poprawki). Jeśli używasz tła z `scripts/gen` (Gemini) — służy tylko jako podkład, tekst zawsze na wierzchu w HTML.

---

## 5. Produkcja slajdów (rekomendacja techniczna dla Cowork)

1. Jeden szablon HTML (`slide.html`) + `slide.css` z tokenami z §1–§2; każdy slajd = sekcja z klasą wariantu (`--hook`, `--stat`, `--timeline`, `--cta`).
2. Render do PNG 1080×1350 (np. przez tryb podglądu przeglądarki / headless).
3. Złożenie 10 PNG w jeden PDF (post dokumentowy) — obok wersji 10× PNG (post wielo-obrazkowy).
4. Poprawka tekstu = edycja HTML + ponowny render (bez ryzyka „innej grafiki").

Nie bakuj tekstu w bitmapę na etapie generowania tła — inaczej każda literówka to nowa generacja.
