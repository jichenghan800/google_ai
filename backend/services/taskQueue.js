const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const vertexAIService = require('./vertexAI');
const sessionManager = require('./sessionManager');
const storage = require('./storage');
const imageService = require('./imageService');
const db = require('./db');

const parseDataUrl = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches || matches.length < 3) return null;
  const mimeType = matches[1];
  const base64 = matches[2];
  try {
    const buffer = Buffer.from(base64, 'base64');
    return { mimeType, buffer };
  } catch {
    return null;
  }
};

const getImageDimensions = (buffer) => {
  if (!buffer || buffer.length < 24) return null;
  if (buffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      type: 'png'
    };
  }
  let i = 2;
  while (i + 9 < buffer.length) {
    if (buffer[i] !== 0xff) { i++; continue; }
    const marker = buffer[i + 1];
    const len = buffer.readUInt16BE(i + 2);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      return {
        height: buffer.readUInt16BE(i + 5),
        width: buffer.readUInt16BE(i + 7),
        type: 'jpeg'
      };
    }
    i += 2 + len;
  }
  return null;
};

const gcd = (a, b) => {
  let x = Math.abs(a || 0);
  let y = Math.abs(b || 0);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
};

const aspectFromDimensions = (dim) => {
  if (!dim || !dim.width || !dim.height) return null;
  const g = gcd(dim.width, dim.height);
  return `${Math.round(dim.width / g)}:${Math.round(dim.height / g)}`;
};

