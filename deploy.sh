#!/usr/bin/env bash
set -euo pipefail

API_URL="https://api.158.160.226.78.nip.io"
WEB_URL="https://app.158.160.226.78.nip.io"

check_http_alive() {
  local name="$1"
  local url="$2"
  local retries="${3:-8}"

  for i in $(seq 1 "$retries"); do
    code="$(curl -k -sS -o /dev/null -w '%{http_code}' "$url" || echo 000)"

    # Для API считаем живым 200/401/404 (главное, не 502/000)
    case "$code" in
      200|401|404)
        echo "$name OK (http $code)"
        return 0
        ;;
    esac

    echo "$name not ready yet (http $code), retry $i/$retries..."
    sleep 2
  done

  echo "$name FAIL"
  return 1
}

echo "==> Pull latest"
git pull --rebase

echo "==> Build & up"
docker compose up -d --build

echo "==> Sync backend runtime deps + Prisma Client (important for node_modules volume)"
docker compose stop backend || true
docker compose rm -f backend || true
docker compose run --rm backend sh -lc "npm ci && npx prisma generate"

echo "==> Start backend"
docker compose up -d backend

echo "==> Migrate (safe if none)"
docker compose exec -T backend npx prisma migrate deploy || true

echo "==> Refresh caddy upstream"
docker compose restart caddy || true

echo "==> Health (with retries)"
set +e
check_http_alive "API LOCAL" "http://localhost:4000/" 8
API_LOCAL_RC=$?

check_http_alive "API PUBLIC" "$API_URL/" 8
API_PUBLIC_RC=$?

check_http_alive "WEB PUBLIC" "$WEB_URL" 8
WEB_PUBLIC_RC=$?
set -e

echo "==> Running"
docker compose ps

# Не валим деплой жёстко (сохраняем поведение как раньше: показать статус)
if [ "$API_LOCAL_RC" -ne 0 ] || [ "$API_PUBLIC_RC" -ne 0 ] || [ "$WEB_PUBLIC_RC" -ne 0 ]; then
  echo "==> WARNING: one or more checks failed"
fi
