require('dotenv').config({ path: '../.env' });
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const sessionManager = require('./services/sessionManager');
const taskQueue = require('./services/taskQueue');
const vertexAI = require('./services/vertexAI');
const websocketHandler = require('./services/websocket');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",  // Allow all origins for VPN compatibility
    methods: ["GET", "POST"],
    credentials: false
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: "*",  // Allow all origins for VPN compatibility
  credentials: false
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting - Relaxed for development/testing
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // increased limit per IP to 500 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// API Routes
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/generate', require('./routes/generate'));
app.use('/api/analyze', require('./routes/analyze'));
app.use('/api/edit', require('./routes/edit'));
app.use('/api/auth', require('./routes/auth'));

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
});