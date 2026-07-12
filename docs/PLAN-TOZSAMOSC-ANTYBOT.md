# Plan: Tożsamość gracza i ochrona rankingu przed botami

> **Dla wykonawcy (Claude Code, model Opus 4.8).** Ten dokument jest kompletnym planem
> wykonawczym. Źródłem prawdy wymagań pozostaje `SPEC.md` (§10, §13, §14, §15, §16) —
> plan go **implementuje**, nie zmienia. Decyzje wykraczające poza SPEC dopisuj do
> `DECISIONS.md`. Pracuj etapami: każdy etap kończy się zielonym `pnpm -r test`
> (+ `pnpm --filter @arena/server test:integration` tam, gdzie dotykasz DB),
> `pnpm -r typecheck`, commitem `feat(identity-N): ...` i aktualizacją sekcji
> „Postęp" na końcu tego pliku. Nie rozszerzaj zakresu.

---

## 0. Kontekst — stan zastany (zweryfikowany 2026-07-12)

Monorepo pnpm: `packages/game-core` (czysty TS), `apps/web` (React 19, Vite 8,
shadcn + prymitywy HUD w `components/ui/hud.tsx`, i18n w `src/i18n/pl.ts` — **cały
tekst UI po polsku, wyłącznie przez `pl.ts`**), `apps/server` (Hono 4 + Drizzle +
Postgres). 166 testów zielonych (game-core 85, server 24 unit + 14 integration
testcontainers, web 43). Rdzeń 1–8 oraz moduły 9–11 ukończone (m.in. publiczne
`/replay/:id`, OG przez `@napi-rs/canvas`, SEO). Przed startem zweryfikuj liczbę
testów własnym uruchomieniem — ta liczba to punkt odniesienia „nic nie zepsułem".

### Co JUŻ działa i czego NIE ruszamy

**Telemetria w rozgrywce (pytanie 1 — zrealizowane, zero pracy):**
- `apps/web/src/components/GameLog.tsx` — przy każdym ruchu: czas (`latencyMs`),
  tokeny `prompt+completion`, koszt USD, badge `retry`/`forfeit`.
- `TimelineChart` (moduł 9) rysuje czas/tokeny na żywo w trakcie partii.
- Ranking: `avgLatencyMs`, `avgTokensPerMove`, `avgCostPerGame` per model.
- Ruchy człowieka też mają mierzony czas (`providers/human.ts`).

**Istniejące warstwy bezpieczeństwa (SPEC §14–§16):**
- Turnstile → `POST /api/verify` → JWT HS256, TTL 30 min, jednorazowe `jti`
  (wypalane w `used_jti` przy zapisie wyniku).
- Rate limiting per IP: `verify` 30/h, `result` 60/h (`middleware/rate-limit.ts`);
  `X-Forwarded-For` honorowane tylko przy `TRUSTED_PROXY=true`.
- Replay serwerowy partii + rewalidacja `eval` (`db/results.ts`) — zwycięzca i
  jakość ruchów liczone na serwerze, nigdy z klienta.
- Sanity: min. średni czas ruchu OpenRouter ≥ 3 s, koszt ≤ 1 USD/partię,
  tokeny ≤ 5k/ruch, dedup `moves_hash`, CSP + HSTS + nosniff, klucz BYOK tylko
  w localStorage, `moves` bez treści promptów.

### Zidentyfikowane luki (przedmiot tego planu)

1. **Brak tożsamości gracza.** Człowiek zawsze zapisuje się jako `subjectId =
   'human'` (`apps/web/src/game/players.ts:31`) — WSZYSCY ludzie dzielą jeden
   wiersz Elo. Ranking nie widzi „wszystkich rozgrywek tego użytkownika".
   SPEC §10 przewiduje rozwiązanie: `player_token` w localStorage + opcjonalny
   pseudonim; bez pseudonimu człowiek nie pojawia się w tabeli.
2. **Antybot dla rankingu ludzi.** Bot z minimaxem może farmić Elo w
   `human_vs_model`: Turnstile chroni zapis, ale telemetria czasu jest
   raportowana przez klienta (fałszowalna), nie ma limitów dziennych ani
   serwerowego pomiaru tempa gry.
