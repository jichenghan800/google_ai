const taskQueue = require('./taskQueue');

function handleWebSocket(io) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Join session room
    socket.on('join_session', (sessionId) => {
      socket.join(sessionId);
      console.log(`Socket ${socket.id} joined session ${sessionId}`);
      
      socket.emit('session_joined', { sessionId, socketId: socket.id });
    });

    // Leave session room
    socket.on('leave_session', (sessionId) => {
      socket.leave(sessionId);
      console.log(`Socket ${socket.id} left session ${sessionId}`);
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });

    // Get queue status
    socket.on('get_queue_status', async () => {
      try {
        const status = await taskQueue.getQueueStatus();
        socket.emit('queue_status', status);
      } catch (error) {
        socket.emit('error', { message: 'Failed to get queue status' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  // Set task queue socket reference
  taskQueue.setSocketIO(io);

  // Broadcast queue status periodically
  setInterval(async () => {
    try {
      const status = await taskQueue.getQueueStatus();
      io.emit('queue_status_broadcast', status);
    } catch (error) {
      console.error('Error broadcasting queue status:', error);
    }
  }, 30000); // Every 30 seconds

  console.log('WebSocket handler initialized');
}

module.exports = handleWebSocket;