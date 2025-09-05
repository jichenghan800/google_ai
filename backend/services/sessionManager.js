const redis = require('redis');
const { v4: uuidv4 } = require('uuid');

class SessionManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.init();
  }

  async init() {
    try {
      this.client = redis.createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
        },
        password: process.env.REDIS_PASSWORD || undefined,
      });

      this.client.on('error', (err) => {
        console.error('Redis client error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Connected to Redis');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
    }
  }

  generateSessionId() {
    return uuidv4();
  }

  getSessionKey(sessionId) {
    return `session:${sessionId}`;
  }

  async createSession(sessionId = null) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    sessionId = sessionId || this.generateSessionId();
    const sessionData = {
      sessionId,
      generationHistory: [],
      editHistory: [], // 新增编辑历史记录
      currentSettings: {
        width: 1024,
        height: 1024,
        aspectRatio: '1:1',
        style: 'natural',
        quality: 'standard'
      },
      queuedTasks: [],
      createdAt: Date.now(),
      lastAccessed: Date.now()
    };

    const key = this.getSessionKey(sessionId);
    const ttl = parseInt(process.env.SESSION_TTL) || 86400; // 24 hours

    await this.client.setEx(key, ttl, JSON.stringify(sessionData));
    return sessionData;
  }

  async getSession(sessionId) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    const key = this.getSessionKey(sessionId);
    const data = await this.client.get(key);
    
    if (!data) {
      return null;
    }

    const sessionData = JSON.parse(data);
    sessionData.lastAccessed = Date.now();
    
    // 向后兼容：确保 editHistory 字段存在
    if (!sessionData.editHistory) {
      sessionData.editHistory = [];
    }
    
    // Extend TTL on access
    const ttl = parseInt(process.env.SESSION_TTL) || 86400;
    await this.client.setEx(key, ttl, JSON.stringify(sessionData));
    
    return sessionData;
  }

  async updateSession(sessionId, updates) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const updatedSession = {
      ...session,
      ...updates,
      lastAccessed: Date.now()
    };

    const key = this.getSessionKey(sessionId);
    const ttl = parseInt(process.env.SESSION_TTL) || 86400;
    
    await this.client.setEx(key, ttl, JSON.stringify(updatedSession));
    return updatedSession;
  }

  async deleteSession(sessionId) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    const key = this.getSessionKey(sessionId);
    const result = await this.client.del(key);
    return result > 0;
  }

  async addToHistory(sessionId, generatedImage) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.generationHistory.unshift(generatedImage);
    
    // Keep only last 50 images to prevent memory issues
    if (session.generationHistory.length > 50) {
      session.generationHistory = session.generationHistory.slice(0, 50);
    }

    return await this.updateSession(sessionId, { generationHistory: session.generationHistory });
  }

  async addToEditHistory(sessionId, editResult) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // 确保 editHistory 存在（向后兼容）
    if (!session.editHistory) {
      session.editHistory = [];
    }

    session.editHistory.unshift(editResult);
    
    // Keep only last 30 edit results to prevent memory issues
    if (session.editHistory.length > 30) {
      session.editHistory = session.editHistory.slice(0, 30);
    }

    return await this.updateSession(sessionId, { editHistory: session.editHistory });
  }

  async updateSettings(sessionId, settings) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const updatedSettings = {
      ...session.currentSettings,
      ...settings
    };

    return await this.updateSession(sessionId, { currentSettings: updatedSettings });
  }

  async cleanup() {
    if (this.client && this.isConnected) {
      await this.client.quit();
    }
  }
}

const sessionManager = new SessionManager();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await sessionManager.cleanup();
  process.exit(0);
});

module.exports = sessionManager;