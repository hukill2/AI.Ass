// Usage: node scripts/sync-status-report-v1.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const sourcePath = path.join(__dirname, '..', 'mirror', 'reviews-approvals-source.v1.json');
const exportPath = path.join(__dirname, '..', 'exports', 'reviews-approvals-mirror.v1.json');

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

let source;
let exportPayload;
try {
  source = loadJson(sourcePath);
  exportPayload = loadJson(exportPath);
} catch (err) {
  console.error(`Failed to read source/export: ${err.message}`);
  process.exit(1);
}

const validatorScript = path.join(__dirname, 'validate-reviews-approvals-mirror-v1.js');
const validator = spawnSync('node', [validatorScript], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
});
const validationPassed = validator.status === 0;

const itemsMissingFields = [];
if (Array.isArray(exportPayload.items)) {
  exportPayload.items.forEach((item, index) => {
    ['task_id', 'title', 'status', 'route_target'].forEach((field) => {
      if (!item[field]) {
        itemsMissingFields.push(`item ${index} missing ${field}`);
      }
    });
  });
}

console.log('--- Reviews / Approvals Mirror Status ---');
console.log(`Source items: ${Array.isArray(source.items) ? source.items.length : 0}`);
console.log(`Export items: ${Array.isArray(exportPayload.items) ? exportPayload.items.length : 0}`);
console.log(`Export version: ${exportPayload.export_version || 'unknown'}`);
console.log(`Source: ${exportPayload.source || 'unknown'}`);
console.log(`Exported at: ${exportPayload.exported_at || 'unknown'}`);
console.log(`Validation: ${validationPassed ? 'passed' : 'failed'}`);
if (itemsMissingFields.length > 0) {
  console.log('Items missing required fields:');
  itemsMissingFields.forEach((msg) => console.log(`  - ${msg}`));
}
console.log('-----------------------------------------');

if (!validationPassed || !Array.isArray(exportPayload.items) || itemsMissingFields.length > 0) {
  process.exit(1);
}
