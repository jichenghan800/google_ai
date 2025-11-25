const express = require('express');
const router = express.Router();
const SYSTEM_PROMPTS = require('../config/systemPrompts');

// 返回系统默认的 generation/editing/analysis system prompt
router.get('/defaults', (req, res) => {
  try {
    const defaults = {
      generation: SYSTEM_PROMPTS.IMAGE_GENERATION_OPTIMIZATION || '',
      editing: SYSTEM_PROMPTS.INTELLIGENT_ANALYSIS_EDITING || '',
      analysis: SYSTEM_PROMPTS.IMAGE_ANALYSIS || '',
    };
    res.json({ success: true, data: defaults });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to load system prompts' });
  }
});

module.exports = router;
