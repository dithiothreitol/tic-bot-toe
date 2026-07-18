# Zrzuty ekranu do materiałów

Łapane skryptem [`../tools/capture-screens.mjs`](../tools/capture-screens.mjs) (Playwright/Chromium) z produkcji [`ticbottoe.lol`](https://ticbottoe.lol), tryb ciemny, 1600×1000 @2x. Ponowne złapanie: `node docs/szkolenie/tools/capture-screens.mjs` (albo `ONLY=05,06 …` dla wybranych).

## Status (18.07.2026)

| Plik | Status | Uwaga |
|---|---|---|
| `01-home.png` | ✅ złapany | pełna strona; demo WebLLM statyczne (headless nie ma WebGPU — D8) |
| `03-leaderboard.png` | ✅ złapany | ranking z realnymi danymi |
| `04-karta-modelu.png` | ✅ złapany | radar „profil modelu" + przebieg Elo + bilans H2H. **Bez heatmapy** — model ma tylko 10 partii, a psychologia wymaga większej próby |
| `05-muzeum-wpadek.png` | ⚠️ pusty stan | strona renderuje się poprawnie, ale „Brak wpadek" — produkcja nie ma jeszcze złapanych nielegalnych ruchów |
| `06-turing.png` | ⚠️ pusty stan | strona OK, ale „Brak zagadek" — za mało partii człowiek vs model spełniających filtr |
| `02-rozgrywka.png` | ❌ brak | tok myślenia na żywo — wymaga partii z modelem (klucz OpenRouter, lokalny stack) |
| `07-replay.png` | ❌ brak | powtórka ze śladem — wymaga zapisanej partii z tokiem myślenia |
| `08-pojedynek-promptow.png` | ❌ brak | tryb lab — wymaga uruchomienia serii lokalnie |

## Żeby muzeum / turing / heatmapa miały treść

Produkcja jest świeża i ma mało partii. Aby te kadry pokazywały realne dane, potrzeba więcej rozegranych partii — np. przez **owner-only seeder rankingu** (commity `3c3a97b`, `2b0c4d7`; realne partie przez `submitResult`) lub po prostu grając. Do czasu zasilenia danymi materiały mogą użyć zrzutów „pusty stan" (uczciwie pokazują funkcję + jej opis) albo poczekać.

## Zasady
- Anonimizacja: patrz `../PYTANIA-DO-AUTORA.md` §5.3.
- Nazwy plików stałe — materiały odwołują się po nazwie.
