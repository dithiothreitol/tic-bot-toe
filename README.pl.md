# tic-bot-toe — LLM Game Arena

> 🌍 **English:** [`README.md`](./README.md) · 🇵🇱 **Polski** (ta strona)

Arena gier logicznych (**kółko i krzyżyk**, **statki**) dla modeli językowych i ludzi,
która **uczy przez grę**. Właściciel nie płaci za inferencję: **BYOK OpenRouter**
(klucz tylko w przeglądarce), **WebLLM** (WebGPU, lokalnie) lub opcjonalnie **Ollama**
na serwerze. Rankingi **Elo** + telemetria (czas, tokeny, koszt) liczone i walidowane
po stronie serwera.

> Źródło prawdy wymagań: [`SPEC.md`](./SPEC.md). Decyzje projektowe: [`DECISIONS.md`](./DECISIONS.md).

## Monorepo (pnpm workspaces)

| Pakiet | Rola |
|---|---|
| [`packages/game-core`](./packages/game-core) | Czysty TS: silniki gier, solvery, Elo, replay, parsery (bez DOM/Node — działa w przeglądarce i na serwerze) |
| [`packages/i18n`](./packages/i18n) | Czysty TS: języki i **kształt zlokalizowanych URL-i** (`/rankingi` ⇄ `/en/rankings`). Współdzielony, bo front buduje z niego linki, a serwer sitemap, hreflang i tagi OG — jedna tabela, zero szans na rozjazd |
| [`apps/web`](./apps/web) | Frontend: Vite 8 + React 19 + TS + Tailwind 4 + shadcn/ui + Zustand. Warstwa wizualna „Cyber-HUD" wg [`handoff/DESIGN.md`](./handoff/DESIGN.md) (fonty self-hosted przez `@fontsource`) |
| [`apps/server`](./apps/server) | Backend: Node 22 + Hono + Drizzle + PostgreSQL |

## Pierwsze uruchomienie (Docker, 5 kroków)

```bash
# 1. Wejdź do katalogu deploy
cd deploy

# 2. Ustaw sekrety (compose czyta deploy/.env)
cat > .env <<'EOF'
JWT_SECRET=<długi-losowy-ciąg>
TURNSTILE_SECRET=<sekret-turnstile-lub-testowy>
POSTGRES_PASSWORD=<hasło-do-postgresa>
TRUSTED_PROXY=true
EOF

# 3. Zbuduj i wystartuj (app + Postgres; migracje aplikują się same przy starcie)
docker compose up --build -d

# 4. Sprawdź zdrowie
curl http://localhost:8080/api/health      # {"ok":true,...}

# 5. (Produkcja) postaw Caddy z auto-TLS przed aplikacją
DOMAIN=arena.example.com caddy run --config ../deploy/Caddyfile
```

Otwórz aplikację → **Ustawienia** (⚙) → wklej klucz OpenRouter (lub użyj WebLLM bez
klucza) → rozegraj partię → **Zapisz do rankingu**.

> **PostgreSQL jest zewnętrzny** wg SPEC §3 — usługa `postgres` w compose jest dla
> wygody. W produkcji usuń ją i wskaż `DATABASE_URL` na własną instancję.
> Alternatywa bez Dockera: [`deploy/llm-arena.service`](./deploy/llm-arena.service) (systemd).

## Rozwój lokalny

```bash
pnpm install
pnpm test                 # game-core + server (unit) + web
pnpm --filter @arena/server test:integration   # testcontainers — wymaga Dockera
pnpm typecheck

pnpm dev:server           # backend :8080 (DATABASE_URL w .env → rankingi aktywne)
pnpm dev                  # frontend :5173 (proxy /api → :8080)
```

## Zmienne środowiskowe

Wszystkie w [`.env.example`](./.env.example). Kluczowe:

| Zmienna | Opis |
|---|---|
| `DATABASE_URL` | PostgreSQL ≥ 15. Bez niej rankingi są wyłączone (gra działa). |
| `JWT_SECRET` | Sekret HMAC sesji (HS256). Ustaw długi losowy. |
| `TURNSTILE_SECRET` | Cloudflare Turnstile (siteverify). Domyślnie klucz testowy „zawsze przechodzi". |
| `ENABLE_OLLAMA` | `true` włącza proxy `/api/ollama` (kolejka max 1). |
| `TRUSTED_PROXY` | `true` za Caddy/nginx (zaufaj `X-Forwarded-For`). |
| `VITE_TURNSTILE_SITE_KEY` | Publiczny klucz Turnstile (frontend). |

## Bezpieczeństwo (checklist §16)

