#!/usr/bin/env node
// Import prompt-related configuration (templates + optional UI/recognition settings) from a JSON file.
// Usage: node scripts/import_prompt_config.js <input-file> [--api http://host:3001/api] [--skip-ui] [--skip-recognition]

const fs = require('fs');
const path = require('path');
const axios = resolveAxios();

function resolveAxios() {
  const locations = [
    () => require('axios'),
    () => require(path.resolve(__dirname, '../backend/node_modules/axios')),
    () => require(path.resolve(__dirname, '../frontend/node_modules/axios'))
  ];
  for (const fn of locations) {
    try {
      const mod = fn();
      return mod?.default || mod;
    } catch (_) {}
  }
  console.error('Cannot find axios. Install it with "npm install axios" or run inside backend/frontend with dependencies installed.');
  process.exit(1);
}

function printUsage() {
  console.log('Usage: node scripts/import_prompt_config.js <input-file> [--api URL] [--skip-ui] [--skip-recognition]');
}

function parseArgs(argv) {
  if (!argv.length) {
    printUsage();
    process.exit(1);
  }
  const opts = {
    file: null,
    apiBase: process.env.API_BASE_URL || 'http://localhost:3001/api',
    skipUI: false,
    skipRecognition: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--api':
      case '--api-base':
        opts.apiBase = argv[++i];
        break;
      case '--skip-ui':
        opts.skipUI = true;
        break;
      case '--skip-recognition':
        opts.skipRecognition = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
      default:
        if (!opts.file) opts.file = arg; else console.warn(`Unknown argument ignored: ${arg}`);
    }
  }

  if (!opts.file) {
    printUsage();
    process.exit(1);
  }
  return opts;
}

const TEMPLATE_FIELDS = [
  'name', 'content', 'category', 'nameZh', 'nameEn', 'contentZh', 'contentEn', 'remarkZh', 'remarkEn', 'emoji', 'type', 'ratio', 'resolution'
];

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.data)) return value.data;
  return [];
}

function pickTemplatePayload(tpl) {
  const payload = {};
  for (const field of TEMPLATE_FIELDS) {
    if (tpl[field] !== undefined && tpl[field] !== null) {
      payload[field] = tpl[field];
    }
  }
  return payload;
}

async function replaceTemplates(api, templates, category) {
  console.log(`[import] Processing category: ${category}`);
  const listResp = await api.get(`/templates?category=${category}`);
  const existing = Array.isArray(listResp.data?.data) ? listResp.data.data : [];

  for (const item of existing) {
    if (!item?.id) continue;
    await api.delete(`/templates/${item.id}`);
    console.log(`[import] Deleted existing template ${item.id}`);
  }

  const toInsert = templates.filter(t => (t.category || '').toLowerCase() === category);
  const newIds = [];
  for (const tpl of toInsert) {
    const payload = pickTemplatePayload(tpl);
    payload.category = category;
    payload.name = payload.name || payload.nameZh || payload.nameEn;
    payload.content = payload.content || payload.contentZh || payload.contentEn;
    if (!payload.name || !payload.content) {
      console.warn(`[import] Skip template without name/content fallback: ${JSON.stringify(tpl)}`);
      continue;
    }
    const resp = await api.post('/templates', payload);
    const newId = resp.data?.data?.id;
    if (newId) newIds.push(newId);
    console.log(`[import] Created template ${newId || ''} (${payload.name})`);
  }

  if (newIds.length > 1) {
    await api.put('/templates/reorder', { ids: newIds, category });
    console.log(`[import] Reordered ${category} templates (${newIds.length})`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(process.cwd(), options.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const api = axios.create({ baseURL: options.apiBase, timeout: 20000 });

  console.log(`[import] Using API base: ${options.apiBase}`);

  const templates = ensureArray(data.templates);
  if (templates.length === 0) {
    console.warn('[import] No templates section found; skipping template import.');
  } else {
    await replaceTemplates(api, templates, 'edit');
    await replaceTemplates(api, templates, 'generate');
  }

  if (!options.skipUI && data.uiSettings) {
    try {
      await api.put('/ui/settings', {
        systemPromptTabsOrder: data.uiSettings.systemPromptTabsOrder || ['generate', 'analysis', 'recognition', 'templates', 'genTemplates', 'templatesPro'],
        generationTemplateFillerSystemPrompt: data.uiSettings.generationTemplateFillerSystemPrompt || ''
      });
      console.log('[import] UI settings restored');
    } catch (err) {
      console.warn(`[import] Failed to restore UI settings: ${err.response?.data?.error || err.message}`);
    }
  }

  if (!options.skipRecognition && data.recognitionSettings) {
    try {
      await api.put('/recognition/settings', data.recognitionSettings);
      console.log('[import] Recognition settings restored');
    } catch (err) {
      console.warn(`[import] Failed to restore recognition settings: ${err.response?.data?.error || err.message}`);
    }
  }

  console.log('[import] Completed.');
}

main().catch(err => {
  console.error(err?.message || err);
  process.exit(1);
});
