# Repository Guidelines

## Project Structure & Module Organization
- `backend/`: Express server (`server.js`), REST routes in `routes/`, business logic in `services/`. Backend loads env from repo root (`require('dotenv').config({ path: '../.env' })`).
- `frontend/`: React + TypeScript app. Key dirs: `src/components/`, `src/hooks/`, `src/services/`, `src/types/`, `src/utils/`, `public/`.
- `shared/`: Shared type and helper assets.
- Orchestration: `docker-compose.yml` (backend, frontend, redis). Place Google Cloud SA JSON in repo root and mount in Docker.

## Build, Test, and Development Commands
- Redis (local): `docker run -d -p 6379:6379 redis:7-alpine`
- Backend dev: `cd backend && npm install && npm run dev` (nodemon)
- Backend prod: `cd backend && npm start`
- Backend tests: `cd backend && npm test` (Jest)
- Frontend dev: `cd frontend && npm install && npm start` (proxy to `http://localhost:3001`)
- Frontend build: `cd frontend && npm run build`
- Full stack via Docker: `docker-compose up -d`

## Coding Style & Naming Conventions
- Indentation: 2 spaces; use semicolons and single quotes to match existing code.
- Frontend: PascalCase component files (e.g., `ImageEditWorkflow.tsx`), hooks `useXxx` in `src/hooks/`, types in `src/types/`. Prefer functional components and React hooks.
- Backend: Add endpoints under `backend/routes/*.js` (export an Express router). Put reusable logic in `backend/services/*.js`.
- Imports: Use relative module paths within each package. Keep files small and cohesive.

## Testing Guidelines
- Framework: Jest (both apps). Frontend test runner comes from `react-scripts`.
- Naming: Backend `*.test.js` colocated or under `backend/__tests__/`; Frontend `src/**/*.test.tsx|.ts`.
- Scope: Unit-test services and route handlers; test critical UI flows and state transitions. Aim for meaningful coverage of core paths.

## Commit & Pull Request Guidelines
- Commit messages: Follow Conventional Commits (e.g., `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`) as used in history.
- Branch names: `feature/<short-summary>` or `fix/<issue-id>` (e.g., `feature/system-prompt-editor`).
- PRs must include: clear description, linked issues, reproduction or testing notes; UI changes should include screenshots/GIFs; backend changes should include API notes or example requests.
- Checks: Ensure `npm test` passes for changed packages; verify `docker-compose up -d` boots without errors.

## Security & Configuration Tips
- Never commit Google Cloud credentials; mount the SA JSON into the backend container (e.g., `/app/your-credentials-file.json`).
- Use repo‑root `.env` for backend (e.g., `GOOGLE_CLOUD_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS`, `SERVER_PORT`) and `frontend/.env` for client overrides.
- Keep new APIs under `/api/*`; respect existing CORS and rate limiting settings.