3. **Utajony błąd sesji:** po udanym zapisie token JWT NIE jest czyszczony
   (`apps/web/src/store/session.ts` — brak wywołania `clear()` po sukcesie w
   `GameRunner.tsx:190`), a jego `jti` jest już wypalone → drugi zapis w ciągu
   30 min dostaje 409 `jti_used` zamiast ponownej weryfikacji Turnstile.

### Uczciwe granice (zapisz to też w README — SPEC §15.4)

Gra toczy się w przeglądarce. **Nie da się uniemożliwić botowi samego grania**
lokalnie — chronimy wyłącznie **zapis do rankingu** (warstwami, bez gwarancji
absolutnej). Nie budujemy kont, haseł, OAuth ani WebAuthn — zero danych
osobowych; tożsamość = losowy sekret w localStorage (pseudonimowa, zgodna z §16).

---

## 1. Model tożsamości (decyzje projektowe — nie zmieniaj bez wpisu w DECISIONS.md)

**Cel nadrzędny:** ta sama osoba ma ZAWSZE lądować w tym samym wierszu rankingu.
Każda kolejna zapisana partia kumuluje się pod tym samym `human:<players.id>`
(jedno Elo, jedna pozycja, cała historia), a nie tworzy nowego bytu. Tożsamość
NIE jest wiązana z IP, cookies ani fingerprintem — wyłącznie z tokenem.

- `player_token` = **256-bitowy losowy sekret** generowany po stronie klienta
  (`crypto.getRandomValues(new Uint8Array(32))` → base64url, 43 znaki), trzymany
  w `localStorage['arena.playerToken']`. Generowany **leniwie** — dopiero przy
  pierwszym opt-in „Zapisz do rankingu" w trybie `human_vs_model`.
- Serwer przechowuje wyłącznie **SHA-256** tokenu (`token_hash`) — wyciek bazy
  nie pozwala podszyć się pod gracza. Token pełni rolę klucza API gracza
  (bearer secret); przesyłany nagłówkiem `X-Player-Token` tylko do własnego API.
- Publiczny identyfikator gracza = `players.id` (uuid). W `ratings.subject_id`
  człowiek z tokenem to `human:<players.id>`; człowiek bez tokenu — jak dotąd
  literalne `'human'` (wspólny wiersz, ukryty w tabelach).
- Pseudonim opcjonalny, unikalny, filtrowany z wulgaryzmów (§16). **Bez
  pseudonimu gracz nie pojawia się w tabeli rankingu** (SPEC §10), ale jego Elo
  i historia są liczone pod jego id.
- **Ciągłość tożsamości między przeglądarkami/urządzeniami** (bez kont, bez
  PII): token jest jawnie eksportowalny. W profilu gracza przycisk „Skopiuj kod
  tożsamości" (kopiuje surowy token) i pole „Przenieś tożsamość z innego
  urządzenia" (wklejenie kodu → walidacja formatu → podmiana w localStorage po
  potwierdzeniu, że obecna tożsamość zostanie porzucona). To jedyny sposób
  zachowania tej samej pozycji rankingowej na drugim urządzeniu lub po
  wyczyszczeniu danych strony — powiedz to użytkownikowi wprost w nocie
  prywatności. Kod traktować jak hasło (kto go ma, ten gra jako ta osoba).
- Prywatność: zero PII; usunięcie tożsamości = wyczyszczenie localStorage
  (tożsamość porzucona) + `DELETE /api/player/nickname` (usuwa pseudonim z
  tabeli publicznej). Nie logujemy tokenu; IP już jest sanityzowane.
- Moduły 12.5/12.6 (zgadywanka, wyzwanie dnia) użyją TEGO SAMEGO tokenu —
  tabele `predictions`/`daily_results` mają już kolumnę `player_token`; przy ich
  budowie należy przejść na `players.id` (dopisz TODO w DECISIONS przy T1).

---

## Etap T1 — tabela `players`, nagłówek `X-Player-Token`, ranking ludzi

### DB (`apps/server/src/db/schema.ts` + nowa migracja w `apps/server/drizzle/`)