- [x] Klucz OpenRouter **wyłącznie w `localStorage`**, wysyłany **wyłącznie do `openrouter.ai`** — nigdy na nasz backend (test-strażnik `openrouter.test.ts`).
- [x] Prompt modelu budowany **wyłącznie z `PlayerView`** — model nie widzi rozstawienia przeciwnika w statkach (**snapshot** braku ukrytej informacji).
- [x] `POST /api/result`: **replay serwerowy** wspólnym `game-core`, jednorazowe `jti`, dedup `moves_hash`, sanity (timing/tokeny/koszt) — serwer niczego nie ufa klientowi.
- [x] Partie `lab=true` **nigdy** nie wpływają na `ratings`/`elo_history`.
- [x] Sekrety **tylko w env** (`.env.example` w repo, `.env` ignorowany).
- [x] **CSP** pinuje wyjścia (openrouter/turnstile/MLC CDN) + HSTS, nosniff, Referrer-Policy.
- [x] Tożsamość gracza = **losowy sekret w `localStorage`**, bez danych osobowych; serwer trzyma wyłącznie jego **SHA-256** (`players.token_hash`). Zero kont, zero e-maili.

## Tożsamość gracza (§10)

Osoba jest rozpoznawana po losowym sekrecie z `localStorage`, wysyłanym jako nagłówek
`X-Player-Token` **wyłącznie do naszego API**. Dzięki temu **wszystkie partie tej samej
osoby wpadają do jednego wiersza rankingu** (`ratings.subject_id = human:<players.id>`),
zamiast rozsypywać się po wspólnym anonimowym koszyku `human`.

- Pseudonim jest **opcjonalny**, unikalny i filtrowany z wulgaryzmów. Bez pseudonimu Elo
  nadal się kumuluje, ale gracz **nie pojawia się w tabeli** (SPEC §10).
- Sekret jest **przenośny**: „Skopiuj kod tożsamości" → wklej na innym urządzeniu. To
  jedyny sposób, by zachować tę samą pozycję po zmianie przeglądarki. Kod = hasło.
- Wyczyszczenie danych strony = utrata tożsamości (partie zostają w rankingu).

## Model zagrożeń rankingu (§15)

Gra toczy się w przeglądarce, więc **nie da się uniemożliwić botowi lokalnego grania** —
i nie udajemy, że umiemy. Chronimy wyłącznie **zapis do rankingu**, warstwowo:

| Warstwa | Co powstrzymuje |
|---|---|
| Walidacja payloadu (zod) + **zarezerwowany namespace `human:`** | podszycie się pod cudzy wiersz rankingu i ominięcie warstw poniżej; zniekształcony payload = 400, nie 500 |
| Turnstile → JWT z jednorazowym `jti` | masowy, zautomatyzowany zapis wyników |
| Serwerowy replay + rewalidacja `eval` | zmyślony zwycięzca, nielegalne ruchy, fałszywa „Precyzja" |
| Token startu partii (`POST /api/match/start`, `iat` serwera, **wiązany z tożsamością**) | partię „rozegraną" w ułamku sekundy; pulowanie tokenów między tożsamościami |
| Sanity czasów człowieka (śr. ≥ 800 ms, niezerowy rozrzut) | metronomiczne i natychmiastowe ruchy skryptu |
| Limity dzienne partii **człowieka** (30/gracza, 60/IP, doba UTC) | farmienie Elo i mnożenie tożsamości z jednej maszyny |
| Flaga precyzji (statki, **sumarycznie po wariantach**: ≥100 ruchów i ≥90% optymalnych) | solver podszywający się pod człowieka — znika z tabeli, nic nie jest kasowane |
| `moves_hash` (dedup), limity kosztu/tokenów | powtórki tego samego wyniku, absurdalna telemetria |

**Kluczowa zasada:** przestrzeń nazw `human:` należy **wyłącznie do serwera** — jest
nadawana z zweryfikowanego tokenu gracza. Payload od klienta, który sam podaje
`p1Id: "human:<uuid>"`, jest odrzucany (400 `reserved_subject_id`). Bez tego można by
ominąć wszystkie warstwy poniżej i pisać do cudzego rankingu.

Limity dzienne celowo liczą **tylko partie `human_vs_model`** — objęcie nimi partii
model-vs-model karałoby wszystkich za jednym NAT-em (biuro, uczelnia, CGNAT) w głównym
scenariuszu użycia aplikacji.

Świadomie **nie** budujemy: kont/haseł/OAuth, fingerprintingu przeglądarki, CAPTCHA przy
każdym ruchu ani serwerowej autorytatywności rozgrywki (sprzeczna z BYOK, §15).
Partie Ollama są wyjątkiem — idą przez nasze proxy, więc mają `server_verified`.

**Ryzyko szczątkowe (uczciwie):** token startu jest wiązany z tożsamością, ale nie jest
zużywany „po jednym naraz". Bot może pobrać kilka tokenów zawczasu, odczekać raz i zapisać
kilka partii szybciej niż je „grał". Sufitem pozostaje limit 30 partii rankingowych na
gracza dziennie, więc skala jest ograniczona; nie budujemy pod to osobnego rejestru
wydanych tokenów, bo koszt przewyższa zysk dla tabeli wyników gry towarzyskiej.

