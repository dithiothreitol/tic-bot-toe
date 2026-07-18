# PLAN: Materiały szkoleniowe — „Jak powstał tic-bot-toe" (PDF + karuzela LinkedIn)

> Dokument dla **Claude Code** (produkcja w całości w repo). Samowystarczalny — razem z pakietem źródłowym z Etapu 0 zawiera wszystko, czego potrzeba do produkcji materiałów.
> Cel: pakiet szkoleniowy (4 zeszyty PDF + karuzela grafik na jeden post LinkedIn), który osobie **bez żadnego doświadczenia z agentami kodującymi** opowiada, jak powstała ta aplikacja, a następnie prowadzi ją za rękę: od przygotowania środowiska po powtórzenie procesu i zbudowanie **pierwszej własnej aplikacji**.
> Realizuj etapami (sekcja 7). Po każdym etapie recenzja właściciela — nie przechodź dalej bez akceptacji. Konwencja: fakty tylko z pakietu źródłowego; czego nie ma w źródłach, tego nie zmyślamy (sekcja 5, D5).
> **Łańcuch narzędzi (D1/D4/D8):** zeszyty Markdown → PDF przez Chromium (Playwright, już w repo); slajdy HTML/CSS → PNG/PDF przez Chromium; tła opcjonalnie z pipeline'u `scripts/gen` (Gemini, klucz w `.env`); zrzuty ekranu przez Playwright z produkcji.

---

## 1. Odbiorca i efekt końcowy

**Persona:** osoba techniczna lub półtechniczna (np. programista bez doświadczenia z AI, PM, student), która nigdy nie pracowała z agentem kodującym. Nie zna pojęć „kontekst", „tokeny", „BYOK". Ma komputer z Windows i konto e-mail. Nic więcej nie zakładamy.

**Efekt końcowy — czytelnik po przejściu materiałów:**
1. rozumie, czym jest agent kodujący i jak wygląda praca z nim (pętla: brief → plan → implementacja → weryfikacja),
2. zna prawdziwą historię powstania tic-bot-toe: kto (który model i które narzędzie) odpowiadał za koncepcję, kto za realizację, ile to trwało i jak wyglądały kolejne kroki,
3. samodzielnie przygotował środowisko (konta + instalacje) i **zbudował z agentem pierwszą działającą mini-aplikację**, powtarzając tę samą metodę w miniaturze.

