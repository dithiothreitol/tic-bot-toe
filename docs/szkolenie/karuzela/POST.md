# Karuzela LinkedIn — tekst posta, alt-teksty, publikacja

Zawartość karuzeli: 10 slajdów PNG (`01.png`–`10.png`, 1080×1350 @2x) + `karuzela.pdf` (post dokumentowy).
Fakty zgodne z [`../FAKTY.md`](../FAKTY.md). Regeneracja: `node docs/szkolenie/tools/render-slides.mjs`.

## Jak opublikować

- **Wariant A — post wielo-obrazkowy:** dodaj 10 plików `01.png`…`10.png` w tej kolejności. LinkedIn dopuszcza do 20 grafik.
- **Wariant B — dokument (przewijana karuzela):** dodaj `karuzela.pdf` jako dokument.
- Alt-teksty (poniżej) wklej do każdej grafiki — dostępność + zasięg.

---

## Tekst posta

> **Kontynuacja poprzedniego posta** (premiera tic-bot-toe). Ton: praktyczna ciekawostka, nie szkolenie — autor niczego nie „uczy", po prostu opowiada, jak to powstało. Styl naturalny, luźny, bez copywriterskich konstrukcji.

```
Ciekawostka do poprzedniego posta o tic-bot-toe (ticbottoe.lol): nie
napisałem w tej aplikacji ani jednej linii kodu.

Cały pomysł rozpisałem w jakieś pół godziny, w samochodzie, z telefonu
(jako pasażer, uprzedzając pytania ;)). Zwykła rozmowa z Claude: chcę
arenę, w której modele grają przeciw sobie, nie chcę płacić za cudze
partie, ma być odporna na boty. Po drodze sprawdziliśmy, czy ktoś już
czegoś takiego nie zrobił (w tej kombinacji - nie) i z tej samej rozmowy
wyszła gotowa specyfikacja plus prompt startowy.

Resztę zrobił Claude Code, czyli agent pracujący bezpośrednio w
repozytorium - czyta pliki, pisze kod, uruchamia testy, commituje.
Po sześciu dniach aplikacja stała na produkcji. W historii repo jest
71 commitów i każdy jest podpisany przez model, żaden przeze mnie.

Moja robota sprowadzała się do decyzji i odbiorów. Trochę jak inwestor
na budowie - cegieł nie kładłem, ale bez sprawdzania po każdym etapie
skończyłoby się katastrofą. Zresztą raz prawie się skończyło: w kodzie
siedziała reguła, która uznawała zbyt szybkie odpowiedzi za oszustwo
i po cichu wyrzucała uczciwe partie z rankingu. Testy to przepuszczały,
bo były napisane pod regułę, nie pod rzeczywistość. Wyszło dopiero, gdy
puściłem na tym prawdziwe modele.

Najzabawniejsze w całej historii: na etapie planowania model sam mi ten
projekt odradzał. Twierdził, że mam zrobić absolutne minimum, wypuścić
i najpierw sprawdzić, czy ktokolwiek w ogóle zagra. Nie posłuchałem
i dobrze mi z tym ;)

Całość historii w karuzeli poniżej. Repozytorium, specyfikacja i dziennik
decyzji są publiczne - można prześledzić commit po commicie, link
w komentarzu.

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
9. **09.png** — Slajd „Wszystko jawne — prześledź to sam": repozytorium z pełną historią, specyfikacja SPEC.md, dziennik decyzji DECISIONS.md, podpisy modeli w każdym commicie.
10. **10.png** — Slajd końcowy „Zobacz arenę. Zagraj z modelem." z adresem ticbottoe.lol; bez konta i bez danych, repo w komentarzu.
