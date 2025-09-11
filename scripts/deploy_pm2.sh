#!/usr/bin/env bash
set -euo pipefail

# PM2-based background deployment for this repo
# - Starts Redis (Docker)
# - Starts backend with pm2 (npm start)
# - Builds and serves frontend (pm2 serve)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "[info] Using repo root: $ROOT_DIR"

command -v pm2 >/dev/null 2>&1 || {
  echo "[info] Installing pm2 globally..."
  npm i -g pm2
}

echo "[step] Ensure Redis running on port 6379"
if ! docker ps --format '{{.Names}}' | grep -q '^ai-generator-redis$'; then
  if docker ps -a --format '{{.Names}}' | grep -q '^ai-generator-redis$'; then
    echo "[info] Starting existing redis container..."
    docker start ai-generator-redis >/dev/null
  else
    echo "[info] Launching new redis:7-alpine container..."
    docker run -d --name ai-generator-redis -p 6379:6379 redis:7-alpine >/dev/null
  fi
else
  echo "[ok] Redis is running."
fi

echo "[step] Backend: install deps if needed"
cd "$BACKEND_DIR"
if [ ! -d node_modules ]; then
  npm ci
fi

echo "[step] Start/Reload backend via pm2"
if pm2 describe ai-backend >/dev/null 2>&1; then
  pm2 reload ai-backend --update-env
else
  pm2 start npm --name ai-backend -- run start
fi

echo "[step] Frontend: install deps and build"
cd "$FRONTEND_DIR"
if [ ! -d node_modules ]; then
  npm ci
fi

# Ensure .env exists so build embeds correct API endpoints
if [ ! -f .env ]; then
  echo "[warn] frontend/.env not found. Creating a default pointing to localhost."
  cat > .env <<EOF
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_SOCKET_URL=http://localhost:3001
EOF
fi

npm run build

echo "[step] Serve frontend build via pm2"
if pm2 describe ai-frontend >/dev/null 2>&1; then
  pm2 delete ai-frontend >/dev/null || true
fi
pm2 serve "$FRONTEND_DIR/build" 3000 --spa --name ai-frontend

echo "[step] Save PM2 state and enable startup"
pm2 save
pm2 startup -u "$(whoami)" --hp "$HOME" | sed -n 's/^\(.*sudo.*pm2-init.*\)$/\1/p'

echo "[done] Backend on :3001, Frontend on :3000"
echo "[hint] Verify: curl -I http://127.0.0.1:3000 | head -n1"

