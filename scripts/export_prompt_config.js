#!/usr/bin/env node
// Export prompt-related configuration (templates + UI/recognition settings) to a JSON file.
// Usage: node scripts/export_prompt_config.js [output-file] [--api http://host:3001/api]

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
  console.log('Usage: node scripts/export_prompt_config.js [output-file] [--api http://host:3001/api]');
}

function parseArgs(argv) {
  const out = {
    file: 'prompt_config_export.json',
    apiBase: process.env.API_BASE_URL || 'http://localhost:3001/api'
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--api' || arg === '--api-base') {
      out.apiBase = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (!arg.startsWith('--')) {
      out.file = arg;
    } else {
      console.warn(`Unknown argument ignored: ${arg}`);
    }
  }
  return out;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const api = axios.create({ baseURL: options.apiBase, timeout: 20000 });

  console.log(`[export] Using API base: ${options.apiBase}`);

  const result = { templates: [], uiSettings: null, recognitionSettings: null };

  try {
    const resp = await api.get('/templates');
    result.templates = Array.isArray(resp.data?.data) ? resp.data.data : [];
    console.log(`[export] Templates fetched: ${result.templates.length}`);
  } catch (err) {
    throw new Error(`Failed to fetch templates: ${err.response?.data?.error || err.message}`);
  }

  try {
    const uiResp = await api.get('/ui/settings');
    result.uiSettings = uiResp.data?.data || null;
    console.log('[export] UI settings fetched');
  } catch (err) {
    console.warn(`[export] Unable to fetch UI settings: ${err.response?.data?.error || err.message}`);
  }

  try {
    const recResp = await api.get('/recognition/settings');
    result.recognitionSettings = recResp.data?.data || null;
    console.log('[export] Recognition settings fetched');
  } catch (err) {
    console.warn(`[export] Unable to fetch recognition settings: ${err.response?.data?.error || err.message}`);
  }

  const targetPath = path.resolve(process.cwd(), options.file);
  fs.writeFileSync(targetPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[export] Configuration saved to ${targetPath}`);
}

main().catch(err => {
  console.error(err?.message || err);
  process.exit(1);
});
