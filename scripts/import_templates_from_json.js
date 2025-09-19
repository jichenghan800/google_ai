#!/usr/bin/env node
// Import prompt templates via /api/templates endpoints from a JSON dump (e.g. Redis prompt_templates value)
// Usage:
//   node scripts/import_templates_from_json.js --file backups/prompt_templates.json \
//        --api http://localhost:3001/api --replace
// Flags:
//   --file / -f   Required. Path to JSON file containing an array of templates.
//   --api         Optional. API base URL (defaults to process.env.API_BASE_URL or http://localhost:3001/api).
//   --replace     Optional. Delete templates that are not present in the JSON (category-aware).
//   --dry-run     Optional. Show actions without mutating the server.

const fs = require('fs');
const path = require('path');
const axios = resolveAxios();

const ALLOWED_FIELDS = [
  'name',
  'content',
  'category',
  'nameZh',
  'nameEn',
  'contentZh',
  'contentEn',
  'remarkZh',
  'remarkEn',
  'emoji'
];

function resolveAxios() {
  const candidates = [
    () => require('axios'),
    () => require(path.resolve(__dirname, '../backend/node_modules/axios')),
    () => require(path.resolve(__dirname, '../frontend/node_modules/axios'))
  ];
  for (const fn of candidates) {
    try { return fn(); } catch (_) { /* try next */ }
  }
  console.error('Cannot find axios. Install it with "npm install axios" or ensure backend/frontend dependencies are present.');
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    file: null,
    apiBase: process.env.API_BASE_URL || 'http://localhost:3001/api',
    replace: false,
    dryRun: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--file':
      case '-f':
        opts.file = argv[++i];
        break;
      case '--api':
      case '--api-base':
        opts.apiBase = argv[++i];
        break;
      case '--replace':
        opts.replace = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
      default:
        console.warn(`Unknown argument: ${arg}`);
    }
  }

  if (!opts.file) {
    printUsage();
    process.exit(1);
  }

  return opts;
}

function printUsage() {
  console.log(`\nImport templates from JSON dump.\n\nUsage:\n  node scripts/import_templates_from_json.js --file <path> [--api <url>] [--replace] [--dry-run]\n\nExamples:\n  node scripts/import_templates_from_json.js --file backups/prompt_templates.json\n  node scripts/import_templates_from_json.js -f export.json --api http://srv:3001/api --replace\n`);
}

function ensureArray(input) {
  if (Array.isArray(input)) return input;
  if (input && Array.isArray(input.data)) return input.data;
  throw new Error('Template JSON must be an array or an object with data array');
}

function buildKey(t) {
  const name = (t.nameEn || t.nameZh || t.name || '').trim();
  const content = (t.contentEn || t.contentZh || t.content || '').trim();
  return `${name}__${content}`;
}

