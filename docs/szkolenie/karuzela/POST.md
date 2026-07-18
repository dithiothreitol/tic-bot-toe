# Karuzela LinkedIn — tekst posta, alt-teksty, publikacja

Zawartość karuzeli: 10 slajdów PNG (`01.png`–`10.png`, 1080×1350 @2x) + `karuzela.pdf` (post dokumentowy).
Fakty zgodne z [`../FAKTY.md`](../FAKTY.md). Regeneracja: `node docs/szkolenie/tools/render-slides.mjs`.

## Jak opublikować

- **Wariant A — post wielo-obrazkowy:** dodaj 10 plików `01.png`…`10.png` w tej kolejności. LinkedIn dopuszcza do 20 grafik.
- **Wariant B — dokument (przewijana karuzela):** dodaj `karuzela.pdf` jako dokument.
- Alt-teksty (poniżej) wklej do każdej grafiki — dostępność + zasięg.

---

## Tekst posta — hook do wyboru

**Hook A (osobisty):**
> Zaprojektowałem działającą aplikację webową w **30 minut** — jako pasażer w samochodzie. Sześć dni później stała na produkcji. Całość kodu napisały agenty AI. 👇

**Hook B (prowokacja liczbami):**
> 71 commitów. 6 dni. **0 linii kodu** napisanych moją ręką. Oto jak z pomysłu na tylnym siedzeniu auta powstała działająca aplikacja webowa. 👇

## Tekst posta — treść

```
[HOOK]

Nie napisałem do niej ani jednej linijki kodu. Moja rola: pomysł, decyzje,
recenzja. Resztę zrobiły dwa narzędzia AI, każde w swojej roli:

• Claude Cowork — koncepcja. W jednej rozmowie (tej z auta) powstała pełna
  specyfikacja: od kółka i krzyżyk, przez rankingi i statki, po własny VPS
  i moduł edukacyjny. Analiza konkurencji w pakiecie.

• Claude Code — realizacja. Agent w edytorze, który sam czyta, pisze, testuje
  i commituje kod w repozytorium.

Co z tego wyszło? tic-bot-toe (ticbottoe.lol) — arena, w której modele
językowe grają w 4 gry logiczne przeciw sobie i ludziom, z rankingami Elo,
podglądem „toku myślenia" modeli i muzeum ich wpadek.

Dlaczego to zadziałało — i to jest właściwa lekcja, nie sam wynik:

1. Specyfikacja jako źródło prawdy (jeden dokument, napisany raz, z góry).
2. Praca etapami z „definicją ukończenia" i testami zielonymi po każdym etapie.
3. Dziennik decyzji zamiast zasypywania mnie pytaniami o drobiazgi.
4. Osobny krok: code-review.

Ciekawostka: model odradził mi budowę pełnego zakresu („zrób MVP i sprawdź,
czy ktoś w to zagra"). Poszedłem szerzej — 4 gry zamiast 2. Świadomie.

Przygotowuję pakiet, który przeprowadza przez to od zera — łącznie z
postawieniem środowiska i zbudowaniem PIERWSZEJ własnej aplikacji, nawet bez
wcześniejszego kontaktu z agentami kodującymi.

Chcesz materiały? Napisz w komentarzu.

Arena na żywo: ticbottoe.lol
```

## Hashtagi

`#AI #ClaudeCode #Anthropic #AgentyAI #SztucznaInteligencja #WebDev #Programowanie #BudowanieZAI`

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
