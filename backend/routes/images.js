const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const imageService = require('../services/imageService');
const db = require('../services/db');

router.use(authService.attachUserIfEnabled);

// List current user's images (paginated)
router.get('/', async (req, res) => {
  try {
    if (!db.enabled) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthenticated' });
    }
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const offset = parseInt(req.query.offset || '0', 10);
    const { items, total } = await imageService.listImagesByUser(req.user.id, limit, offset);
    res.json({ success: true, data: { items, total, limit, offset } });
  } catch (error) {
    console.error('List images error:', error);
    res.status(500).json({ success: false, error: 'Failed to list images', message: error.message });
  }
});

// Get single image (ownership enforced)
router.get('/:id', async (req, res) => {
  try {
    if (!db.enabled) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthenticated' });
    }
    const item = await imageService.getImageById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    if (item.user_id && item.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    res.json({ success: true, data: item });
  } catch (error) {
    console.error('Get image error:', error);
    res.status(500).json({ success: false, error: 'Failed to get image', message: error.message });
  }
});

module.exports = router;