class TaskQueue {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.queueKey = 'image_generation_queue';
    this.processingKey = 'processing_tasks';
    this.isProcessing = false;
    this.io = null;
    this.init();
  }

  async init() {
    try {
      this.client = redis.createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
        },
        password: process.env.REDIS_PASSWORD || undefined
      });

      this.client.on('error', (err) => {
        console.error('TaskQueue Redis client error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('TaskQueue connected to Redis');
        this.isConnected = true;
        this.startProcessing();
      });

      await this.client.connect();
    } catch (error) {
      console.error('Failed to initialize TaskQueue Redis:', error);
    }
  }

  setSocketIO(io) {
    this.io = io;
  }

  async addTask(sessionId, prompt, parameters = {}, userId = null) {
    if (!this.isConnected) {
      throw new Error('Task queue not connected to Redis');
    }

    const session = await sessionManager.getSession(sessionId);
    const ownerId = userId || (session ? session.userId : null);
    const taskId = uuidv4();
    const task = {
      taskId,
      sessionId,
      prompt,
      parameters,
      userId: ownerId,
      status: 'queued',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Add to queue
    await this.client.lPush(this.queueKey, JSON.stringify(task));

    if (session) {
      if (!session.userId && ownerId) {
        session.userId = ownerId;
      }
      session.queuedTasks.push(task);
      await sessionManager.updateSession(sessionId, { queuedTasks: session.queuedTasks });
    }

    // Notify client via WebSocket
    if (this.io) {
      this.io.to(sessionId).emit('task_queued', task);
    }

    console.log(`Task ${taskId} added to queue for session ${sessionId}`);
    return task;
  }

  async startProcessing() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    console.log('Starting task queue processing...');

    while (this.isProcessing && this.isConnected) {
      try {
        // Get task from queue (blocking with timeout)
        const result = await this.client.brPop(this.queueKey, 5);
        
        if (result && result.element) {
          const task = JSON.parse(result.element);
          await this.processTask(task);
        }
      } catch (error) {
        console.error('Error processing task queue:', error);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retrying
      }
    }
  }

  async processTask(task) {
    try {
      console.log(`Processing task ${task.taskId} for session ${task.sessionId}`);

      // Update task status to processing
      task.status = 'processing';
      task.updatedAt = Date.now();

      // Store in processing set
      await this.client.hSet(this.processingKey, task.taskId, JSON.stringify(task));

      // Update session and notify client
      await this.updateTaskInSession(task);
      if (this.io) {
        this.io.to(task.sessionId).emit('task_processing', task);
      }

      // Validate prompt
      await vertexAIService.validatePrompt(task.prompt);

      // Generate image
      const result = await vertexAIService.generateImage(task.prompt, task.parameters);

      if (result.success) {
        let ownerId = task.userId;
        let session;
        try {
          session = await sessionManager.getSession(task.sessionId);
          if (!ownerId && session && session.userId) {
            ownerId = session.userId;
          }
        } catch {}

        let finalImageUrl = result.imageUrl;
        let uploadedKey = null;
        let storagePublicUrl = null;
        let storageSignedUrl = null;
        let outputDimensions = null;
        let outputMimeType = null;

        const parsed = parseDataUrl(result.imageUrl);
        if (parsed && parsed.buffer) {
          outputDimensions = getImageDimensions(parsed.buffer);
          outputMimeType = parsed.mimeType;
        }

        if (storage.enabled && parsed && parsed.buffer) {
          try {
            const upload = await storage.uploadImageBuffer(parsed.buffer, parsed.mimeType, ownerId || 'anonymous');
            finalImageUrl = upload.signedUrl || upload.url;
            uploadedKey = upload.key;
            storagePublicUrl = upload.url;
            storageSignedUrl = upload.signedUrl || null;
            if (upload.signedUrl) {
              console.log(`[storage] Generated signed URL for preview (expires in ${process.env.S3_SIGNED_URL_EXPIRY || 86400}s)`);
            }
          } catch (err) {
            console.error('Image upload failed, continue with data URL:', err?.message || err);
          }
        }

        // Create generated image object
        const generatedImage = {
          id: task.taskId,
          prompt: task.prompt,
          imageUrl: finalImageUrl,
          parameters: task.parameters,
          userId: ownerId || null,
          sessionId: task.sessionId,
          storageKey: uploadedKey || null,
          metadata: {
            ...result.metadata,
            width: outputDimensions?.width || null,
            height: outputDimensions?.height || null,
            aspectRatio: task.parameters?.aspectRatio || aspectFromDimensions(outputDimensions) || result.metadata?.aspectRatio || null,
            resolution: task.parameters?.imageSize || result.metadata?.imageSize || null,
            mimeType: outputMimeType || result.metadata?.mimeType,
            storage: {
              publicUrl: storagePublicUrl,
              signedUrl: storageSignedUrl
            }
          },
          createdAt: Date.now(),
          status: 'completed'
        };

        // Update task
        task.status = 'completed';
        task.result = generatedImage;
        task.userId = ownerId || null;
        task.updatedAt = Date.now();

        // Add to session history
        await sessionManager.addToHistory(task.sessionId, generatedImage);

        // Persist to database if available
        if (db.enabled) {
          try {
            await imageService.saveGeneratedImage({
              id: task.taskId,
              userId: ownerId,
              prompt: task.prompt,
              model: (result.metadata && result.metadata.model) || null,
              params: task.parameters,
              s3Url: finalImageUrl,
              sessionId: task.sessionId,
              width: outputDimensions?.width || null,
              height: outputDimensions?.height || null,
              aspectRatio: task.parameters?.aspectRatio || aspectFromDimensions(outputDimensions) || null,
              resolution: task.parameters?.imageSize || null
            });
          } catch (err) {
            console.error('saveGeneratedImage failed:', err?.message || err);
          }
        }

        // Remove from processing and update session
        await this.completeTask(task);

        // Notify client
        if (this.io) {
          this.io.to(task.sessionId).emit('task_completed', task);
        }

        console.log(`Task ${task.taskId} completed successfully`);

      } else {
        throw new Error(result.error || 'Image generation failed');
      }

    } catch (error) {
      console.error(`Task ${task.taskId} failed:`, error);

      // Update task status to failed
      task.status = 'failed';
      task.error = error.message || 'Unknown error';
      task.updatedAt = Date.now();

      // Complete task (remove from processing)
      await this.completeTask(task);

      // Notify client
      if (this.io) {
        this.io.to(task.sessionId).emit('task_failed', task);
      }
    }
  }

  async updateTaskInSession(task) {
    try {
      const session = await sessionManager.getSession(task.sessionId);
      if (session) {
        const taskIndex = session.queuedTasks.findIndex(t => t.taskId === task.taskId);
        if (taskIndex !== -1) {
          session.queuedTasks[taskIndex] = task;
          await sessionManager.updateSession(task.sessionId, { queuedTasks: session.queuedTasks });
        }
      }
    } catch (error) {
      console.error('Error updating task in session:', error);
    }
  }

  async completeTask(task) {
    try {
      // Remove from processing set
      await this.client.hDel(this.processingKey, task.taskId);

      // Remove from session queued tasks
      const session = await sessionManager.getSession(task.sessionId);
      if (session) {
        session.queuedTasks = session.queuedTasks.filter(t => t.taskId !== task.taskId);
        await sessionManager.updateSession(task.sessionId, { queuedTasks: session.queuedTasks });
      }
    } catch (error) {
      console.error('Error completing task:', error);
    }
  }

  async getQueueStatus() {
    if (!this.isConnected) {
      return { queueLength: 0, processing: 0 };
    }

    try {
      const queueLength = await this.client.lLen(this.queueKey);
      const processingCount = await this.client.hLen(this.processingKey);

      return {
        queueLength,
        processing: processingCount,
        isProcessing: this.isProcessing
      };
    } catch (error) {
      console.error('Error getting queue status:', error);
      return { queueLength: 0, processing: 0 };
    }
  }

  async cleanup() {
    this.isProcessing = false;
    if (this.client && this.isConnected) {
      await this.client.quit();
    }
  }

  stopProcessing() {
    this.isProcessing = false;
  }
}

const taskQueue = new TaskQueue();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down task queue...');
  taskQueue.stopProcessing();
  await taskQueue.cleanup();
});

module.exports = taskQueue;