```ts
export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull(),          // sha256 hex (64 znaki)
  nickname: text('nickname'),                        // NULL = nie pokazuj w tabeli
  flaggedAt: timestamp('flagged_at', { withTimezone: true }), // podejrzany (T3)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('players_token_hash').on(t.tokenHash),
  uniqueIndex('players_nickname').on(t.nickname),
]);
```

Do `matches` dodaj `playerId: uuid('player_id').references(() => players.id)`
(nullable) — spina partię z człowiekiem, potrzebne do limitów dziennych (T3)
i przyszłej historii gracza. Migrację wygeneruj tak jak dotychczasowe
(`drizzle-kit generate`), sprawdź że stosuje się na czystej bazie w testach
integracyjnych.

### Serwer

1. `apps/server/src/auth/player.ts` (nowy):
   - `hashPlayerToken(token: string): string` — `node:crypto` sha256 hex.
   - `isValidPlayerToken(t: string): boolean` — base64url, długość 43.
   - `resolvePlayer(db, token): Promise<{ id: string; nickname: string | null; flaggedAt: Date | null }>`
     — `INSERT ... ON CONFLICT (token_hash) DO NOTHING` + select (upsert
     odporny na wyścig).
2. `routes/result.ts`: odczytaj nagłówek `X-Player-Token` (opcjonalny). Jeżeli
   obecny i poprawny → `resolvePlayer` i przekaż `player` do `submitResult`.
   Niepoprawny format → 400 `bad_player_token` (nie ignoruj po cichu).
3. `db/results.ts` (`submitResult`): nowy parametr `player: { id } | null`.
   W trybie `human_vs_model` wykryj stronę człowieka (`p1Id === 'human'` lub
   `p2Id === 'human'` — dokładnie tak wysyła frontend). Gdy `player` obecny:
   podmień id tej strony na `human:${player.id}` PRZED agregacją i ratingiem
   oraz zapisz `matches.playerId`. Gdy brak — zachowanie bez zmian.
4. `routes/player.ts` (nowy, montowany w `app.ts` pod `/api/player`,
   rate limit 30/h):
   - `GET /me` — nagłówek `X-Player-Token` → `{ id, nickname, flagged: boolean }`
     (tworzy gracza przy pierwszym kontakcie).
   - `POST /nickname` `{ nickname }` — walidacja: 3–20 znaków,
     `[a-ząćęłńóśźż0-9_-]` (case-insensitive, zapis lowercase), filtr
     wulgaryzmów (nowy `apps/server/src/lib/profanity.ts` — prosta lista
     PL/EN sprawdzana jako substring po normalizacji; ~30–50 pozycji
     wystarczy, §16 mówi „prosty filtr"), unikalność → 409 `nickname_taken`.
   - `DELETE /nickname` — ustawia NULL.
   - Bez Turnstile (to nie jest zapis wyniku); wystarczy rate limit.
5. `routes/leaderboard.ts`: nowy parametr `subject=models|humans`
   (domyślnie `models`).
   - `models`: wiersze, których `subject_id` NIE zaczyna się od `human`.
   - `humans` (sens tylko dla `mode=human_vs_model`): wiersze `human:%`,
     join z `players` (id z sufiksu), **tylko `nickname IS NOT NULL` i
     `flagged_at IS NULL`**; zwróć `nickname` zamiast surowego `subjectId`.
   - Wiersz literalny `'human'` (anonimowy agregat) nigdy nie wraca z API.
   - Klucz cache musi objąć `subject`.

### Web

1. `apps/web/src/store/player.ts` (nowy): `getOrCreatePlayerToken()` (leniwe,
   localStorage), `usePlayerProfile` (TanStack Query na `/api/player/me`,
   włączane dopiero gdy token istnieje).
2. `api/results.ts` → `saveResult`: gdy `outcome.mode === 'human_vs_model'`,
   dołącz nagłówek `X-Player-Token` (tworząc token, jeśli go nie ma — zapis
   jest opt-in, więc to jest właściwy moment pierwszego użycia).
3. Ekran Rankingi (`pages/LeaderboardPage.tsx`): dla trybu `human_vs_model`
   dwie tabele/zakładki — „Modele" i „Ludzie" (`subject=humans`, kolumna
   pseudonim). Użyj istniejących prymitywów HUD; teksty przez `pl.ts`.
4. Sekcja „Profil gracza" (na stronie Rankingów lub w ustawieniach — wybierz
   prostsze): pokaz stanu (anonimowy / pseudonim), formularz ustawienia i
   usunięcia pseudonimu, **eksport/import tożsamości** (patrz §1: „Skopiuj kod
   tożsamości" przez `navigator.clipboard`, pole importu z walidacją
   base64url-43 i dialogiem potwierdzenia — import podmienia token w
   localStorage i invaliduje query profilu), krótka nota prywatności: „Twoja
   tożsamość to losowy token w tej przeglądarce — dzięki niemu wszystkie Twoje
   partie liczą się do jednego Elo. Bez pseudonimu nie pojawiasz się w tabeli.
   Wyczyszczenie danych strony = utrata tożsamości; żeby grać jako ta sama
   osoba na innym urządzeniu, przenieś kod tożsamości." Po zapisanej partii,
   jeśli gracz nie ma pseudonimu, w karcie wyniku pokaż zachętę z linkiem.
