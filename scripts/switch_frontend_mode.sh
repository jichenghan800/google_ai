#!/usr/bin/env bash
set -euo pipefail

# Switch frontend between dev (HMR) and prod (static) on port 3000 using PM2
# Usage: ./scripts/switch_frontend_mode.sh dev|prod

if [ $# -lt 1 ]; then
  echo "Usage: $0 dev|prod" >&2
  exit 1
fi

MODE="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

case "$MODE" in
  dev)
    echo "[switch] Switching to DEV (hot reload) on :3000"
    pm2 delete ai-frontend || true
    pm2 start "$ROOT_DIR/scripts/frontend_dev.sh" --name ai-frontend-dev
    ;;
  prod)
    echo "[switch] Switching to PROD (static build) on :3000"
    pm2 delete ai-frontend-dev || true
    cd "$FRONTEND_DIR"
    npm run build
    pm2 delete ai-frontend || true
    pm2 serve "$FRONTEND_DIR/build" 3000 --spa --name ai-frontend
    ;;
  *)
    echo "Unknown mode: $MODE (use dev|prod)" >&2
    exit 2
    ;;
esac

pm2 save
echo "[done] Current PM2 apps:"; pm2 ls

