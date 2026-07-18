# PROMPT STARTOWY DLA CLAUDE CODE

> Artefakt źródłowy do materiałów szkoleniowych. Dostarczony przez autora 18.07.2026 jako odpowiedź na `PYTANIA-DO-AUTORA.md` §2.1.
> To dosłowny prompt, którym uruchomiono budowę tic-bot-toe. „Reguła 5", do której odwołuje się `DECISIONS.md`, to punkt 5 w sekcji „Sposób pracy" poniżej.

---

> Instrukcja użycia: umieść plik `SPEC-llm-game-arena-v4.md` w katalogu głównym pustego repozytorium jako `SPEC.md`, uruchom Claude Code (model Opus 4.8) w tym katalogu i wklej poniższy prompt w całości.

---

Zbuduj kompletną aplikację według specyfikacji z pliku `SPEC.md` w katalogu głównym repo. Przeczytaj CAŁĄ specyfikację przed napisaniem pierwszej linii kodu i trzymaj się jej — jest źródłem prawdy dla wymagań, architektury, schematu bazy i kryteriów akceptacji.

## Nadpisanie względem SPEC.md: warstwa UI

Frontend budujesz na **shadcn/ui** (React + Tailwind + Radix). To uzupełnia sekcję 3 specyfikacji:

- Zainicjalizuj shadcn CLI w `apps/web`; komponenty dodawaj przez `npx shadcn@latest add <name>`, nie kopiuj ręcznie.
- Użyj co najmniej: `button`, `card`, `dialog`, `select`, `command` (wyszukiwarka modeli w ModelPicker), `table` (rankingi), `tabs`, `slider` (temperatura w Lab), `switch`, `tooltip`, `badge`, `sonner` (toasty), `skeleton` (stany ładowania), `sheet` (mobilny panel logu partii).
- **Zakaz domyślnego wyglądu.** Nadpisz tokeny motywu w CSS variables zgodnie z sekcją 4 specyfikacji: ciemne tło ~#0B1020, akcent P1 cyjan, P2 magenta, monospace w logach/statystykach, subtelne glow na elementach aktywnych. Zdefiniuj to raz w `globals.css` (warstwa tokenów), nie per komponent.
- Plansze gier (Board3x3, BattleshipBoard, ShipPlacement) to komponenty własne — shadcn służy do chrome'u aplikacji, nie do plansz.
- Wykresy: Recharts ostylowany tymi samymi tokenami; osadzaj w `card` shadcn.

## Sposób pracy

1. **Etapami, dokładnie w kolejności sekcji 19 specyfikacji.** Zanim zaczniesz etap, wypisz jego plan jako todo listę i realizuj punkt po punkcie.
2. Po każdym etapie: `pnpm test` musi być zielony, potem `git commit` z opisową wiadomością (`feat(stage-3): battleship engine + UI`). **Nie przechodź do kolejnego etapu z czerwonymi testami.**
3. Testy piszesz razem z kodem etapu, nie „na końcu". Priorytet pokrycia: `packages/game-core` (silniki, solvery, Elo, replay, parsery) — tam ma być blisko 100%.
4. Etapy 1–8 to rdzeń: po etapie 8 aplikacja ma być w pełni wdrażalna (`docker compose up` + README wystarczają). Dopiero potem moduły 9–12.
5. Gdy specyfikacja czegoś nie rozstrzyga — podejmij rozsądną decyzję, zapisz ją jednym zdaniem w `DECISIONS.md` i jedź dalej. Nie zatrzymuj się na pytania o drobiazgi. Zatrzymaj się i zapytaj TYLKO, jeśli decyzja łamałaby któreś z wymagań nadrzędnych.
6. Nie rozszerzaj zakresu. Żadnych funkcji spoza specyfikacji, żadnych dodatkowych bibliotek bez potrzeby.

## Twarde ograniczenia (złamanie = błąd krytyczny)

- Klucz OpenRouter użytkownika żyje wyłącznie w `localStorage` i jest wysyłany wyłącznie do `openrouter.ai`. Zero proxy dla kluczy po stronie serwera.
- Prompt modelu w statkach budowany wyłącznie z `PlayerView` — model nigdy nie widzi rozstawienia przeciwnika (test snapshotowy obowiązkowy).
- `POST /api/result`: replay serwerowy współdzielonym `game-core`, jednorazowe `jti`, deduplikacja `moves_hash`, rewalidacja `eval` — serwer niczego nie przyjmuje na słowo klienta.
- Partie `lab=true` nigdy nie wpływają na `ratings` ani `elo_history`.
- Interfejs i teksty edukacyjne po polsku (`src/i18n/pl.ts`); prompty do modeli po angielsku (jak w spec).
- Sekrety wyłącznie w `.env` (dostarcz `.env.example`); nic wrażliwego w repo.

## Środowisko

- Node 22 LTS, pnpm workspaces (packages/game-core, apps/web, apps/server).
- PostgreSQL jest zewnętrzny — łącz się przez `DATABASE_URL`; do testów integracyjnych użyj testcontainers.
- Migracje przez drizzle-kit; nie modyfikuj schematu poza mechanizmem migracji.

## Definicja ukończenia

Wszystkie kryteria akceptacji z sekcji 20 specyfikacji spełnione i pokryte testem lub punktem checklisty w README. Na koniec wygeneruj raport końcowy: lista etapów z commitami, wyniki testów, instrukcja pierwszego uruchomienia w 5 krokach, znane ograniczenia.

Zacznij od etapu 1.
