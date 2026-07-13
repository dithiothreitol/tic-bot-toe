# Runbook — deploy tic-bot-toe (ticbottoe.lol) na VPS

Aplikacja dzieli VPS z `grzybiarz` (Hetzner CPX22, `167.233.57.77`, Ubuntu,
`root` + klucz SSH `~/.ssh/id_ed25519`). Stacki sa **niezalezne** — jedyny punkt
styku to wspolny **Caddy** (kontener grzybiarza, trzyma `:80`/`:443`), ktory
proxuje `ticbottoe.lol` do kontenera `ticbottoe-app`.

| Fakt | Wartosc |
|---|---|
| Host | `root@167.233.57.77` |
| Katalog stacku | `/opt/ticbottoe/deploy` |
| Pliki compose | `docker-compose.prod.yml` (samodzielny, BEZ overlaya) |
| Obraz | `ticbottoe-app:local` (budowany NA serwerze) |
| Sekrety | `/opt/ticbottoe/deploy/.env` (600, poza gitem) |
| Site-block Caddy | `/opt/caddy/conf.d/ticbottoe.caddy` (poza drzewem grzybiarza) |
| Baza | wlasny kontener `ticbottoe-postgres` (Postgres 16), wolumen `ticbottoe_pgdata` |
| Domena | `ticbottoe.lol` + `www` -> `167.233.57.77`, Cloudflare proxy OFF |

## Jak to jest zszyte z grzybiarzem

Wspolny Caddy grzybiarza ma w `Caddyfile` linie
`import /etc/caddy/conf.d/*.caddy` oraz mount `/opt/caddy/conf.d`. Nasz
site-block lezy WLASNIE tam — **poza** `/opt/grzybiarz/services/`, wiec deploy
grzybiarza (`git archive services | tar -x`) go nie nadpisuje. Kontener
`ticbottoe-app` dolacza sie do sieci `grzybiarz_grz` (`external: true`), dzieki
czemu Caddy rozwiazuje go po nazwie.

> **Warunek jednorazowy:** zmiany w repo grzybiarza (import + mount conf.d) musza
> byc wdrozone RAZ przed pierwszym deployem ticbottoe. Patrz sekcja "Bootstrap".

---

## Bootstrap (jednorazowo)

### 1. Wlacz conf.d we wspolnym Caddy (repo grzybiarz)
Zmiany sa juz w `grzybiarz-mono` na branchu `deploy/sesja5-prod`:
- `services/deploy/docker/Caddyfile` — dodane `import /etc/caddy/conf.d/*.caddy`
- `services/deploy/docker/docker-compose.caddy.yml` — mount `/opt/caddy/conf.d`

Na serwerze utworz katalog i wgraj site-block ZANIM przeladujesz Caddy
(pusty glob potrafi wysypac start Caddy — a to wspolny proxy dla obu apek):
```bash
ssh root@167.233.57.77 'mkdir -p /opt/caddy/conf.d'
# (site-block wgra sam deploy.sh w kroku [3/6], albo recznie:)
scp deploy/caddy/ticbottoe.caddy root@167.233.57.77:/opt/caddy/conf.d/
```
Wdroz zmiane Caddyfile grzybiarza (z jego repo, branch deploy/sesja5-prod):
```bash
git archive deploy/sesja5-prod services | ssh root@167.233.57.77 'tar -x -C /opt/grzybiarz'
ssh root@167.233.57.77 'cd /opt/grzybiarz/services/deploy/docker && \
  docker compose -f docker-compose.prod.yml -f docker-compose.caddy.yml up -d caddy'
```

### 2. DNS (Cloudflare, zona ticbottoe.lol)
Rekordy A, **proxy OFF (szara chmurka)** — inaczej Caddy nie wyda certu:
```
@    A  167.233.57.77   (DNS only)
www  A  167.233.57.77   (DNS only)
```

