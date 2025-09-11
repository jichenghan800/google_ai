#!/usr/bin/env bash
set -euo pipefail

# Public PM2 deployment helper
# Usage: ./scripts/deploy_pm2_public.sh <domain-or-ip>

if [ $# -lt 1 ]; then
  echo "Usage: $0 <domain-or-ip>" >&2
  exit 1
fi

PUBLIC_HOST="$1" # e.g., 47.236.135.3 or your.domain.com

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "[info] Repo root: $ROOT_DIR"
echo "[info] Target host: $PUBLIC_HOST"

command -v pm2 >/dev/null 2>&1 || {
  echo "[info] Installing pm2 globally..."
  npm i -g pm2
}

echo "[step] Ensure Redis running on port 6379"
if ! docker ps --format '{{.Names}}' | grep -q '^ai-generator-redis$'; then
  if docker ps -a --format '{{.Names}}' | grep -q '^ai-generator-redis$'; then
    docker start ai-generator-redis >/dev/null || echo "[warn] Failed to start redis container; continuing (likely already running on host)."
  else
    docker run -d --name ai-generator-redis -p 6379:6379 redis:7-alpine >/dev/null \
      || echo "[warn] Failed to launch redis container (port busy?); continuing as Redis may already be running."
  fi
fi

echo "[step] Backend: install deps if needed and start"
cd "$BACKEND_DIR"
[ -d node_modules ] || npm ci
if pm2 describe ai-backend >/dev/null 2>&1; then
  pm2 reload ai-backend --update-env
else
  pm2 start npm --name ai-backend -- run start
fi

echo "[step] Frontend: configure public API endpoints -> $PUBLIC_HOST"
cd "$FRONTEND_DIR"
cat > .env <<EOF
REACT_APP_API_URL=http://$PUBLIC_HOST:3001/api
REACT_APP_SOCKET_URL=http://$PUBLIC_HOST:3001
EOF

[ -d node_modules ] || npm ci
npm run build

echo "[step] Serve frontend build via pm2 on :3000"
if pm2 describe ai-frontend >/dev/null 2>&1; then
  pm2 delete ai-frontend >/dev/null || true
fi
pm2 serve "$FRONTEND_DIR/build" 3000 --spa --name ai-frontend

echo "[step] Save PM2 state and enable startup"
pm2 save
pm2 startup -u "$(whoami)" --hp "$HOME" | sed -n 's/^\(.*sudo.*pm2-init.*\)$/\1/p'

echo "[done] Public deployment ready:"
echo "- Frontend: http://$PUBLIC_HOST:3000"
echo "- Backend API: http://$PUBLIC_HOST:3001/api"
