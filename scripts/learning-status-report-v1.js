// Usage: node scripts/learning-status-report-v1.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const recordsPath = path.join(__dirname, '..', 'mirror', 'learning-records.v1.json');
function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

let data;
try {
  data = loadJson(recordsPath);
} catch (err) {
  console.error(`Failed to read learning records: ${err.message}`);
  process.exit(1);
}

const validatorScript = path.join(__dirname, 'validate-learning-records-v1.js');
const validator = spawnSync('node', [validatorScript], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
});
const validationPassed = validator.status === 0;

const missingFields = [];
if (Array.isArray(data.records)) {
  data.records.forEach((record, index) => {
    ['record_id', 'task_id', 'title', 'route_used', 'lesson_learned'].forEach((field) => {
      if (!record[field]) {
        missingFields.push(`record ${index} missing ${field}`);
      }
    });
  });
} else {
  missingFields.push('records array is missing or invalid');
}

console.log('--- Learning Records Status ---');
console.log(`Version: ${data.version || 'unknown'}`);
console.log(`Record count: ${Array.isArray(data.records) ? data.records.length : 0}`);
console.log(`Validation: ${validationPassed ? 'passed' : 'failed'}`);
if (missingFields.length) {
  console.log('Records missing required fields:');
  missingFields.forEach((msg) => console.log(`  - ${msg}`));
}
console.log('-------------------------------');

if (!validationPassed || missingFields.length) {
  process.exit(1);
}
