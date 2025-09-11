#!/usr/bin/env bash
# One-click restart script for frontend (3000) and backend (3001)
# Supports dev and prod, optional pm2, safe port killing, logs, and readiness checks

set -euo pipefail

# -------- Defaults --------
MODE="dev"                 # dev | prod
INSTALL=true               # run npm install
USE_PM2=false              # manage with pm2
REBUILD_FRONT=false        # rebuild frontend (prod)
SKIP_FRONT=false
SKIP_BACK=false
FRONT_PORT="${FRONTEND_PORT:-3000}"
BACK_PORT="${SERVER_PORT:-3001}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACK_DIR="$ROOT_DIR/backend"
FRONT_DIR="$ROOT_DIR/frontend"
BACK_LOG="$ROOT_DIR/backend.log"
FRONT_LOG="$ROOT_DIR/frontend.log"
BACK_PID="$ROOT_DIR/backend.pid"
FRONT_PID="$ROOT_DIR/frontend.pid"

# -------- Helpers --------
usage() {
  cat <<EOF
Usage: bash scripts/restart.sh [options]

Options:
  -m, --mode <dev|prod>       Run in development (default) or production mode
  --no-install                Skip npm install
  --pm2                       Use pm2 to manage processes
  --rebuild-frontend          Force rebuild frontend (prod recommended)
  --skip-frontend             Do not touch frontend
  --skip-backend              Do not touch backend
  --front-port <port>         Frontend port (default: ${FRONT_PORT})
  --back-port <port>          Backend port  (default: ${BACK_PORT})
  -h, --help                  Show this help

Examples:
  bash scripts/restart.sh --mode dev
  bash scripts/restart.sh --mode prod --rebuild-frontend
  FRONTEND_PORT=8080 SERVER_PORT=4000 bash scripts/restart.sh -m prod
EOF
}

log()  { echo -e "\033[1;34m[INFO]\033[0m $*"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m $*"; }
err()  { echo -e "\033[1;31m[ERR ]\033[0m $*" 1>&2; }

have() { command -v "$1" >/dev/null 2>&1; }

kill_by_port() {
  local port="$1"
  if have fuser; then
    fuser -k "${port}/tcp" 2>/dev/null || true
  elif have lsof; then
    local pids
    pids=$(lsof -ti tcp:"$port" || true)
    [[ -n "$pids" ]] && kill -9 $pids || true
  elif have ss; then
    local pids
    pids=$(ss -lptn | awk -v P=":$port" '$4 ~ P {print $6}' | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u)
    [[ -n "$pids" ]] && kill -9 $pids || true
  else
    warn "No fuser/lsof/ss available to free port $port"
  fi
}

kill_pidfile() {
  local pidfile="$1"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid=$(cat "$pidfile" || true)
    if [[ -n "${pid}" ]] && ps -p "$pid" >/dev/null 2>&1; then
      kill "$pid" 2>/dev/null || true
      sleep 0.5
      ps -p "$pid" >/dev/null 2>&1 && kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile" || true
  fi
}

wait_port() {
  local port="$1"; local timeout="${2:-25}"
  local t=0
  while (( t < timeout )); do
    if bash -c ">/dev/tcp/127.0.0.1/$port" 2>/dev/null; then
      return 0
    fi
    sleep 1; t=$((t+1))
  done
  return 1
}

# -------- Parse args --------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--mode) MODE="$2"; shift 2;;
    --no-install) INSTALL=false; shift;;
    --pm2) USE_PM2=true; shift;;
    --rebuild-frontend) REBUILD_FRONT=true; shift;;
    --skip-frontend) SKIP_FRONT=true; shift;;
    --skip-backend) SKIP_BACK=true; shift;;
    --front-port) FRONT_PORT="$2"; shift 2;;
    --back-port) BACK_PORT="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) err "Unknown argument: $1"; usage; exit 1;;
  esac
done

