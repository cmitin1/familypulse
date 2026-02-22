#!/usr/bin/env bash
set -euo pipefail

echo "==> Pull latest"
git pull --rebase

echo "==> Build & up"
docker compose up -d --build

echo "==> Migrate (safe if none)"
docker compose exec -T backend npx prisma migrate deploy || true

echo "==> Health"
curl -fsS https://api.158.160.226.78.nip.io/health >/dev/null && echo "API OK" || echo "API FAIL"
curl -fsS https://app.158.160.226.78.nip.io >/dev/null && echo "WEB OK" || echo "WEB FAIL"

echo "==> Running"
docker compose ps
