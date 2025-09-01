const express = require('express');
const router = express.Router();
const taskQueue = require('../services/taskQueue');
const sessionManager = require('../services/sessionManager');
const vertexAIService = require('../services/vertexAI');

// Generate image endpoint
router.post('/image', async (req, res) => {
  try {
    const { sessionId, prompt, parameters = {} } = req.body;

    // Validate required fields
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    // Validate session exists
    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Validate prompt
    try {
      await vertexAIService.validatePrompt(prompt);
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid prompt',
        message: validationError.message
      });
    }

    // Add task to queue
    const task = await taskQueue.addTask(sessionId, prompt, parameters);

    res.json({
      success: true,
      data: task,
      message: 'Image generation task queued successfully'
    });

  } catch (error) {
    console.error('Error in generate image endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to queue image generation task',
      message: error.message
    });
  }
});

// Get generation history
router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const history = session.generationHistory.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        history,
        total: session.generationHistory.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Error getting generation history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get generation history',
      message: error.message
    });
  }
});

// Get queue status for session
router.get('/queue/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const globalStatus = await taskQueue.getQueueStatus();

    res.json({
      success: true,
      data: {
        queuedTasks: session.queuedTasks,
        globalQueue: globalStatus
      }
    });

  } catch (error) {
    console.error('Error getting queue status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get queue status',
      message: error.message
    });
  }
});

// Cancel queued task (if not yet processing)
router.delete('/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Find task in session
    const taskIndex = session.queuedTasks.findIndex(task => task.taskId === taskId);
    if (taskIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    const task = session.queuedTasks[taskIndex];

    // Only allow cancellation if task is queued
    if (task.status !== 'queued') {
      return res.status(400).json({
        success: false,
        error: 'Task cannot be cancelled',
        message: `Task is currently ${task.status}`
      });
    }

    // Remove from session
    session.queuedTasks.splice(taskIndex, 1);
    await sessionManager.updateSession(sessionId, { queuedTasks: session.queuedTasks });

    res.json({
      success: true,
      message: 'Task cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel task',
      message: error.message
    });
  }
});

module.exports = router;