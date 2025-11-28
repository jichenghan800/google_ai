const express = require('express');
const router = express.Router();
const sessionManager = require('../services/sessionManager');
const authService = require('../services/authService');

router.use(authService.attachUserSoft);

// Create new session
router.post('/create', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const session = await sessionManager.createSession(null, userId);
    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create session',
      message: error.message
    });
  }
});

// Get existing session
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await sessionManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    if (process.env.AUTH_EMAIL_ENABLED && session.userId && req.user && session.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get session',
      message: error.message
    });
  }
});

// Update session settings
router.put('/:sessionId/settings', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const settings = req.body;
    
    const session = await sessionManager.updateSettings(sessionId, settings);
    
    res.json({
      success: true,
      data: session
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings',
      message: error.message
    });
  }
});

// Delete session (cleanup)
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const deleted = await sessionManager.deleteSession(sessionId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      message: 'Session deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete session',
      message: error.message
    });
  }
});

module.exports = router;
