# Karuzela LinkedIn — tekst posta, alt-teksty, publikacja

Zawartość karuzeli: 10 slajdów PNG (`01.png`–`10.png`, 1080×1350 @2x) + `karuzela.pdf` (post dokumentowy).
Fakty zgodne z [`../FAKTY.md`](../FAKTY.md). Regeneracja: `node docs/szkolenie/tools/render-slides.mjs`.

## Jak opublikować

- **Wariant A — post wielo-obrazkowy:** dodaj 10 plików `01.png`…`10.png` w tej kolejności. LinkedIn dopuszcza do 20 grafik.
- **Wariant B — dokument (przewijana karuzela):** dodaj `karuzela.pdf` jako dokument.
- Alt-teksty (poniżej) wklej do każdej grafiki — dostępność + zasięg.

---

## Tekst posta

> **Kontynuacja poprzedniego posta** („W nauce o AI wygrywa praktyka…", premiera tic-bot-toe). Ten post świadomie NIE powtarza opisu aplikacji ani listy „czego uczy gra" — nawiązuje do tamtej tezy i opowiada, JAK aplikacja powstała. Styl: osobisty, sceptyczno-szczery, z nawiasowym przymrużeniem oka — jak w oryginale.

```
Ostatnio pokazałem Wam tic-bot-toe (ticbottoe.lol) — arenę, na której modele
językowe grają w kółko i krzyżyk oraz w statki. Pisałem wtedy, że w nauce
o AI wygrywa praktyka. Dziś druga część tej historii, bo najciekawsze nie
jest to, CO powstało, tylko JAK.

Uprzedzę pytanie: nie napisałem ani jednej linii kodu.

Cała koncepcja powstała w jakieś 30 minut. W samochodzie. Jako pasażer
(podkreślam, bo bezpieczeństwo ;)). Jedna rozmowa z Claude w telefonie:
od „chcę arenę, w której modele grają przeciw sobie, i nie chcę płacić
za cudze partie", przez analizę czy ktoś już to zrobił (nie w tej
kombinacji), po gotową specyfikację i prompt startowy dla agenta.

Potem wkroczył Claude Code — agent, który pracuje wprost w repozytorium:
czyta pliki, pisze kod, uruchamia testy, commituje. Sześć dni później
aplikacja stała na produkcji. 71 commitów, każdy podpisany przez model,
żaden przeze mnie.

Moja rola? Ta sama, co architekta na budowie: decyzje, briefy, recenzja
i sprawdzanie na własne oczy. I tu ukryta jest właściwa lekcja — bo bez
metody ten eksperyment kończy się kupą niedziałającego kodu:

- Specyfikacja napisana RAZ, z góry — i ani razu nie zmieniana w trakcie.
- Praca etapami: testy zielone po każdym etapie, inaczej ani kroku dalej.
- Dziennik decyzji zamiast zasypywania mnie pytaniami o drobiazgi.
- Code-review jako osobny krok (tak, agent recenzował agenta).
- Weryfikacja na żywo — bo raz testy „przechodziły", a reguła w kodzie
  po cichu odrzucała uczciwe, szybkie modele. Wyszło dopiero po pomiarze.

Smaczek na koniec: w rozmowie koncepcyjnej model ODRADZAŁ mi pełny zakres.
„Zbuduj MVP, wypuść, sprawdź, czy ktoś rozegra 20 partii". Poszedłem
szerzej — 4 gry zamiast 2 i sześć dodatkowych modułów. Świadomie. Agent
doradza, człowiek decyduje — i dobrze, żeby tak zostało.

Sceptycyzm wobec szkoleń z poprzedniego posta obowiązuje nadal, więc
zamiast „programu rozwojowego" przygotowałem coś praktycznego: pakiet
materiałów, który prowadzi od zera — bez wcześniejszego kontaktu
z agentami — przez postawienie środowiska aż po zbudowanie PIERWSZEJ
własnej aplikacji tą samą metodą. Całość w karuzeli poniżej, a po
materiały napisz w komentarzu.

https://ticbottoe.lol
```

## Hashtagi

`#AI #LLM #EdukacjaAI #ClaudeCode #AgentyAI #PromptEngineering`

> Dobrane tak, by nakładały się z poprzednim postem (`#AI #LLM #EdukacjaAI #PromptEngineering`) i dokładały dwa nowe, tematyczne (`#ClaudeCode #AgentyAI`) — algorytm LinkedIn lubi ciągłość serii.

---

## Alt-teksty (dostępność) — po jednym na slajd

1. **01.png** — Slajd tytułowy na ciemnym tle HUD. Napis „30 minut w samochodzie" i podpis: tyle trwało zaprojektowanie aplikacji, którą agent AI zbudował w 6 dni, 71 commitów, zero kodu pisanego ręcznie.
2. **02.png** — Slajd „Co powstało: tic-bot-toe" ze zrzutem ekranu aplikacji: ekran konfiguracji pojedynku, wybór gry (kółko i krzyżyk, statki, Sudoku Duel, słowna bitwa) i trybu.
3. **03.png** — Slajd „Dwa narzędzia, dwie role": Claude Cowork = koncepcja (research, specyfikacja), Claude Code = realizacja (kod w repozytorium).
4. **04.png** — Slajd „Koncepcja, ~30 min": specyfikacja rosła w rozmowie od wersji v1 (kółko i krzyżyk) do v4 (telemetria i moduł edukacyjny); cała rozmowa z telefonu, jako pasażer w aucie.
5. **05.png** — Slajd „Kod napisały agenty": 49 commitów od Opus 4.8 (1M) — rdzeń w jeden dzień; 16 commitów od Claude Fable 5 — sześć modułów; człowiek 0 linii kodu.
6. **06.png** — Slajd „Metoda": SPEC jako źródło prawdy, plan etapowy z definicją ukończenia, DECISIONS.md zamiast pytań, testy zielone po każdym etapie, osobny krok code-review.
7. **07.png** — Slajd „6 dni, oś czasu": 12.07 rdzeń grywalny, 13.07 produkcja na żywo, 16–17.07 dwie nowe gry, 17–18.07 sześć modułów WOW.
8. **08.png** — Slajd „Gdzie jest człowiek": nie pisze kodu, tylko prowadzi — decyzje, briefy, recenzja, weryfikacja; model doradzał MVP, człowiek świadomie poszedł szerzej.
9. **09.png** — Slajd „Twoja kolej": zapowiedź pakietu 4 zeszytów prowadzącego od podstaw agentów po pierwszą własną aplikację.
10. **10.png** — Slajd końcowy „Zobacz arenę. Zbuduj swoją." z adresem ticbottoe.lol i zachętą do napisania po materiały.
