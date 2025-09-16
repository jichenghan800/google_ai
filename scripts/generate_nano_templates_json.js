// Extract Nano-Bananary TRANSFORMATIONS into a plain JSON list for edit templates
// Usage: node scripts/generate_nano_templates_json.js

const fs = require('fs');
const path = require('path');

function extract() {
  const srcPath = path.resolve(__dirname, '..', '_ext', 'Nano-Bananary', 'constants.ts');
  const outPath = path.resolve(__dirname, '..', 'frontend', 'public', 'nano_bananary_edit_templates.json');

  const text = fs.readFileSync(srcPath, 'utf8');

  const entries = [];

  // A light-weight parse: iterate by object blocks using 'title:"..."' as anchor
  const titleRegex = /\{[^\{]*?title\s*:\s*"([^"]+)"([\s\S]*?)\}/g;
  let m;
  while ((m = titleRegex.exec(text)) !== null) {
    const title = m[1].trim();
    const block = m[2];

    // Extract emoji (optional), prompt (required), stepTwoPrompt (optional)
    const emojiMatch = block.match(/emoji\s*:\s*"([^"]+)"/);
    const promptMatch = block.match(/prompt\s*:\s*"([\s\S]*?)"\s*,/);
    const stepTwoMatch = block.match(/stepTwoPrompt\s*:\s*"([\s\S]*?)"\s*,?/);

    if (!promptMatch) continue;
    const prompt = promptMatch[1].replace(/\n\s*/g, ' ').trim();
    const emoji = emojiMatch ? emojiMatch[1] : '';

    // Skip CUSTOM sentinel
    if (prompt === 'CUSTOM') continue;

    const nameBase = `${emoji ? emoji + ' ' : ''}${title}`.trim();
    entries.push({ name: nameBase, content: prompt, category: 'edit', source: 'Nano-Bananary' });

    if (stepTwoMatch) {
      const stepTwo = stepTwoMatch[1].replace(/\n\s*/g, ' ').trim();
      if (stepTwo) {
        entries.push({ name: `${nameBase} (Step 2)`, content: stepTwo, category: 'edit', source: 'Nano-Bananary' });
      }
    }
  }

  // Deduplicate by name+content
  const uniq = [];
  const seen = new Set();
  for (const e of entries) {
    const key = `${e.name}__${e.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(e);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(uniq, null, 2), 'utf8');
  console.log(`Wrote ${uniq.length} templates to ${outPath}`);
}

if (require.main === module) {
  extract();
}

module.exports = { extract };

