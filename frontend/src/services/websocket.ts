import { io, Socket } from 'socket.io-client';
import { GenerationTask, QueueStatus } from '../types/index.ts';

class WebSocketService {
  private socket: Socket | null = null;
  private sessionId: string | null = null;

  connect(sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.sessionId = sessionId;
        
        const serverUrl = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';
        
        this.socket = io(serverUrl, {
          transports: ['websocket', 'polling'],
          timeout: 5000,
        });

        this.socket.on('connect', () => {
          console.log('WebSocket connected');
          if (this.socket && this.sessionId) {
            this.socket.emit('join_session', this.sessionId);
          }
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('WebSocket connection error:', error);
          reject(error);
        });

        this.socket.on('disconnect', (reason) => {
          console.log('WebSocket disconnected:', reason);
        });

        // Keep connection alive
        this.socket.on('pong', () => {
          // Connection health check response
        });

        // Send ping every 30 seconds
        setInterval(() => {
          if (this.socket?.connected) {
            this.socket.emit('ping');
          }
        }, 30000);

      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.socket) {
      if (this.sessionId) {
        this.socket.emit('leave_session', this.sessionId);
      }
      this.socket.disconnect();
      this.socket = null;
      this.sessionId = null;
    }
  }

  // Event listeners
  onTaskQueued(callback: (task: GenerationTask) => void): void {
    this.socket?.on('task_queued', callback);
  }

  onTaskProcessing(callback: (task: GenerationTask) => void): void {
    this.socket?.on('task_processing', callback);
  }

  onTaskCompleted(callback: (task: GenerationTask) => void): void {
    this.socket?.on('task_completed', callback);
  }

  onTaskFailed(callback: (task: GenerationTask) => void): void {
    this.socket?.on('task_failed', callback);
  }

  onQueueStatus(callback: (status: QueueStatus) => void): void {
    this.socket?.on('queue_status', callback);
  }

  onQueueStatusBroadcast(callback: (status: QueueStatus) => void): void {
    this.socket?.on('queue_status_broadcast', callback);
  }

  onSessionJoined(callback: (data: { sessionId: string; socketId: string }) => void): void {
    this.socket?.on('session_joined', callback);
  }

  onError(callback: (error: any) => void): void {
    this.socket?.on('error', callback);
  }

  // Actions
  getQueueStatus(): void {
    this.socket?.emit('get_queue_status');
  }

  // Remove event listeners
  off(event: string, callback?: Function): void {
    if (callback) {
      this.socket?.off(event, callback);
    } else {
      this.socket?.off(event);
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// Create singleton instance
const webSocketService = new WebSocketService();

export default webSocketService;