function pickPayload(source) {
  const payload = {};
  for (const field of ALLOWED_FIELDS) {
    if (typeof source[field] !== 'undefined' && source[field] !== null) {
      payload[field] = source[field];
    }
  }
  return payload;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(process.cwd(), options.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON: ${err.message}`);
  }

  const templates = ensureArray(parsed).filter(Boolean);
  if (templates.length === 0) {
    console.log('No templates found in file. Nothing to do.');
    return;
  }

  const api = axios.create({ baseURL: options.apiBase, timeout: 20000 });
  const dryRun = options.dryRun;

  console.log(`Loaded ${templates.length} template(s) from ${filePath}`);
  console.log(`Target API: ${options.apiBase}`);
  if (dryRun) console.log('Running in DRY-RUN mode (no changes will be made).');

  // Fetch all existing templates (both categories)
  let existing = [];
  try {
    const resp = await api.get('/templates');
    existing = Array.isArray(resp.data?.data) ? resp.data.data : [];
  } catch (err) {
    throw new Error(`Failed to fetch existing templates: ${err.response?.data?.error || err.message}`);
  }

  const existingById = new Map();
  const existingByKey = new Map();
  for (const item of existing) {
    if (!item) continue;
    if (item.id) existingById.set(item.id, item);
    const key = buildKey(item);
    if (key.trim()) existingByKey.set(key, item);
  }

  const desiredByCategory = { edit: [], generate: [] };
  for (const t of templates) {
    const category = (t.category || '').toLowerCase();
    if (category !== 'edit' && category !== 'generate') {
      console.warn(`Skipping template with unsupported category: ${t.category}`);
      continue;
    }
    desiredByCategory[category].push(t);
  }

  if (desiredByCategory.edit.length === 0 && desiredByCategory.generate.length === 0) {
    console.log('No supported templates (category edit/generate) in file.');
    return;
  }

  let created = 0;
  let updated = 0;
  const keptIds = { edit: new Set(), generate: new Set() };
  const resolvedIdByKey = new Map();

  for (const category of ['edit', 'generate']) {
    for (const tpl of desiredByCategory[category]) {
      const key = buildKey(tpl);
      const sourceKey = key || tpl.id || tpl.name;

      const normalized = Object.assign({}, tpl, { category });
      const payload = pickPayload(normalized);

      // Ensure name/content fallback exists for creation
      const fallbackName = payload.name || payload.nameEn || payload.nameZh;
      const fallbackContent = payload.content || payload.contentEn || payload.contentZh;
      if (!fallbackName || !fallbackContent) {
        console.warn(`Skipping template without name/content fallback: ${sourceKey}`);
        continue;
      }
      payload.name = payload.name || fallbackName;
      payload.content = payload.content || fallbackContent;

      let target = null;
      if (tpl.id && existingById.has(tpl.id)) {
        target = existingById.get(tpl.id);
      } else if (key && existingByKey.has(key)) {
        target = existingByKey.get(key);
      }

      if (target) {
        const targetPayload = pickPayload(target);
        let needsUpdate = false;
        for (const field of ALLOWED_FIELDS) {
          if (payload[field] === undefined) continue;
          if ((targetPayload[field] || '') !== (payload[field] || '')) {
            needsUpdate = true;
            break;
          }
        }
        if (needsUpdate) {
          if (dryRun) {
            console.log(`[DRY] Would update template ${target.id} (${payload.name})`);
          } else {
            await api.put(`/templates/${target.id}`, payload).catch(err => {
              throw new Error(`Failed to update template ${target.id}: ${err.response?.data?.error || err.message}`);
            });
            console.log(`Updated template ${target.id} (${payload.name})`);
          }
          updated++;
        } else {
          console.log(`No changes for template ${target.id} (${payload.name})`);
        }
        keptIds[category].add(target.id);
        if (key) resolvedIdByKey.set(key, target.id);
      } else {
        if (dryRun) {
          console.log(`[DRY] Would create template (${payload.name}) in category ${category}`);
          created++;
          continue;
        }
        const resp = await api.post('/templates', payload).catch(err => {
          throw new Error(`Failed to create template (${payload.name}): ${err.response?.data?.error || err.message}`);
        });
        const newId = resp.data?.data?.id;
        console.log(`Created template ${newId || ''} (${payload.name})`);
        created++;
        if (newId) {
          keptIds[category].add(newId);
          if (key) resolvedIdByKey.set(key, newId);
          existingById.set(newId, Object.assign({ id: newId }, payload));
        }
      }
    }
  }

  // Replace mode: delete templates not present in JSON for each category
  if (options.replace) {
    for (const category of ['edit', 'generate']) {
      for (const item of existing.filter(t => (t.category || '').toLowerCase() === category)) {
        if (!item?.id) continue;
        if (keptIds[category].has(item.id)) continue;
        if (dryRun) {
          console.log(`[DRY] Would delete template ${item.id} (${item.name})`);
        } else {
          await api.delete(`/templates/${item.id}`).catch(err => {
            throw new Error(`Failed to delete template ${item.id}: ${err.response?.data?.error || err.message}`);
          });
          console.log(`Deleted template ${item.id} (${item.name})`);
        }
      }
    }
  }

  // Reorder to match JSON order per category (skip if dry-run but still log)
  for (const category of ['edit', 'generate']) {
    const orderedKeys = desiredByCategory[category]
      .map(t => buildKey(t))
      .filter(key => key && resolvedIdByKey.has(key));

    if (orderedKeys.length === 0) continue;

    const idList = orderedKeys
      .map(key => resolvedIdByKey.get(key))
      .filter(Boolean);

    if (idList.length === 0) continue;

    if (dryRun) {
      console.log(`[DRY] Would reorder ${category} templates: ${idList.join(', ')}`);
    } else {
      await api.put('/templates/reorder', { ids: idList, category }).catch(err => {
        console.warn(`Failed to reorder ${category} templates: ${err.response?.data?.error || err.message}`);
      });
    }
  }

  console.log('\nImport summary:');
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  if (options.replace) console.log('  Mode   : replace (extras deleted)');
  if (dryRun) console.log('  Note   : DRY-RUN (no changes applied)');
}

main().catch(err => {
  console.error(err?.message || err);
  process.exit(1);
});