## Kryteria akceptacji (§20)

- [x] Partie do końca w obu grach i trybach (człowiek↔model, model↔model).
- [x] WebLLM offline od OpenRouter; brak klucza wymagany tylko dla modeli OpenRouter.
- [x] Legalne rozstawienia statków (test **1000 losowych układów** × 3 warianty).
- [x] Prompt bez informacji ukrytej — **test snapshotowy** w `game-core`.
- [x] Odrzucanie nielegalnych/zduplikowanych wyników (testcontainers: replay/jti/dedup).
- [x] Poprawne Elo (start 1000, K=32, remis 0.5, zero-sum) + `elo_history` w transakcji.
- [x] Klucz tylko do `openrouter.ai`.
- [x] `docker compose up` + README wystarczają do wdrożenia.
- [x] Telemetria per ruch; braki tokenów jako „—", nie 0.

## Języki (PL + EN)

Interfejs istnieje po **polsku i angielsku**. Język siedzi **w URL-u**, nie w
localStorage: polski jest kanoniczny i nieprefiksowany (`/rankingi`), angielski żyje
pod `/en` (`/en/rankings`). Dzięki temu link wklejony na Slacku otwiera się w tym
języku, w którym go skopiowano, a obie wersje są indeksowalne (hreflang + sitemap +
`<html lang>` i tagi OG renderowane przez serwer per ścieżka — także obrazek OG
powtórki: `/api/og/:id?lang=en`).

- **Nowy odwiedzający** trafia na język przeglądarki (`pl*` → polski, reszta → angielski).
  Wybór z przełącznika w nagłówku wygrywa z przeglądarką i jest zapamiętywany.
- **Słownik**: [`apps/web/src/i18n/pl.ts`](./apps/web/src/i18n/pl.ts) jest źródłem prawdy —
  typ `Dict` jest z niego wyprowadzony, więc **nowy klucz w `pl.ts` nie skompiluje się**,
  dopóki nie trafi do `en.ts`. Brakującego tłumaczenia nie da się przeoczyć.
- **Prompty do modeli zostają angielskie** niezależnie od języka UI (SPEC §5). Jedyny
  wyjątek: **komentator AI**, którego *wypowiedź* czyta użytkownik — więc pisze w języku
  interfejsu (instrukcje w prompcie nadal po angielsku).
- Opisy modeli (`model-copy.ts`) są dwujęzyczne, ale **klasyfikacja** (rozmiar/cena/kontekst)
  jest wspólna — tłumaczenie nie może przesunąć modelu do innego kubełka.

## Trener AI — komentator (§12.1)

Komentator ma **dwa źródła**, użytkownik wybiera jedno:

- **Mój model (BYOK)** — dowolny model na kluczu/providerze gracza (OpenRouter/WebLLM/Ollama),
  dokładnie jak gracz. Domyślnie wyłączony, koszt po stronie gracza.
- **Trener wbudowany** — model Gemini **fundowany przez właściciela**. Klucz to **sekret serwera**
  (`GEMINI_COACH_API_KEY`), przeglądarka nigdy go nie widzi. Dostępny tylko gdy właściciel go ustawi
  (`GET /api/health` → `coach:true`); wtedy staje się domyślnym, przyjaznym wyborem (bez klucza).

Prompt trenera **składa serwer** z ustrukturyzowanego, walidowanego wejścia — nie przyjmuje gotowego
tekstu od klienta, więc endpoint `/api/commentary` nie jest otwartym proxy do klucza Gemini (można nim
wygenerować wyłącznie komentarz do partii). Endpoint jest limitowany (120/h/IP). Model ustawiasz przez
`GEMINI_COACH_MODEL` (domyślnie `gemini-3.5-flash`; `gemini-flash-latest` **nie** jest aliasem natywnego
API — trzeba podać konkretną wersję).

## Testy

**~300 testów** (game-core 95, i18n 11, server 63 unit + integracyjne testcontainers, web 95).
Priorytet pokrycia: `game-core` (silniki, solvery, Elo, replay, wyzwanie dnia, parsery).

```bash
pnpm test                                       # jednostkowe (3 pakiety)
pnpm --filter @arena/server test:integration    # testcontainers — wymaga Dockera
```

## Znane ograniczenia

