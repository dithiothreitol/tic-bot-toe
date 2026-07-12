# tic-bot-toe — LLM Game Arena

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
| [`apps/web`](./apps/web) | Frontend: Vite 8 + React 19 + TS + Tailwind 4 + shadcn/ui + Zustand |
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
- [x] `player_token` = losowy UUID, bez danych osobowych.

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

## Testy

**~150 testów** (game-core 76, server 14 unit + 10 integracyjnych testcontainers, web 37).
Priorytet pokrycia: `game-core` (silniki, solvery, Elo, replay, parsery).

## Znane ograniczenia

- Gra toczy się w przeglądarce — pełnej gwarancji uczciwości nie ma (warstwy obrony w §15); wyjątek: partie Ollama (`server_verified`).
- „Śr. czas" w rankingu liczony ze średniej (mediana z `matches` — moduł §9+).
- Solvery/analiza po partii, wykresy, komentator, powtórki OG, laboratorium, zgadywanka i wyzwanie dnia to moduły 9–12 (po rdzeniu 1–8).

## Status budowy

**Rdzeń 1–8 (wdrażalny produkt) — ukończony.** Moduły 9–12 (telemetria/wykresy,
analiza+solvery, powtórki+OG, edukacja/społeczność) dokładane na działającym rdzeniu.