MODE=$(echo "$MODE" | tr '[:upper:]' '[:lower:]')
[[ "$MODE" != "dev" && "$MODE" != "prod" ]] && { err "--mode must be dev or prod"; exit 1; }

log "Mode: $MODE | pm2: $USE_PM2 | install: $INSTALL | front:$FRONT_PORT back:$BACK_PORT"

# -------- Backend --------
start_backend_dev() {
  log "Starting backend (dev) on :$BACK_PORT"
  pushd "$BACK_DIR" >/dev/null
  $INSTALL && npm install
  kill_pidfile "$BACK_PID"; kill_by_port "$BACK_PORT"
  if $USE_PM2 && have pm2; then
    pm2 delete backend 2>/dev/null || true
    pm2 start npm --name backend -- run dev
  else
    nohup npm run dev >"$BACK_LOG" 2>&1 & echo $! >"$BACK_PID"
  fi
  popd >/dev/null
  wait_port "$BACK_PORT" 25 || warn "Backend did not open :$BACK_PORT within 25s"
}

start_backend_prod() {
  log "Starting backend (prod) on :$BACK_PORT"
  pushd "$BACK_DIR" >/dev/null
  $INSTALL && npm install
  kill_pidfile "$BACK_PID"; kill_by_port "$BACK_PORT"
  if $USE_PM2 && have pm2; then
    pm2 delete backend 2>/dev/null || true
    pm2 start npm --name backend -- run start
  else
    nohup npm start >"$BACK_LOG" 2>&1 & echo $! >"$BACK_PID"
  fi
  popd >/dev/null
  wait_port "$BACK_PORT" 25 || warn "Backend did not open :$BACK_PORT within 25s"
}

# -------- Frontend --------
start_frontend_dev() {
  log "Starting frontend (dev) on :$FRONT_PORT"
  pushd "$FRONT_DIR" >/dev/null
  $INSTALL && npm install
  kill_pidfile "$FRONT_PID"; kill_by_port "$FRONT_PORT"
  if $USE_PM2 && have pm2; then
    pm2 delete frontend 2>/dev/null || true
    pm2 start npm --name frontend -- run start
  else
    # CRA dev server binds port from env if provided
    FRONTEND_PORT="$FRONT_PORT" nohup npm start >"$FRONT_LOG" 2>&1 & echo $! >"$FRONT_PID"
  fi
  popd >/dev/null
  wait_port "$FRONT_PORT" 30 || warn "Frontend did not open :$FRONT_PORT within 30s"
}

start_frontend_prod() {
  log "Starting frontend (prod) on :$FRONT_PORT"
  pushd "$FRONT_DIR" >/dev/null
  $INSTALL && npm install
  # Build always recommended in prod
  npm run build
  kill_pidfile "$FRONT_PID"; kill_by_port "$FRONT_PORT"
  if $USE_PM2 && have pm2; then
    pm2 delete frontend 2>/dev/null || true
    pm2 start npx --name frontend -- serve -s build -l "$FRONT_PORT"
  else
    nohup npx serve -s build -l "$FRONT_PORT" >"$FRONT_LOG" 2>&1 & echo $! >"$FRONT_PID"
  fi
  popd >/dev/null
  wait_port "$FRONT_PORT" 25 || warn "Frontend did not open :$FRONT_PORT within 25s"
}

# -------- Orchestration --------
if ! $SKIP_BACK; then
  if [[ "$MODE" == "dev" ]]; then
    start_backend_dev
  else
    start_backend_prod
  fi
else
  log "Skip backend by flag"
fi

if ! $SKIP_FRONT; then
  if [[ "$MODE" == "dev" ]]; then
    start_frontend_dev
  else
    start_frontend_prod
  fi
else
  log "Skip frontend by flag"
fi

log "Done. Logs:"
[[ -f "$BACK_LOG" ]] && log "  Backend -> $BACK_LOG"
[[ -f "$FRONT_LOG" ]] && log "  Frontend -> $FRONT_LOG"

exit 0