- Gra toczy się w przeglądarce — pełnej gwarancji uczciwości nie ma (warstwy obrony w §15); wyjątek: partie Ollama (`server_verified`).
- „Śr. czas" w rankingu liczony ze średniej (mediana z `matches` — do rozważenia).
- **Zgadywanka widza nie jest odporna na determinowanego oszusta** — chroni ją okno 10 min od zapisu partii, jeden typ na partię i limit 60/h. To zabawa bez stawek (§12.5), nie buduję pod nią kryptografii.
- Pula przeciwników **wyzwania dnia** jest zaszyta w `game-core/daily.ts`. Identyfikatory `:free` w OpenRouterze **znikają bez uprzedzenia** (straciliśmy już `mistralai/mistral-7b-instruct:free`), a te, które zostają, bywają ostro limitowane (429). Oba przypadki wyglądają dla gry tak samo: model nie odpowiada → runner robi ruchy wymuszone → „przeciwnik" gra losowo. Dlatego **nie polegamy na świeżości listy**:
  - serwer **odmawia zaliczenia dnia**, jeśli przeciwnik nie wykonał ani jednego realnego ruchu (`opponent_never_played`) — nie da się zaliczyć wyzwania „wygraną z duchem";
  - front **nie oferuje wyzwania**, gdy dzisiejszego przeciwnika nie ma już w katalogu;
  - `pnpm daily:check` sprawdza całą pulę i najbliższe 30 dni względem żywego katalogu (kod ≠ 0 przy zgniłym wpisie — nadaje się do crona/CI).

## Status budowy

**Rdzeń 1–8 (wdrażalny produkt) — ukończony.** Warstwa wizualna Cyber-HUD
(`handoff/DESIGN.md`) nałożona. **Moduł 9 (wykresy/telemetria) — ukończony**:
oś czasu partii (na żywo), radar profilu modelu, koszt-vs-Elo (scatter log),
przebieg Elo, ekran „Porównaj" (radar nałożony + bilans bezpośredni) — Recharts
w stylu HUD, z objaśnieniem i eksportem PNG pod każdym. **Moduł 10
(analiza+solvery) — ukończony**: minimax kółka i krzyżyk + heurystyka
percentylowa statków (`game-core/solvers`), ekran „Analiza z trenerem"
(krok-po-kroku, kolorowe znaczniki, Precyzja %, moment zwrotny), kolumna
Precyzja w rankingu, **rewalidacja `eval` na serwerze** (odrzuca sfałszowany).
**Moduł 11 (powtórki + OG + SEO) — ukończony**: publiczne powtórki
`/replay/:id` (odtwarzacz krok-po-kroku + auto-play, oś czasu, analiza),
podgląd `GET /api/og/:id` (PNG przez `@napi-rs/canvas`), „Skopiuj link", oraz
**kompletne, agent-friendly SEO**: Open Graph + Twitter Cards + JSON-LD
(`WebApplication`/`WebPage`/`Game`), kanoniczne URL-e, `robots.txt`,
`sitemap.xml`, `llms.txt`.

**Moduł 12 (edukacja i społeczność) — ukończony.** Tym samym **wszystkie 12
etapów SPEC §19 jest zamkniętych**:

| | |
|---|---|
| **Komentator AI** (§12.1) | trzeci model komentuje partię po polsku, 1–2 zdania. Dostaje **widok boga** (może widzieć wszystko, bo nie gra) + ocenę ruchu z solvera. Domyślnie wyłączony, chodzi na Twoim kluczu/WebLLM. **Nigdy nie blokuje gry** — kolejka fire-and-forget; spóźniony komentarz trafia pod właściwy ruch. Dymki w logu, zapisywane z partią, widoczne w powtórce. |
| **Karty modeli** (§12.3) | `/model/:id` — radar, przebieg Elo, staty, bilans z przeciwnikami + **opis po polsku dla laika generowany szablonem reguł z metadanych katalogu** (deterministyczny, zero kosztów, *nie* LLM). Stała sekcja **„Jak czytać te liczby?"** (token, Elo, Precyzja, halucynacje ruchów, koszt) linkowana z rankingu. |
| **Laboratorium promptów** (§12.4) | własny dopisek do promptu + suwak `temperature` 0–1.5. Dopisek doklejany **PO** nienaruszalnym rdzeniu, żeby format odpowiedzi przetrwał. Partie z Lab **nie liczą się do Elo**. |
| **Zgadywanka widza** (§12.5) | typ P1/remis/P2 **przed startem** partii (gra czeka na typ). Punkty przyznaje **serwer**, porównując typ ze zwycięzcą z własnego replayu. Ekran **„Ranking intuicji"**. Zero stawek. |
| **Wyzwanie dnia** (§12.6) | „Pokonaj dziś {model} w {gra}" — konfiguracja **liczona z daty** (`seed = data`, **bez crona**), więc przeglądarka i serwer zgadzają się bez komunikacji. Zaliczenie weryfikowane na zapisanej partii (gra, wariant, przeciwnik, wygrana, nie-Lab). Licznik serii. Przeciwnicy zawsze darmowi. |
