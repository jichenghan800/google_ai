#!/usr/bin/env bash
set -euo pipefail

# Run React dev server on :3000 with public access
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/frontend"

# CRA dev server reads env at start time
export HOST=0.0.0.0
export PORT=3000

echo "[dev] Starting React dev server on $HOST:$PORT"
npm start

