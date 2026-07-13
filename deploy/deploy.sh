#!/usr/bin/env bash
# =============================================================================
# Reczny deploy tic-bot-toe na VPS (ten sam serwer co grzybiarz).
# Wzorzec taki jak grzybiarz: git archive -> ssh tar -x -> build+up NA serwerze.
#
# Uzycie (z korzenia repo):   ./deploy/deploy.sh
#
# Wymaga: dzialajacy `ssh root@167.233.57.77` (klucz ~/.ssh/id_ed25519),
# oraz /opt/ticbottoe/deploy/.env juz obecny na serwerze (wgraj recznie przy
# pierwszym deployu — patrz docs/runbook-deploy-vps.md).
# =============================================================================
set -euo pipefail

HOST="${TICBOTTOE_HOST:-root@167.233.57.77}"
REMOTE_DIR="/opt/ticbottoe"
STACK_DIR="$REMOTE_DIR/deploy"
CADDY_CONF_DIR="/opt/caddy/conf.d"
REF="${1:-HEAD}"

cd "$(dirname "$0")/.."

echo "==> [1/6] Wysylam zrodla ($REF) do $HOST:$REMOTE_DIR"
ssh "$HOST" "mkdir -p $REMOTE_DIR"
git archive "$REF" | ssh "$HOST" "tar -x -C $REMOTE_DIR"

echo "==> [2/6] Sprawdzam sekrety na serwerze"
if ! ssh "$HOST" "test -f $STACK_DIR/.env"; then
  echo "BLAD: brak $STACK_DIR/.env na serwerze." >&2
  echo "      Wgraj go recznie (patrz runbook), potem uruchom ponownie." >&2
  exit 1
fi

echo "==> [3/6] Instaluje site-block Caddy w $CADDY_CONF_DIR (poza drzewem grzybiarza)"
ssh "$HOST" "mkdir -p $CADDY_CONF_DIR && cp $STACK_DIR/caddy/ticbottoe.caddy $CADDY_CONF_DIR/ticbottoe.caddy"

echo "==> [4/6] Buduje obraz NA serwerze (site key z .env jako build-arg)"
ssh "$HOST" "cd $STACK_DIR && set -a && . ./.env && set +a && \
  docker compose -f docker-compose.prod.yml build \
    --build-arg VITE_TURNSTILE_SITE_KEY=\"\$VITE_TURNSTILE_SITE_KEY\""

echo "==> [5/6] Podnosze stack (migracje Drizzle wstaja same przy starcie)"
ssh "$HOST" "cd $STACK_DIR && docker compose -f docker-compose.prod.yml up -d"

echo "==> [5b] Przeladowuje wspolny Caddy grzybiarza (nowy site-block)"
ssh "$HOST" "docker exec grzybiarz-caddy-1 caddy reload --config /etc/caddy/Caddyfile || \
  (cd /opt/grzybiarz/services/deploy/docker && \
   docker compose -f docker-compose.prod.yml -f docker-compose.caddy.yml up -d caddy)"

echo "==> [6/6] Health check (wewnatrz sieci docker)"
sleep 5
ssh "$HOST" "docker exec ticbottoe-app wget -q -O - http://localhost:8080/api/health && echo"

echo ""
echo "OK. Sprawdz publicznie: curl -I https://ticbottoe.lol"
