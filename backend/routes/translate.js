const router = require('express').Router();
const { translateText } = require('../services/translation');
const vertexAI = require('../services/vertexAI');

// POST /api/translate/templates/translate
router.post('/templates/translate', async (req, res) => {
  try {
    const { text, source = undefined, target = 'en', mode = 'mt' } = req.body || {};
    if (!text || !target) {
      return res.status(400).json({ success: false, error: 'text and target are required' });
    }
    let out = '';
    if (mode === 'llm') {
      try {
        const sys = `You are a bilingual prompt engineer. Translate from ${source || 'auto'} to ${target}.
Rules:
- Preserve meaning and constraints; do not add or remove.
- Keep placeholders like [xxx] and {variables} intact.
- Keep Markdown/code blocks unchanged.
- Output ${target} only, no explanation.`;
        out = await vertexAI.translateWithLLM({ system: sys, input: String(text) });
      } catch (e) {
        // Fallback to MT
        out = await translateText(String(text), { source, target });
      }
    } else {
      out = await translateText(String(text), { source, target });
    }
    return res.json({ success: true, data: { translated: out } });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'translate failed' });
  }
});

module.exports = router;

