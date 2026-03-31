// Usage: node scripts/architecture-status-report-v1.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MIRROR_PATH = path.join(__dirname, '..', 'mirror', 'architecture-pages.v1.json');
const VALIDATOR_SCRIPT = path.join(__dirname, 'validate-architecture-pages-v1.js');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function runValidator() {
  const result = spawnSync('node', [VALIDATOR_SCRIPT], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });
  if (result.stdout) console.log(result.stdout.trim());
  if (result.stderr) console.error(result.stderr.trim());
  return result.status === 0;
}

function findMissingSections(pages) {
  const missing = [];
  pages.forEach((page, index) => {
    const issues = [];
    ['title', 'parent_title', 'content'].forEach((field) => {
      if (!page[field]) {
        issues.push(field);
      }
    });
    if (issues.length) {
      missing.push({
        title: page.title || '<untitled>',
        page_id: page.page_id || '<no id>',
        missing: issues,
      });
    }
  });
  return missing;
}

function main() {
  let data;
  try {
    data = readJson(MIRROR_PATH);
  } catch (err) {
    console.error(`Failed to read architecture mirror: ${err.message}`);
    process.exit(1);
  }

  const validationPassed = runValidator();
  const pages = Array.isArray(data.pages) ? data.pages : [];
  const missing = findMissingSections(pages);

  console.log('--- Architecture Pages Status ---');
  console.log(`Version: ${String(data.version || 'unknown')}`);
  console.log(`Root title: ${String(data.root_title || 'unknown')}`);
  console.log(`Page count: ${pages.length}`);
  console.log(`Validation: ${validationPassed ? 'passed' : 'failed'}`);
  if (missing.length) {
    console.log('Pages missing required narrative/context fields:');
    missing.forEach((info) => {
      console.log(`  - ${info.title} (${info.page_id}): missing ${info.missing.join(', ')}`);
    });
  }
  console.log('----------------------------------');

  if (!validationPassed || missing.length) {
    process.exit(1);
  }
}

main();