5. `i18n/pl.ts` — wszystkie nowe teksty.

### Testy T1

- Unit (server): hash/walidacja tokenu, reguły pseudonimu (za krótki, złe
  znaki, wulgaryzm, poprawny z polskimi znakami), idempotentny `resolvePlayer`.
- Integration (testcontainers, wzorzec z `results.integration.test.ts`):
  zapis z tokenem tworzy gracza, rating ląduje pod `human:<id>`,
  `matches.player_id` ustawione; zapis bez tokenu → `'human'` jak dotąd;
  dwa różne tokeny → dwa niezależne Elo; `nickname_taken` 409; leaderboard
  `subject=humans` pomija graczy bez pseudonimu i flagowanych.
- Web (vitest): token stabilny między wywołaniami; `saveResult` dołącza
  nagłówek tylko w `human_vs_model`; formularz pseudonimu waliduje długość;
  import tożsamości odrzuca zły format i podmienia token przy poprawnym.
- Integration (kluczowy dla celu §1): dwie partie z TYM SAMYM tokenem →
  jeden wiersz `ratings` z `games=2` i skumulowanym Elo, a nie dwa wiersze.

**Commit:** `feat(identity-1): players + X-Player-Token + ranking ludzi`

---

## Etap T2 — serwerowe tempo gry (pacing) i sanity ruchów człowieka

Cel: bot farmiący ranking musi płacić czasem rzeczywistym; fałszowanie
telemetrii przestaje wystarczać.

1. **Napraw błąd sesji (niezależnie od reszty):** w `GameRunner.tsx` po udanym
   `saveResult` wywołaj `useSession.getState().clear()`; w `api/client.ts` przy
   odpowiedzi 401/409 `jti_used` wyczyść sesję, żeby kolejna próba otworzyła
   Turnstile zamiast ginąć. Test web na czyszczenie po sukcesie.
2. **Token startu partii.** Nowy `POST /api/match/start` (rate limit 120/h/IP,
   bez Turnstile — cichy fetch): zwraca JWT `{ typ: 'start', jti, iat }`,
   TTL 45 min, podpisywany tym samym sekretem (rozszerz `auth/jwt.ts` o
   `signStartToken`/`verifyStartToken`; wyciągnij też `iat` w
   `SessionClaims` — `setIssuedAt()` już jest w tokenie, tylko nieodczytywany).
3. **Klient:** przy starcie partii `human_vs_model` (moment wysłania pierwszego
   ruchu do orchestratora w `GameRunner.tsx`) pobierz token startu i trzymaj w
   stanie partii; `buildResultPayload` dołącza go jako `startToken`. Fetch nie
   może blokować gry — jeśli się nie uda, graj dalej; zapis do rankingu i tak
   zwróci czytelny błąd.
