// Usage: node scripts/architecture-pages-quality-report-v1.js
const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.join(__dirname, '..', 'mirror', 'architecture-pages.v1.json');

function exitError(message) {
  console.error(message);
  process.exit(1);
}

function loadSource() {
  if (!fs.existsSync(SOURCE_PATH)) {
    exitError(`Missing architecture pages file: ${SOURCE_PATH}`);
  }
  try {
    return JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  } catch (err) {
    exitError(`Failed to parse architecture pages file: ${err.message}`);
  }
}

function analyzePage(page) {
  const warnings = [];
  if (!page.title || !page.title.trim()) {
    warnings.push('missing title');
  }
  if (!page.parent_title || !page.parent_title.trim()) {
    warnings.push('missing parent_title');
  }
  const body = String(page.content || '').trim();
  if (!body) {
    warnings.push('empty content');
  } else if (body.length < 80) {
    warnings.push('short content');
  }
  return warnings;
}

function report() {
  const data = loadSource();
  const pages = Array.isArray(data.pages) ? data.pages : [];
  const warnings = [];

  pages.forEach((page) => {
    const pageWarnings = analyzePage(page);
    if (pageWarnings.length) {
      warnings.push({
        title: page.title || '<untitled>',
        page_id: page.page_id || '<no id>',
        warnings: pageWarnings,
      });
    }
  });

  console.log('--- Architecture Pages Quality Report ---');
  console.log(`Total pages: ${pages.length}`);
  console.log(`Pages with warnings: ${warnings.length}`);
  warnings.forEach((entry) => {
    console.log(`  - ${entry.title} (${entry.page_id}): ${entry.warnings.join(', ')}`);
  });
  console.log('Quality warnings do not block sync but indicate pages needing richer content.');
}

report();
