const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const imageService = require('../services/imageService');
const db = require('../services/db');

const requireAuth = authService.attachUserIfEnabled;

// Public listing
router.get('/', async (req, res) => {
  try {
    if (!db.enabled) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
    const offset = parseInt(req.query.offset || '0', 10);
    const { items, total } = await imageService.listPhotoWall(limit, offset);
    res.json({ success: true, data: { items, total, limit, offset } });
  } catch (error) {
    console.error('List photo wall error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch photo wall', message: error.message });
  }
});

// Publish to wall
router.post('/:imageId/publish', requireAuth, async (req, res) => {
  try {
    if (!db.enabled) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }
    const imageId = req.params.imageId;
    const image = await imageService.getImageById(imageId);
    if (!image) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }
    if (image.user_id && req.user && image.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const promptSnapshot = image.prompt;
    const published = await imageService.publishToWall({
      imageId,
      userId: req.user ? req.user.id : null,
      promptSnapshot
    });
    res.json({ success: true, data: published });
  } catch (error) {
    console.error('Publish wall error:', error);
    res.status(500).json({ success: false, error: 'Failed to publish', message: error.message });
  }
});

// Unpublish
router.delete('/:imageId/publish', requireAuth, async (req, res) => {
  try {
    if (!db.enabled) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }
    const imageId = req.params.imageId;
    const image = await imageService.getImageById(imageId);
    if (!image) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }
    if (image.user_id && req.user && image.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    await imageService.unpublishFromWall(imageId);
    res.json({ success: true });
  } catch (error) {
    console.error('Unpublish wall error:', error);
    res.status(500).json({ success: false, error: 'Failed to unpublish', message: error.message });
  }
});

module.exports = router;
