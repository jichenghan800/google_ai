# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a multi-user AI image generation web application built with Google Vertex AI. It supports session persistence, real-time updates, and concurrent user management. Users can generate images with various parameters, and their data persists across browser refreshes but is cleared when they close the browser tab.

## Architecture

### Frontend (React + TypeScript)
- **Components**: PromptInput, ImageGallery, TaskQueue, ImageModal, etc.
- **Session Management**: Handled via React Context with sessionStorage persistence
- **Real-time Updates**: WebSocket integration for task status updates
- **Styling**: Tailwind CSS with custom components

### Backend (Node.js + Express)
- **Session Management**: Redis-based session storage with TTL
- **Task Queue**: Redis-powered queue for managing image generation tasks
- **WebSocket**: Real-time communication for task updates
- **AI Integration**: Google Vertex AI Gemini 2.5 Flash Image Preview model

### Key Services
- `sessionManager.js`: Manages user sessions with Redis persistence
- `taskQueue.js`: Handles task queuing, processing, and status updates
- `vertexAI.js`: Integrates with Google Vertex AI for image generation
- `websocket.js`: Manages WebSocket connections and real-time updates

## Configuration

Environment variables in `.env`:
- **AI Provider**: `vertex` using Gemini 2.5 Flash Image Preview model
- **Google Cloud**: Project `cotti-coffee-462402` in `us-central1`
- **Redis**: Local Redis instance for session storage and task queue
- **Session TTL**: 24 hours (86400 seconds)
- **Ports**: Backend on 3001, Frontend on 3000
- **Frontend URL**: `FRONTEND_URL` for CORS configuration (update when changing server IP)
- **CORS Origin**: `CORS_ORIGIN` for cross-origin requests (update when changing server IP)

## Common Development Tasks

### Start Development Environment
```bash
# Backend
cd backend && npm run dev

# Frontend  
cd frontend && npm start

# Or use Docker
docker-compose up -d
```

### Add New Components
- Place React components in `frontend/src/components/`
- Follow existing patterns for TypeScript interfaces
- Use Tailwind classes and custom CSS components (btn-primary, input-field, card)

### Modify AI Parameters
- Update parameters in `backend/services/vertexAI.js`
- Corresponding frontend types in `shared/types.ts`
- UI controls in `frontend/src/components/PromptInput.tsx`

### WebSocket Events
- Backend: Add events in `backend/services/websocket.js`
- Frontend: Handle in `frontend/src/services/websocket.ts`
- Update React components to listen for new events

## Key Features Implementation

### Session Persistence
- Sessions auto-created on page load
- Stored in Redis with 24-hour TTL
- Frontend uses sessionStorage for session ID
- Cleanup on browser tab close (beforeunload event)

### Task Queue System
- Redis-based queue for managing concurrent requests
- Real-time status updates via WebSocket
- Automatic retry mechanism for failed tasks
- User can cancel queued tasks

### Multi-user Support
- Each user gets unique session ID
- WebSocket rooms for session isolation
- Independent task queues per session
- Concurrent processing with rate limiting

## Authentication

Service account authentication for Google Cloud:
- Credentials in `cotti-coffee-462402-96fb1983df3e.json`
- Never commit this file to version control
- Path configured via `GOOGLE_APPLICATION_CREDENTIALS` environment variable

## Testing

Start Redis and ensure Google Cloud credentials are properly configured before running the application. The app includes error handling for missing dependencies and connection failures.

## Deployment

### Server Migration/IP Changes

When deploying to a new server or when the public IP changes:

1. **Update Environment Variables**:
   ```bash
   # In .env file, update these values:
   FRONTEND_URL=http://NEW_IP:3000
   CORS_ORIGIN=http://NEW_IP:3000
   ```

2. **Backend CORS Configuration**:
   - CORS is configured to use environment variables
   - No code changes needed, only update `.env`
   - Backend automatically applies CORS for `localhost:3000` and `FRONTEND_URL`

3. **Frontend Configuration**:
   - Uses proxy configuration in `package.json`
   - No changes needed for IP updates
   - API requests are proxied to `localhost:3001` via development server

4. **Docker Deployment**:
   - Service names resolve automatically in Docker networks
   - No IP configuration needed for internal communication
   - Only update external access URLs in environment variables

### Deployment Checklist

- [ ] Update `FRONTEND_URL` and `CORS_ORIGIN` in `.env`
- [ ] Ensure Google Cloud credentials file is accessible
- [ ] Verify Redis connection (local or remote)
- [ ] Test CORS by accessing frontend from new IP
- [ ] Verify WebSocket connections work across domains
- [ ] Check API endpoints respond correctly