# PYTANIA DO AUTORA — luki w case study

> Reguła D5: czego nie ma w [`FAKTY.md`](./FAKTY.md) ani tu (z odpowiedzią), tego w materiałach NIE MA.
> Wypełnij pola „Odpowiedź". Puste pole = wątek wypada z Zeszytu 2 i ze slajdów, zamiast być dopowiedziany „na oko".
> Krótko i konkretnie — jedno–dwa zdania na pytanie wystarczą.

---

## 1. Research i koncepcja w Claude Cowork

**1.1 Od czego się zaczęło?** Skąd wziął się pomysł na arenę gier dla LLM-ów — problem, obserwacja, inspiracja?
> ✅ **Odpowiedziane** (z zapisu rozmowy). Punkt startowy: prompt o aplikację, w której modele grają w kółko i krzyżyk przeciw sobie i człowiekowi, odporną na boty, z dowolnym modelem i **bez płacenia z własnej kieszeni**. Cytat C11 w `FAKTY.md`. [Opcjonalnie dopisz jedno zdanie: co Cię do tego pchnęło — potrzeba portfolio? ciekawość? materiał na warsztat?]

**1.2 Jak wyglądała praca w Cowork?** Który model, ile mniej więcej sesji/iteracji, co konkretnie robił Cowork (burza mózgów? analiza konkurencji? pisanie SPEC-a)?
> ✅ **Odpowiedziane.** Pełny zapis rozmowy → [`zrodla/research-cowork.md`](./zrodla/research-cowork.md), rozpisany w `FAKTY.md` §2a. Jedna rozmowa, ~11 wymian, przyrostowe budowanie SPEC v1→v4 + analiza konkurencji (web search) + prompt startowy. [Do uzupełnienia, jeśli chcesz: który dokładnie model Cowork.]

**1.3 Ile wersji przeszła specyfikacja?** `SPEC.md` to v4 („zastępuje v1–v3"). Co zmieniało się między wersjami — czego się nauczyłeś po drodze?
> ✅ **Odpowiedziane.** Delta v1→v4 rozpisana w `FAKTY.md` §2a (każde pytanie dokładało warstwę: rankingi+statki → VPS/Postgres → telemetria+edukacja). Potwierdzone też, że dostarczony v4 jest **bajt w bajt** równy `SPEC.md` w repo — spec napisany raz, niezmieniany w trakcie budowy.

**1.4 Ile trwała sama faza koncepcji** (research + SPEC), zanim padł pierwszy commit kodu (12.07)?
> ✅ **Odpowiedziane.** **~30 minut**, prowadzone z telefonu **jako pasażer w samochodzie**. (Świetny headline — zapisane w `FAKTY.md` §2a i §3.)

---

## 2. Prompt startowy i sposób prowadzenia agenta

**2.1 Czym jest „reguła 5 promptu startowego"?** `DECISIONS.md` się do niej odwołuje, ale sam prompt startowy nie jest w repo. Podaj jego treść (lub kluczowe reguły), jeśli może być upubliczniony.
> ✅ **Odpowiedziane.** Autor dostarczył pełny prompt startowy → zapisany jako [`zrodla/PROMPT-claude-code.md`](./zrodla/PROMPT-claude-code.md). „Reguła 5" to punkt 5 sekcji „Sposób pracy": *„Gdy specyfikacja czegoś nie rozstrzyga — podejmij rozsądną decyzję, zapisz ją jednym zdaniem w `DECISIONS.md` i jedź dalej. […] Zatrzymaj się i zapytaj TYLKO, jeśli decyzja łamałaby któreś z wymagań nadrzędnych."* To wyjaśnia, dlaczego `DECISIONS.md` w ogóle istnieje.

**2.2 Jak wyglądał typowy start etapu?** Wklejałeś cały PLAN, prosiłeś o etap po etapie, czy inaczej?
> ✅ **Częściowo z promptu startowego** (`zrodla/PROMPT-claude-code.md`): jeden prompt startowy + SPEC jako `SPEC.md`, praca „etapami, dokładnie w kolejności sekcji 19", z todo-listą przed każdym etapem i commitem po każdym. Późniejsze inicjatywy (Sudoku/Scrabble, Efekt WOW) dostawały osobne briefy `docs/PLAN-*.md`. [Do uzupełnienia, jeśli w praktyce wyglądało to inaczej niż w prompcie.]

**2.3 Dlaczego dwa modele** (Opus 4.8 do rdzenia, Fable 5 do „Efektu WOW")? Świadoma decyzja czy naturalna zmiana w czasie?
> ⛔ **Pominięte decyzją autora (18.07.2026).** Nie wchodzi do materiałów; w case study modele opisujemy tylko faktograficznie (kto co zrobił wg trailerów git), bez interpretacji „dlaczego".

---

## 3. Czas i koszty — ⛔ POMINIĘTE decyzją autora (18.07.2026)

Autor prosił o pominięcie kosztów i łącznego czasu pracy. **Nie umieszczamy** w materiałach kwot ani godzin (poza jednym potwierdzonym faktem: faza koncepcji ~30 min — §1.4). Model kosztowy „właściciel nie płaci za inferencję graczy" opisujemy wyłącznie na podstawie `SPEC.md`/`README` (fakt architektoniczny), bez podawania rachunków autora.

---

## 4. Doświadczenie i lekcje — ⛔ POMINIĘTE decyzją autora (18.07.2026)

Puentę case study budujemy z faktów i artefaktów (metoda pracy, `DECISIONS.md`, poprawki z code-review), a nie z subiektywnych wrażeń autora — te zostały świadomie pominięte.

---

## 5. Zgody i formalności — ⛔ POMINIĘTE (autor sam prowadzi i recenzuje produkcję)

Autor jest jednocześnie właścicielem projektu i prowadzi tę produkcję, recenzując każdy etap (D6), więc traktujemy zgody jako udzielone w tym trybie. Domyślne założenia produkcji (do korekty przy recenzji dowolnego etapu):
- **Cytowanie:** `SPEC.md`, `DECISIONS.md`, PLAN-y, prompt startowy i zapis researchu — wolno cytować (to artefakty tego projektu, bez danych osób trzecich).
- **Dane autora:** imię i nazwisko jak w git („Dariusz Tyszka"); stanowisko/firma/linki — dodamy tylko jeśli autor je poda przy recenzji.
- **Zrzuty:** używamy jak złapane; obecne kadry nie pokazują nicków ludzi (leaderboard = identyfikatory modeli, muzeum/turing = pusty stan). Jeśli przyszłe kadry pokażą realne nicki graczy — zanonimizujemy.
- **Mini-aplikacja w Zeszycie 4:** wybór po stronie autora materiałów (proponowana: lista zadań z zapisem lokalnym — jedna technologia, zero backendu), do zatwierdzenia przy Etapie 4.