**Kryterium sukcesu całości („test nowicjusza"):** osoba spełniająca personę, mając wyłącznie PDFy, dochodzi do działającej mini-aplikacji bez pomocy zewnętrznej. To bramka jakości Etapu 6.

---

## 2. Fakty źródłowe (historia projektu — do wykorzystania w case study)

Zweryfikowane w repozytorium (git, `SPEC.md`, `DECISIONS.md`, `docs/PLAN-*.md`). Pełne, cytowalne wersje trafią do `FAKTY.md` w pakiecie źródłowym (Etap 0).

### 2.1 Droga od koncepcji do produkcji

| Faza | Kiedy | Narzędzie / model | Co powstało |
|---|---|---|---|
| **Research + koncepcja** | przed 12.07.2026 | **Claude Cowork** (szczegóły przebiegu uzupełni właściciel — Etap 0, `PYTANIA-DO-AUTORA.md`) | analiza pomysłu, pozycjonowanie (czym arena różni się od LMArena/benchmarków), iteracje specyfikacji **v1→v4** |
| **Specyfikacja** | przed 12.07.2026 | Claude Cowork → dokument `SPEC.md` v4 | samowystarczalny dokument pisany wprost „dla Claude Code (model Opus 4.8)": cel, stack, model kosztowy, bezpieczeństwo, **19 sekcji, realizacja etapami** |
| **Rdzeń aplikacji** | **12.07.2026 (jeden dzień)** | **Claude Code + Opus 4.8 (1M context)** | etapy 1–8 (monorepo, silniki gier, providery LLM, backend, rankingi Elo, deploy) + warstwa wizualna Cyber-HUD + moduły 9–12 (wykresy, analiza, powtórki, tożsamość) — 14 commitów |
| **Hardening + start produkcji** | 13–14.07.2026 | Claude Code + Opus 4.8 (1M) | poprawki bezpieczeństwa, a11y (WCAG AA), e2e w prawdziwej przeglądarce, wersja EN, **deploy na VPS → ticbottoe.lol**, trener AI (Gemini) |
| **Sudoku + Scrabble** | 16–17.07.2026 | Claude Code + Opus 4.8 (1M), wg briefu `docs/PLAN-SUDOKU-SCRABBLE.md` | dwie nowe gry: silniki, UI, słowniki DAWG, integracja serwera, deploy (Etapy 0–8) |
| **„Efekt WOW"** | 17–18.07.2026 | **Claude Code + Claude Fable 5**, wg briefu `docs/PLAN-EFEKT-WOW.md` | 6 modułów: tok myślenia modeli, ranking halucynacji + Muzeum wpadek, psychologia modeli (heatmapy), tryb Turinga, demo WebLLM na home, pojedynek promptów (Etapy 0–10) |

### 2.2 Liczby (stan na 18.07.2026)

- **70 commitów w 6 dni kalendarzowych** (12–18.07.2026); rdzeń grywalny w 1 dzień, produkcja publiczna po 2 dniach.
- Cały kod napisały agenty: **49 commitów** z Opus 4.8 (1M context), **6** z Opus 4.8, **15** z Claude Fable 5 (trailery `Co-Authored-By` w git). Rola człowieka: koncepcja, briefy, recenzje, decyzje, weryfikacja na żywo.
- 4 gry, 2 tryby (LLM vs LLM, człowiek vs LLM), rankingi Elo walidowane replayem po stronie serwera, 2 języki, produkcja: [ticbottoe.lol](https://ticbottoe.lol).

### 2.3 Metoda pracy (to jest właściwy przedmiot szkolenia)

1. **SPEC jako źródło prawdy** — samowystarczalny dokument wymagań, pisany pod konkretny model, z podziałem na etapy i jawnymi NIE-celami.
2. **Briefy per inicjatywa** (`docs/PLAN-*.md`) — każdy większy pakiet prac dostaje osobny plan z kontekstem zweryfikowanym w kodzie, decyzjami podjętymi Z GÓRY („nie renegocjuj w trakcie"), etapami i DoD.
3. **`DECISIONS.md` jako dziennik decyzji** — jednozdaniowe decyzje tam, gdzie SPEC nie rozstrzyga; rozjazdy względem planu jawnie odnotowane z powodem (wzorzec: „rozjazd względem §X, powód, świadomy trade-off").
4. **Etapowe commity z bramkami** — po każdym etapie `pnpm test` + `pnpm typecheck` zielone; konwencja `feat(zakres): opis (Etap N)`.
5. **Code-review jako osobny krok** — commity „poprawki z code-review" po większych etapach.
6. **Weryfikacja na żywo, nie tylko testami** — e2e Playwright na prawdziwej przeglądarce i prawdziwym modelu; funkcje sprawdzane na darmowych modelach OpenRoutera przed uznaniem za gotowe.

### 2.4 Narzędzia i stack (do słowniczka i zeszytu o środowisku)

- **Narzędzia agentowe:** Claude Cowork (research/koncepcja/dokumenty), Claude Code w VS Code (implementacja); modele: Opus 4.8 (1M context), Claude Fable 5.
- **Stack aplikacji:** pnpm monorepo · Vite + React + TypeScript + Tailwind + shadcn/ui + Zustand · Node 22 + Hono · Drizzle + PostgreSQL · WebLLM (WebGPU) · OpenRouter (BYOK) · opcjonalnie Ollama · Cloudflare Turnstile · vitest + testcontainers + Playwright · Docker/compose + Caddy + systemd na VPS.
- **Grafiki:** własny pipeline `scripts/gen` (Gemini, REST) z kitem promptów Cyber-HUD i paletą brandu; zasada „tekst nigdy w grafice" (dla materiałów szkoleniowych świadomie uchylona — D4).
- **Model kosztowy:** właściciel nie płaci za inferencję graczy (BYOK / WebLLM lokalnie w przeglądarce) — dobry przykład decyzji architektonicznej podjętej na etapie koncepcji.

---

## 3. Struktura pakietu szkoleniowego

Cztery zeszyty PDF (A4 pion, po polsku) + karuzela LinkedIn. Każdy zeszyt zamknięty w sobie, z własnym „czego się nauczysz" i podsumowaniem.

### Zeszyt 1 — „Agenci kodujący od zera" (~10–14 stron)

Fundamenty dla nowicjusza: czym jest LLM, czym agent kodujący różni się od czatu; pojęcia (kontekst, tokeny, prompt/brief, BYOK, halucynacja); czym różnią się **Claude Cowork** (research, dokumenty, praca na plikach) i **Claude Code** (praca w repozytorium: czyta, edytuje, uruchamia, testuje, commituje); jak wygląda pętla pracy z agentem i **gdzie jest miejsce człowieka** (decyzje, recenzja, weryfikacja); bezpieczeństwo i koszty (klucze API jako hasła, skąd się biorą opłaty, jak zaczać za darmo); słowniczek + FAQ.

### Zeszyt 2 — „Case study: tic-bot-toe w 6 dni" (~14–18 stron)

Narracyjna historia z sekcji 2, opowiedziana dla laika: od pomysłu i researchu w Cowork, przez SPEC v4, jeden dzień budowy rdzenia, deploy na VPS, po moduły WOW. Oś czasu (grafika), podział ról ludzi/modeli, **artefakty metody z prawdziwymi fragmentami** (kawałek SPEC, wpis z DECISIONS, komunikaty commitów), zrzuty ekranu aplikacji, liczby, oraz sekcja „co poszło nie tak i jak to naprawiano" (poprawki z code-review, wpadki bezpieczeństwa łatane wcześnie, świadome odkładanie funkcji — np. streaming SSE). Puenta: to metoda jest przenośna, nie kod.

### Zeszyt 3 — „Przygotuj środowisko krok po kroku" (~12–16 stron)

Wyłącznie instrukcje wykonawcze, checklisty i zrzuty ekranu; **Windows 11 jako środowisko główne** (D3), uwagi dla macOS w ramkach. Kolejno: konta (GitHub, Claude/Anthropic; OpenRouter jako opcja), instalacje (VS Code, Git, Node 22 LTS, pnpm, opcjonalnie Docker Desktop), instalacja i pierwsze uruchomienie **Claude Code** (rozszerzenie VS Code + logowanie), test „czy działa" (agent odpowiada, czyta plik, tworzy plik), higiena: czego nie wklejać do agenta, jak trzymać klucze w `.env`. Każdy krok z punktem kontrolnym „powinieneś teraz widzieć…".

### Zeszyt 4 — „Twoja pierwsza aplikacja z agentem" (~14–18 stron)

Powtórzenie metody z Zeszytu 2 **w miniaturze**, na projekcie osiągalnym w jedno popołudnie (proponowany: prosta gra webowa lub lista zadań z zapisem lokalnym — jedna technologia, zero backendu). Struktura rozdziałów = kroki metody:
1. Research i koncepcja w Cowork (gotowy prompt do skopiowania → wynik: mini-SPEC, 1 strona),
2. Plan etapowy z DoD (gotowy prompt → wynik: PLAN z 3–4 etapami),
3. Realizacja w Claude Code etap po etapie (gotowe prompty; zasada: nie przechodź dalej, póki etap nie działa),
4. Weryfikacja (uruchom, przeklikaj, poproś agenta o poprawki — wzorzec „code-review"),
5. (Opcjonalnie) publikacja + pomysły na rozbudowę.
Wszystkie prompty w ramkach „skopiuj mnie", z komentarzem, DLACZEGO są tak sformułowane (nawiązanie do reguł z SPEC/PLAN-ów tic-bot-toe).

### Karuzela LinkedIn — grafiki do jednego posta

Szczegóły w sekcji 4 (D4). Wchodzi w skład pakietu razem z gotowym tekstem posta.

---

## 4. Karuzela LinkedIn (grafiki, jeden post)

**Format:** 10 slajdów **1080×1350 px (4:5)** — bezpiecznie poniżej limitu LinkedIn (do 20 grafik w poście multi-image), a w praktyce górna granica uwagi odbiorcy. Dostarczane podwójnie: (a) 10 × PNG do posta wielo-obrazkowego, (b) jeden PDF z tych samych slajdów do posta dokumentowego („karuzela" z przewijaniem) — właściciel wybierze format publikacji.

**Produkcja (D4):** slajdy powstają **deterministycznie: HTML/CSS → Chromium (Playwright) → PNG** (bez API graficznego dla tekstu; powtarzalne poprawki = edycja HTML + ponowny render). Styl: ciemne tło Cyber-HUD spójne z aplikacją — paleta i typografia z `BRAND.md` w pakiecie źródłowym (tło `#05070C`, panel `#080D18`, cyjan P1 `#35E7FF`, magenta P2 `#FF3D9A`, lime `#B6FF3C` jako akcent edukacyjny; fonty Rajdhani + JetBrains Mono). W odróżnieniu od zasady app-assets **tekst JEST na slajdach** — to nośnik treści; minimum 28 pt, maks. ~30 słów na slajd, kontrast ≥ WCAG AA. Opcjonalnie tła ilustracyjne z istniejącego pipeline'u `scripts/gen` (Gemini) — tylko jako podkład, tekst zawsze nakładany w HTML.

**Narracja (slajd po slajdzie):**

| # | Slajd | Treść |
|---|---|---|
| 1 | Hook | „Działająca aplikacja webowa w 6 dni. 70 commitów. Cały kod napisały agenty AI." |
| 2 | Co powstało | ticbottoe.lol — arena 4 gier, w której LLM-y grają przeciw sobie i ludziom (zrzut ekranu) |
| 3 | Narzędzia | Claude Cowork (research + koncepcja) → Claude Code w VS Code (realizacja) |
| 4 | Podział ról | Koncepcja: iteracje SPEC v1→v4 w Cowork · Realizacja: Opus 4.8 (1M) — rdzeń w 1 dzień · Fable 5 — moduły WOW |
| 5 | Metoda | SPEC → plan etapowy z DoD → dziennik decyzji → testy po każdym etapie → code-review |
| 6 | Oś czasu | 12.07 rdzeń · 13.07 produkcja live · 16–17.07 dwie nowe gry · 17–18.07 sześć modułów WOW |
| 7 | Rola człowieka | decyzje, briefy, recenzja, weryfikacja na żywo — nie pisanie kodu |
| 8 | Lekcje | co się nie udało od razu i jak metoda to wyłapała (code-review, świadome odkładanie funkcji) |
| 9 | Też tak możesz | zapowiedź pakietu: 4 zeszyty od zera do pierwszej własnej aplikacji |
| 10 | CTA | gdzie znaleźć materiały + link do ticbottoe.lol |

**Do kompletu:** tekst posta (2 warianty hooka do wyboru), alt-teksty wszystkich grafik (dostępność), hashtagi.

---

## 5. Decyzje projektowe (podjęte — nie renegocjuj w trakcie)

1. **D1 — produkcja w całości w Claude Code, w repo.** Materiały końcowe (PDF-y, slajdy, zrzuty) wytwarza Claude Code bezpośrednio w repozytorium: zeszyty jako Markdown → PDF, slajdy jako HTML/CSS → PNG/PDF, zrzuty przez Playwright. Źródłem faktów jest **żywy** `docs/szkolenie/FAKTY.md` podpięty do gita — zero przenoszenia do innego narzędzia, zero ryzyka rozjazdu faktów. (Poprzedni wariant — produkcja w Claude Cowork z wgranego pakietu — odrzucony: dokładał kruchą pętlę „zamroź → wgraj → pobierz" i odcinał od pipeline'u grafik oraz gita.)
2. **D2 — cztery zeszyty zamiast jednego tomu.** Odbiorca-nowicjusz porzuca 60-stronicowe PDFy; zeszyty można czytać (i aktualizować) niezależnie. Kolejność czytania: 1→2→3→4, ale 3 i 4 działają samodzielnie jako „warsztat".
3. **D3 — instrukcje środowiska pod Windows 11, wersje przypięte, data ważności.** Persona pracuje na Windows (jak autor projektu). Każda instrukcja instalacyjna podaje wersję, z którą była testowana, i datę weryfikacji; strona 2 każdego zeszytu ma pole „zweryfikowano dnia". To ogranicza główne ryzyko starzenia się materiałów.
4. **D4 — slajdy: HTML→PNG, tekst na grafice, 10 sztuk, 4:5.** Deterministyczna produkcja (poprawki tekstu bez loterii generatora obrazów); styl Cyber-HUD z `BRAND.md`; 10 slajdów mieści się w limicie LinkedIn (20) z zapasem i trzyma uwagę. Generatory Gemini z `scripts/gen` wolno użyć tylko do teł.
5. **D5 — zero konfabulacji w case study.** Każda liczba, cytat i data w Zeszycie 2 i na slajdach musi mieć źródło w `FAKTY.md`. Luki (przebieg researchu w Cowork, prompt startowy, koszty, czas pracy człowieka) uzupełnia wyłącznie właściciel przez `PYTANIA-DO-AUTORA.md`; bez odpowiedzi dana informacja **wypada z materiałów** zamiast być dopowiedziana.
6. **D6 — test nowicjusza jako bramka wydania.** Przed finalizacją (Etap 6) Zeszyty 3–4 przechodzi osoba spełniająca personę (lub właściciel na czystym profilu użytkownika/maszynie wirtualnej). Każde potknięcie = poprawka w materiale, nie „doustne" wyjaśnienie.
7. **D7 — język PL w v1.** Wersja EN całego pakietu to osobna, przyszła inicjatywa (odnotować w backlogu, nie robić „przy okazji").
8. **D8 — zrzuty ekranu robi Claude Code przez Playwright.** Publiczne strony (home, leaderboard, muzeum wpadek, turing, karta modelu z heatmapą) łapane bezpośrednio z produkcji `ticbottoe.lol`. Funkcje wymagające żywej partii z modelem (tok myślenia na żywo, replay ze śladem) — z lokalnego stacka z kluczem OpenRouter LUB oznaczone jako „do dorobienia ręcznie" (DoD Etapu 0 dopuszcza brak części kadrów, jeśli produkcja ich nie pokazuje bez interakcji). Demo WebLLM na home nie wystartuje w headless (brak WebGPU) — łapiemy stan statyczny karty. Skrypt capture commitowany (`docs/szkolenie/tools/`) — regenerowalny.

---

## 6. Pakiet źródłowy (Etap 0 — gotowy)

Katalog `docs/szkolenie/` (commitowany; bez sekretów, bez danych osobowych). To **working set** produkcji, nie wsad do wgrania gdzie indziej:

| Plik | Zawartość |
|---|---|
| `FAKTY.md` | Oś czasu per dzień z hashami commitów; liczby (71 commitów, podział per model z trailerów); tabela ról; stack; opis metody z linkami do plików (`SPEC.md`, `DECISIONS.md`, `docs/PLAN-*.md`); 8 cytowalnych fragmentów |
| `PYTANIA-DO-AUTORA.md` | Luki do uzupełnienia przez właściciela: research w Cowork, prompt startowy / „reguła 5", czas i koszty, lekcje, zgody — z miejscem na odpowiedzi |
| `BRAND.md` | Paleta (dokładne hexy z `scripts/gen/lib/prompt-kit.ts` + `handoff/DESIGN.md`), typografia (Rajdhani + JetBrains Mono), zasady stylu Cyber-HUD dla slajdów, zasady tekstu na slajdach |
| `zrzuty/` | Zrzuty łapane przez Playwright z `ticbottoe.lol` (D8); lista kontrolna + skrypt capture w `tools/` |
| `tools/` | Skrypty produkcji (capture zrzutów, render slajdów HTML→PNG, złożenie PDF) — commitowane, regenerowalne |
| `README.md` | Instrukcja dla właściciela: co wypełnić + jak uruchomić produkcję etapami |

---

## 7. Etapy realizacji

Po każdym etapie: recenzja właściciela, poprawki, akceptacja. Claude Code utrzymuje `docs/szkolenie/POSTEP.md` (odpowiednik DECISIONS — jednozdaniowe decyzje redakcyjne per etap). Wszystkie etapy realizuje **Claude Code w repo**.

| Etap | Zakres | DoD |
|---|---|---|
| **0. Pakiet źródłowy** ✅ | `docs/szkolenie/` wg sekcji 6 | komplet plików; każda liczba w `FAKTY.md` policzalna z git/repo; pytania bez odpowiedzi jawnie oznaczone |
| **0b. Toolchain + zrzuty** | skrypty w `tools/`: capture (Playwright→PNG z prod), szablon slajdu, render, złożenie PDF | zrzuty publicznych stron w `zrzuty/`; render próbnego slajdu i próbnego PDF działa |
| **1. Zeszyt 1** | fundamenty + słowniczek + FAQ | Markdown → recenzja → **PDF**; definicje zrozumiałe bez wiedzy wstępnej (bez odwołań w przód) |
| **2. Zeszyt 2** | case study | każda liczba/data/cytat ma źródło w `FAKTY.md` (D5); oś czasu jako grafika; PDF po recenzji |
| **3. Zeszyt 3** | środowisko krok po kroku | checklisty z punktami kontrolnymi; wersje + data weryfikacji (D3); PDF po recenzji |
| **4. Zeszyt 4** | pierwsza aplikacja — przepis + prompty | wszystkie prompty przetestowane (dają wynik zdatny do kolejnego kroku); mini-projekt wykonalny w ≤4 h; PDF po recenzji |
| **5. Karuzela LinkedIn** | 10 slajdów PNG 1080×1350 + PDF + tekst posta (2 hooki) + alt-teksty | zgodność z D4 (styl, limity tekstu, kontrast AA); fakty zgodne z `FAKTY.md`; akceptacja właściciela |
| **6. QA i wydanie** | test nowicjusza (D6), spójność pojęć między zeszytami, numeracja wersji | uwagi z testu wprowadzone; pakiet `v1.0` (4 PDF + 10 PNG + PDF-karuzela + tekst posta) w jednym ZIP |

---

## 8. Ryzyka i mitigacje

1. **Instrukcje instalacyjne się starzeją** → D3 (wersje + daty), plus rozdział „gdy coś wygląda inaczej" uczący czytać komunikaty i pytać agenta.
2. **Nowicjusz utknie na kroku oczywistym dla autora** (git? terminal? PATH?) → test nowicjusza (D6) jako twarda bramka; Zeszyt 3 pisany od zera, bez „oczywiście".
3. **Konfabulacja historii** (czego repo nie zapisało — research w Cowork, koszty) → D5: tylko `FAKTY.md` + odpowiedzi właściciela; brak odpowiedzi = brak wątku.
4. **Slajdy nieczytelne na telefonie** (tam czyta LinkedIn) → limity D4 (≥28 pt, ≤30 słów), przegląd każdego slajdu w skali ~30% przed akceptacją.
5. **Koszty czytelnika** — obawa „AI = drogo" blokuje pierwsze kroki → Zeszyt 1 i 4 jawnie prowadzą ścieżką minimalnego kosztu (subskrypcja Claude zamiast API tam, gdzie się da; darmowe modele OpenRoutera; WebLLM lokalnie za darmo).
6. **Rozjazd materiałów z aplikacją** (projekt żyje) → materiały datowane, case study opisuje stan na 18.07.2026 i mówi to wprost; aktualizacje = nowa wersja pakietu, nie ciche edycje.

---

## 9. Backlog (świadomie poza v1)

- Wersja EN pakietu (D7).
- Wideo/screencast „pierwsza sesja z Claude Code" jako uzupełnienie Zeszytu 3.
- Druga karuzela LinkedIn stricte o metodzie (SPEC/PLAN/DECISIONS) dla odbiorców technicznych.
- Zeszyt 5 „od mini-aplikacji do produkcji" (Docker, VPS, domena) — dziś tylko wzmianka w Zeszycie 4.
