const express = require('express');
const router = express.Router();
const redis = require('redis');

// Redis 客户端（与 templates 路由风格一致）
const redisClient = redis.createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
});

redisClient.connect().catch(console.error);

const RECOGNITION_SETTINGS_KEY = 'recognition_settings';

// 获取识别设置
router.get('/settings', async (req, res) => {
  try {
    const raw = await redisClient.get(RECOGNITION_SETTINGS_KEY);
    if (!raw) {
      return res.json({ success: true, data: { customRecognitionPrompt: '', recognitionScenarios: [] } });
    }
    let data;
    try { data = JSON.parse(raw); } catch { data = { customRecognitionPrompt: '', recognitionScenarios: [] }; }
    // 结构兜底
    data = data || {};
    if (!Array.isArray(data.recognitionScenarios)) data.recognitionScenarios = [];
    if (typeof data.customRecognitionPrompt !== 'string') data.customRecognitionPrompt = '';
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting recognition settings:', error);
    res.status(500).json({ success: false, error: 'Failed to get recognition settings' });
  }
});

// 更新识别设置
router.put('/settings', async (req, res) => {
  try {
    const { customRecognitionPrompt = '', recognitionScenarios = [] } = req.body || {};
    const normalized = {
      customRecognitionPrompt: String(customRecognitionPrompt || ''),
      recognitionScenarios: Array.isArray(recognitionScenarios)
        ? recognitionScenarios.map((s) => {
            if (typeof s === 'string') {
              const [name, ...rest] = s.split(':');
              return { name: (name || '').trim() || '场景', content: (rest.length ? rest.join(':') : name || '').trim() };
            }
            return { name: (s?.name || '场景').trim(), content: String(s?.content || '').trim() };
          }).filter((x) => x.content)
        : []
    };
    await redisClient.set(RECOGNITION_SETTINGS_KEY, JSON.stringify(normalized));
    res.json({ success: true, data: normalized });
  } catch (error) {
    console.error('Error updating recognition settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update recognition settings' });
  }
});

module.exports = router;

