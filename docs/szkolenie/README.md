# Pakiet szkoleniowy — „Jak powstał tic-bot-toe"

Materiały produkuje **Claude Code bezpośrednio w tym repo** (decyzja D1): 4 zeszyty PDF + karuzela grafik na LinkedIn, dla osoby **bez doświadczenia z agentami kodującymi**. Plan całości: [`docs/PLAN-MATERIALY-SZKOLENIOWE.md`](../PLAN-MATERIALY-SZKOLENIOWE.md).

## Zawartość katalogu

| Element | Do czego |
|---|---|
| [`FAKTY.md`](./FAKTY.md) | Jedyne dozwolone źródło liczb, dat, cytatów i osi czasu (D5: zero konfabulacji) |
| [`PYTANIA-DO-AUTORA.md`](./PYTANIA-DO-AUTORA.md) | Luki, które musisz wypełnić, zanim ruszą Zeszyt 2 i slajdy |
| [`BRAND.md`](./BRAND.md) | Paleta, typografia i zasady stylu dla slajdów i PDF-ów |
| [`zrzuty/`](./zrzuty/) | Zrzuty ekranu (łapane skryptem z `ticbottoe.lol` — lista w środku) |
| `tools/` | Skrypty produkcji: capture zrzutów, render slajdów, złożenie PDF (powstają w Etapie 0b) |

## Łańcuch narzędzi (wszystko w Claude Code)

- **Zeszyty:** Markdown w tym katalogu → PDF przez Chromium (Playwright, już w repo).
- **Slajdy:** `slide.html` + `slide.css` (tokeny z `BRAND.md`) → 10× PNG 1080×1350 + PDF, render przez Chromium.
- **Tła (opcjonalnie):** pipeline `scripts/gen` (Gemini, klucz w `.env`) — tylko jako podkład, tekst zawsze w HTML.
- **Zrzuty:** Playwright z produkcji `ticbottoe.lol` (D8).

## Co po Twojej stronie

1. **Wypełnij [`PYTANIA-DO-AUTORA.md`](./PYTANIA-DO-AUTORA.md).** Puste odpowiedzi = wycięte wątki (D5), nie zmyślone.
2. **Recenzuj po każdym etapie.** Bramka wydania to „test nowicjusza" (D6): osoba bez doświadczenia przechodzi Zeszyty 3–4 i dochodzi do działającej mini-aplikacji.

## Zasady, których produkcja pilnuje

- **Fakty tylko z `FAKTY.md`** lub z Twoich odpowiedzi w `PYTANIA-DO-AUTORA.md`. Nic „z pamięci".
- **Materiały datowane** — case study opisuje stan na 18.07.2026 i mówi to wprost.
- **Język: polski** (wersja EN to osobna, przyszła inicjatywa — D7).
- **Bez sekretów i danych osobowych** poza tym, na co zezwolisz w `PYTANIA-DO-AUTORA.md` §5.

## Stan pakietu

Etap 0 (fakty, pytania, brand) wykonany przez Claude Code na gałęzi `feat/sudoku-scrabble`, 18.07.2026. Liczby w `FAKTY.md` policzone z `git log`. Kolejny krok: Etap 0b (toolchain + zrzuty).
