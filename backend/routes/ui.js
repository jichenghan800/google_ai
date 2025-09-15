const express = require('express');
const router = express.Router();
const redis = require('redis');

// Simple UI/global preferences storage in Redis
const redisClient = redis.createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
});

redisClient.connect().catch(console.error);

const UI_SETTINGS_KEY = 'ui_settings';

// Default settings
const DEFAULT_SETTINGS = {
  systemPromptTabsOrder: ['generate', 'analysis', 'recognition', 'templates']
};

router.get('/settings', async (req, res) => {
  try {
    const raw = await redisClient.get(UI_SETTINGS_KEY);
    if (!raw) {
      return res.json({ success: true, data: DEFAULT_SETTINGS });
    }
    let data;
    try { data = JSON.parse(raw); } catch { data = DEFAULT_SETTINGS; }
    // normalize
    if (!Array.isArray(data.systemPromptTabsOrder)) {
      data.systemPromptTabsOrder = DEFAULT_SETTINGS.systemPromptTabsOrder;
    }
    res.json({ success: true, data });
  } catch (e) {
    console.error('Error getting UI settings:', e);
    res.status(500).json({ success: false, error: 'Failed to get UI settings' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const { systemPromptTabsOrder } = req.body || {};
    const normalized = {
      systemPromptTabsOrder: Array.isArray(systemPromptTabsOrder) && systemPromptTabsOrder.length > 0
        ? systemPromptTabsOrder.filter(id => ['generate', 'analysis', 'recognition', 'templates'].includes(id))
        : DEFAULT_SETTINGS.systemPromptTabsOrder
    };
    await redisClient.set(UI_SETTINGS_KEY, JSON.stringify(normalized));
    res.json({ success: true, data: normalized });
  } catch (e) {
    console.error('Error updating UI settings:', e);
    res.status(500).json({ success: false, error: 'Failed to update UI settings' });
  }
});

module.exports = router;