4. **Serwer (`routes/result.ts` + `db/results.ts`):** dla `human_vs_model` z
   `lab=false`:
   - `startToken` wymagany i ważny, jego `jti` wypalane w `used_jti` w tej
     samej transakcji co `jti` sesji (jeden start = jeden zapis);
   - ruchy człowieka: `humanMoves = moves.filter(m => strona człowieka)`;
   - warunek tempa: `now - iat*1000 >= min(humanMoves.length * 1000, 15*60_000) - 2000`
     (1 s na ruch człowieka, tolerancja 2 s, sufit 15 min dla długich partii
     w statki) — inaczej 422 `too_fast_for_human`. `now` bierz z `deps.now`
     (już wstrzykiwane), żeby testy były deterministyczne.
5. **Sanity telemetrii człowieka** (analogicznie do `suspiciousTiming` dla
   OpenRouter, w `db/results.ts`): przy ≥3 ruchach człowieka średnia
   `latencyMs` < 800 ms → 422 `suspicious_timing`; przy ≥5 ruchach rozstęp
   `max-min` < 10 ms (idealnie równe czasy = skrypt) → 422. To warstwa tania i
   fałszowalna — prawdziwą pracę robi punkt 4; nie rozbudowuj jej.
6. `model_vs_model` — bez zmian (ma już próg 3 s dla OpenRouter; WebLLM/Ollama
   celowo zwolnione, SPEC §15.3).

### Testy T2

- Unit: podpis/weryfikacja tokenu startu, odczyt `iat`, arytmetyka progu
  (granice: dokładnie na progu, tuż pod, sufit 15 min).
- Integration: zapis bez `startToken` → 422; z tokenem „za młodym" → 422
  `too_fast_for_human`; z odpowiednio starym → 200; ponowne użycie tego samego
  `startToken` → 409; średnia < 800 ms → 422.
- Web: sesja czyszczona po udanym zapisie; payload zawiera `startToken`.

**Commit:** `feat(identity-2): pacing serwerowy + sanity czasu człowieka + fix sesji`

---

## Etap T3 — limity dzienne, flaga precyzji, uczciwa komunikacja

1. **Limity dzienne** (tylko `lab=false`, liczone w transakcji `submitResult`
   zapytaniem COUNT po `matches`, dzień UTC):
   - per `player_id`: 30 partii rankingowych/dzień,
   - per `client_ip`: 60/dzień (łapie farmę wielotokenową z jednego IP).
   Przekroczenie → 429 `daily_limit` (czytelny komunikat w `pl.ts`). Stałe
   zdefiniuj obok `MAX_TOKENS_PER_MOVE`.
2. **Flaga precyzji** (tylko statki — w kółko i krzyżyk 100% optymalnych ruchów
   jest osiągalne dla człowieka i NIE jest podejrzane): po aktualizacji ratingu
   gracza `human:%`, jeśli `total_moves >= 100` i `optimal_moves/total_moves >= 0.9`
   → ustaw `players.flagged_at` (idempotentnie) i zaloguj `console.warn`.
   Flagowany gracz znika z tabeli ludzi (filtr już w T1); jego partie dalej się
   zapisują (żadnego auto-bana — odwracalne ręcznie w SQL). Wpisz do
   DECISIONS.md próg i uzasadnienie.
3. **Komunikacja** (SPEC §15.4): w README sekcja „Model zagrożeń rankingu"
   (warstwy: Turnstile+jti, replay+eval, pacing startToken, sanity czasów,
   limity dzienne, flaga precyzji; wprost: lokalnego grania botem nie
   blokujemy). W UI przy tabeli ludzi jedno zdanie z `pl.ts`: wyniki pochodzą
   ze środowiska klienckiego, ranking chroniony warstwowo.

### Testy T3

- Integration: 31. partia gracza w dniu → 429; 61. z tego samego IP → 429;
  gracz przekraczający próg precyzji w statkach dostaje flagę i znika z
  leaderboardu; w kółko i krzyżyk flaga NIE jest ustawiana.

**Commit:** `feat(identity-3): limity dzienne + flaga precyzji + threat model`

---

## Etap T0 (opcjonalny, na końcu, ~godzina) — kosmetyka telemetrii

