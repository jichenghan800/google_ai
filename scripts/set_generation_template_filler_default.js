#!/usr/bin/env node
// One‑time helper: set UI generationTemplateFillerSystemPrompt to the current default
// Usage: node scripts/set_generation_template_filler_default.js

const axios = require('axios');
const path = require('path');

async function main() {
  const API = process.env.API_BASE_URL || 'http://localhost:3001/api';
  const SYSTEM_PROMPTS = require(path.resolve(__dirname, '../backend/config/systemPrompts.js'));
  const filler = SYSTEM_PROMPTS.GENERATION_TEMPLATE_FILLER_SYSTEM || '';
  const ui = axios.create({ baseURL: API, timeout: 15000 });
  const cur = await ui.get('/ui/settings').then(r => r.data?.data || {}).catch(() => ({}));
  const order = Array.isArray(cur.systemPromptTabsOrder) && cur.systemPromptTabsOrder.length
    ? cur.systemPromptTabsOrder
    : ['generate','analysis','recognition','templates','genTemplates','templatesPro'];
  await ui.put('/ui/settings', {
    systemPromptTabsOrder: order,
    generationTemplateFillerSystemPrompt: filler
  });
  console.log('Updated generationTemplateFillerSystemPrompt to current default.');
}

main().catch(err => { console.error(err?.message || err); process.exit(1); });