### 3. Sekrety na serwerze
```bash
ssh root@167.233.57.77 'mkdir -p /opt/ticbottoe/deploy'
# Utworz /opt/ticbottoe/deploy/.env wg deploy/.env.prod.example, np.:
cat <<'EOF' | ssh root@167.233.57.77 'cat > /opt/ticbottoe/deploy/.env && chmod 600 /opt/ticbottoe/deploy/.env'
POSTGRES_PASSWORD=<openssl rand -hex 24>
JWT_SECRET=<openssl rand -hex 32>
TURNSTILE_SECRET=<sekret z panelu Cloudflare Turnstile>
VITE_TURNSTILE_SITE_KEY=<site key z panelu Cloudflare Turnstile>
ENABLE_OLLAMA=false
EOF
```

### 4. (Zalecane) Zwolnij RAM — usun martwy MinIO grzybiarza
Storage grzybiarza przeniesiono na Cloudflare R2; kontener MinIO to balast
(~320 MB). RAM na VPS jest ciasny, a `vite build` jest pamieciozerny:
```bash
ssh root@167.233.57.77 'cd /opt/grzybiarz/services/deploy/docker && \
  docker compose -f docker-compose.prod.yml -f docker-compose.caddy.yml stop minio minio-init'
```

---

## Deploy / redeploy (rutyna)

Z korzenia repo tic-bot-toe:
```bash
git add -A && git commit -m "..."   # git archive czyta z commita
./deploy/deploy.sh                  # HEAD; albo ./deploy/deploy.sh <ref>
```
Skrypt: wysyla zrodla -> sprawdza `.env` -> instaluje site-block ->
buduje obraz -> `up -d` -> reload Caddy -> health check.

Migracje Drizzle wstaja **automatycznie** przy starcie kontenera.

## Weryfikacja
```bash
curl -sf https://ticbottoe.lol/api/health          # {"ok":true,...}
curl -I  https://ticbottoe.lol                     # 200, naglowki CSP/HSTS
curl -sI https://ticbottoe.lol/api/og/<matchId>    # image/png (OG, @napi-rs/canvas)
curl -I  https://www.ticbottoe.lol                 # 301 -> https://ticbottoe.lol
```

## Rollback
```bash
./deploy/deploy.sh <poprzedni-commit-sha>
# lub tylko restart poprzedniego obrazu:
ssh root@167.233.57.77 'cd /opt/ticbottoe/deploy && docker compose -f docker-compose.prod.yml up -d'
```

## Logi
```bash
ssh root@167.233.57.77 'docker logs -f --tail=100 ticbottoe-app'
ssh root@167.233.57.77 'docker logs -f --tail=100 ticbottoe-postgres'
ssh root@167.233.57.77 'docker logs -f --tail=100 grzybiarz-caddy-1'   # wspolny proxy
```

## Backup bazy (cron)
Grzybiarz dumpuje o 03:30 — my o 04:30, zeby sie nie nakladac:
```bash
ssh root@167.233.57.77 'mkdir -p /opt/ticbottoe/backups'
# crontab -e na serwerze:
30 4 * * * docker exec ticbottoe-postgres pg_dump -U ticbottoe -Fc ticbottoe > /opt/ticbottoe/backups/ticbottoe-$(date +\%F).dump && find /opt/ticbottoe/backups -name '*.dump' -mtime +14 -delete
```
Restore:
```bash
ssh root@167.233.57.77 'docker exec -i ticbottoe-postgres pg_restore -U ticbottoe -d ticbottoe --clean' < backup.dump
```

## Pulapki
- **Site key jest wkompilowany w bundle** — zmiana Turnstile SITE key wymaga
  `docker compose build`, nie samego restartu. SECRET key wystarczy podmienic
  w `.env` + `up -d`.
- **Nie usuwaj `/opt/caddy/conf.d/ticbottoe.caddy`** — bez niego Caddy przestaje
  proxowac ticbottoe (a pusty katalog moze wysypac start Caddy dla OBU apek).
- **Jedna instancja** — rate-limity i cache leaderboarda sa w pamieci procesu.
  Nie skaluj do >1 repliki bez Redisa.
- **RAM** — jesli `vite build` dostanie OOM-kill: zbuduj obraz lokalnie i
  `docker save ticbottoe-app:local | ssh root@167.233.57.77 'docker load'`,
  potem `up -d` bez `build`.
