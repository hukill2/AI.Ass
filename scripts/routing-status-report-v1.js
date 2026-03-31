// Usage: node scripts/routing-status-report-v1.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const filePath = path.join(__dirname, '..', 'mirror', 'routing-decisions.v1.json');
function readJson(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing file: ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

let data;
try {
  data = readJson(filePath);
} catch (err) {
  console.error(`Failed to read routing decisions: ${err.message}`);
  process.exit(1);
}

const validatorScript = path.join(__dirname, 'validate-routing-decisions-v1.js');
const validator = spawnSync('node', [validatorScript], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
});
const validationPassed = validator.status === 0;

const missing = [];
if (Array.isArray(data.decisions)) {
  data.decisions.forEach((decision, idx) => {
    ['task_id', 'classification', 'recommended_route', 'reasoning'].forEach((field) => {
      if (!decision[field]) {
        missing.push(`decision ${idx} missing ${field}`);
      }
    });
  });
} else {
  missing.push('decisions array missing or invalid');
}

console.log('--- Routing Decisions Status ---');
console.log(`Version: ${data.version || 'unknown'}`);
console.log(`Decision count: ${Array.isArray(data.decisions) ? data.decisions.length : 0}`);
console.log(`Validation: ${validationPassed ? 'passed' : 'failed'}`);
if (missing.length) {
  console.log('Missing required fields:');
  missing.forEach((msg) => console.log(`  - ${msg}`));
}
console.log('-------------------------------');

if (!validationPassed || missing.length) {
  process.exit(1);
}
