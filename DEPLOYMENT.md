# Deployment Guide

This repo already includes scripts and configs for safe, non‑intrusive deployment on ports 3000/3001 without touching your existing Nginx on port 80.

## PM2 (Public, recommended)
- Start both services on 3000/3001 (no change to :80):
  - `cd /root/google_ai`
  - `bash scripts/deploy_pm2_public.sh <your-ip-or-domain>`
- What it does: ensures Redis (if not already running), starts backend via PM2, builds and serves frontend via `pm2 serve` on `:3000`.
- Verify: `pm2 ls`, `curl -I http://127.0.0.1:3000`, open `http://<host>:3000/`.
- Logs: `pm2 logs ai-backend`, `pm2 logs ai-frontend`.
- Firewall/SG: allow TCP 3000, 3001.

## Frontend Dev (hot reload on :3000)
- Purpose: avoid rebuilding on each change; use CRA dev server with HMR.
- Start dev: `pm2 delete ai-frontend; pm2 start scripts/frontend_dev.sh --name ai-frontend-dev`
- Switch via helper: `./scripts/switch_frontend_mode.sh dev` (to dev) or `./scripts/switch_frontend_mode.sh prod` (to static build)
- Ensure `frontend/.env` points API to your host (e.g., `REACT_APP_API_URL=http://<host>:3001/api`).

## PM2 (Local default)
- One‑liner for localhost API during development: `bash scripts/deploy_pm2.sh`
- Serves frontend build on `:3000`, backend on `:3001`.

## Nohup (quick alternative)
- Backend: `cd backend && nohup npm start > ../backend.log 2>&1 & echo $! > ../backend.pid`
- Frontend dev server: `cd frontend && PORT=3000 HOST=0.0.0.0 nohup npm start > ../frontend.log 2>&1 & echo $! > ../frontend.pid`
- Stop: `kill $(cat ../backend.pid)` / `kill $(cat ../frontend.pid)`.

## Docker Compose (optional)
- `docker-compose up -d` runs Redis, backend (:3001), frontend (:3000); may conflict if ports in use.
- Stop: `docker-compose down`.

## Nginx (optional, port 80)
- Example config: `deploy/nginx.ai-generator.conf`.
- Use only if you want `http://<host>/` without `:3000`. Do not apply if port 80 is already used by other sites.

## Troubleshooting
- Port busy: stop old frontend container `docker stop ai-generator-frontend`, then re‑run PM2 script.
- Frontend 404/API errors: ensure `frontend/.env` points to `http://<host>:3001` then rebuild.
- Health check: `curl -s http://127.0.0.1:3001/health`.
