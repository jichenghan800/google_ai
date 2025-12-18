// 优先使用 .env 中的值，必要时覆盖系统环境变量
require('dotenv').config({ path: '../.env', override: true });
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const sessionManager = require('./services/sessionManager');
const taskQueue = require('./services/taskQueue');
const vertexAI = require('./services/vertexAI');
const websocketHandler = require('./services/websocket');
const authService = require('./services/authService');

const app = express();
const server = http.createServer(app);
const emailAuthEnabled = authService.isEmailAuthEnabled();
const rawCors = process.env.CORS_ORIGIN;
const allowAnyOrigin = !rawCors || rawCors === '*';
const parsedOrigins = (() => {
  if (allowAnyOrigin) {
    // dynamic allow (reflect request origin)
    return null;
  }
  return rawCors.split(',').map((o) => o.trim()).filter(Boolean);
})();
const corsCredentials = true; // frontend sends withCredentials even when auth is off
const io = socketIo(server, {
  cors: {
    origin: parsedOrigins || "*", // socket.io allows wildcard; HTTP CORS handled below
    methods: ["GET", "POST"],
    credentials: corsCredentials
  }
});

// Middleware
app.use(helmet());
if (allowAnyOrigin) {
  app.use(cors({
    origin: (origin, callback) => callback(null, true),
    credentials: corsCredentials
  }));
} else {
  app.use(cors({
    origin: parsedOrigins,
    credentials: corsCredentials
  }));
}
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(authService.attachUserSoft);

// Rate limiting - Relaxed for development/testing
const enableRateLimit = process.env.ENABLE_RATE_LIMIT === 'true' || process.env.ENABLE_RATE_LIMIT === '1';
if (enableRateLimit) {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500,
    message: { success: false, error: 'Too many requests', message: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);
  console.log('[rate-limit] Enabled (500/15min per IP)');
} else {
  console.log('[rate-limit] Disabled');
}

// API Routes
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/generate', require('./routes/generate'));
app.use('/api/analyze', require('./routes/analyze'));
app.use('/api/edit', require('./routes/edit'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/recognition', require('./routes/recognition'));
app.use('/api/ui', require('./routes/ui'));
app.use('/api/translate', require('./routes/translate'));
app.use('/api/system-prompts', require('./routes/systemPrompts'));
app.use('/api/images', require('./routes/images'));
app.use('/api/photo-wall', require('./routes/photoWall'));
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// WebSocket handling
websocketHandler(io);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: 'Something went wrong!'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    message: 'Route not found'
  });
});

const PORT = process.env.SERVER_PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  // 明确显示当前 AI 初始化模式（API Key / Vertex）
  try {
    console.log(`[AI Provider] GoogleGenAI: Vertex AI mode (project=${process.env.GOOGLE_CLOUD_PROJECT}, location=${process.env.GOOGLE_CLOUD_LOCATION || 'global'})`);
  } catch (e) {
    console.warn('[AI Provider] Unable to determine AI mode:', e?.message || e);
  }
});