Jedyne, czego brakuje w widoczności czasu/tokenów: sumy per gracz w trakcie
partii. W `PlayerSlot` (`GameRunner.tsx`) dodaj wiersz z łącznym czasem i
tokenami danej strony (agregacja z `moves` już dostępnych w stanie). Bez zmian
w game-core. Test web na agregację.

**Commit:** `feat(identity-0): sumy telemetrii per gracz w slotach`

---

## Poza zakresem (świadomie — nie implementuj)

- Konta, hasła, e-maile, OAuth, passkeys/WebAuthn — zbędne PII wbrew §16.
- Serwerowa autorytatywność rozgrywki — sprzeczna z architekturą BYOK (§15).
- CAPTCHA per ruch, fingerprinting przeglądarki, ML-detekcja botów.
- Przepisywanie `predictions`/`daily_results` na `players.id` — dopiero przy
  modułach 12.5/12.6 (zostaw TODO w DECISIONS.md).

## Definicja ukończenia całego planu

- Wszystkie dotychczasowe 155 testów + nowe zielone; typecheck i build czyste.
- `docker compose up` z czystą bazą stosuje migracje i przechodzi smoke:
  zapis partii człowieka z tokenem → gracz w rankingu ludzi po nadaniu
  pseudonimu.
- DECISIONS.md: wpisy dla modelu tożsamości (bearer secret + sha256), progu
  pacingu, progu flagi precyzji, limitów dziennych.
- Sekcja „Postęp" poniżej zaktualizowana po każdym etapie.

## Postęp

- [x] **T1 — players + X-Player-Token + ranking ludzi.** Tabela `players`
  (token_hash sha256, nickname unikalny, flagged_at) + `matches.player_id`,
  migracja `0001`. `resolvePlayer` (upsert odporny na wyścig), `X-Player-Token`
  w `/api/result` → strona człowieka zapisywana jako `human:<players.id>`, więc
  **każda partia tej samej osoby wpada do jednego wiersza rankingu**.
  `/api/player/me|nickname` (filtr wulgaryzmów, 409 przy zajętym).
  `/api/leaderboard?subject=humans` (tylko z pseudonimem i bez flagi).
  Front: reużyty `settings.playerToken`, `PlayerProfile` w ustawieniach
  (pseudonim + **eksport/import kodu tożsamości**), zakładka „Ludzie".
- [x] **T2 — pacing serwerowy + sanity + fix sesji.** `POST /api/match/start`
  wydaje token z `iat` serwera; ranking wymaga go dla partii człowieka
  (`missing_start_token`), a zbyt szybka partia → `too_fast_for_human`
  (1 s/ruch, tolerancja 2 s, sufit 15 min). `jti` startu wypalany w tej samej
  transakcji (`start_token_used`). Sanity: śr. < 800 ms lub metronomiczny
  rozrzut < 10 ms → `suspicious_timing`. **Naprawiony bug**: sesja czyszczona
  po udanym zapisie i przy 401/`jti_used`.
- [x] **T3 — limity dzienne + flaga precyzji + threat model.** 30 partii
  rankingowych/gracza/dzień i 60/IP (`daily_limit`, `daily_limit_ip`; `lab`
  nie liczy się do limitu). Flaga precyzji **tylko w statkach** (≥100 ruchów
  i ≥90% optymalnych) — ukrywa gracza z tabeli, niczego nie kasuje.
  README: „Tożsamość gracza" + „Model zagrożeń rankingu"; notka w UI.
- [ ] T0 (opcjonalny) — sumy telemetrii w slotach graczy

**Stan testów po T1–T3:** server 43 unit + 52 integracyjne (testcontainers),
game-core 85, web 62. Typecheck serwera i game-core czysty.

> **Uwaga o gałęzi:** T1–T3 powstawały równolegle z drugą sesją budującą moduł 12
> (karty modeli, „Jak czytać te liczby?", laboratorium, zgadywanka, wyzwanie dnia)
> w tym samym working tree. Na życzenie użytkownika **nic nie zostało zacommitowane**
> — commity fazowe (`feat(identity-N)`) do zrobienia po scaleniu obu prac.
