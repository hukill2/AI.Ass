// Usage: node scripts/validate-learning-records-v1.js
const fs = require('fs');
const path = require('path');

const recordsPath = path.join(__dirname, '..', 'mirror', 'learning-records.v1.json');
function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(recordsPath)) {
  fail(`Missing learning records file at ${recordsPath}`);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(recordsPath, 'utf8'));
} catch (err) {
  fail(`Unable to parse learning records: ${err.message}`);
}

const errors = [];
if (typeof data.version !== 'string') {
  errors.push('version must be a string.');
}
if (!Array.isArray(data.records)) {
  errors.push('records must be an array.');
}

const requiredFields = [
  'record_id',
  'task_id',
  'title',
  'task_type',
  'risk',
  'route_used',
  'attempted_locally_first',
  'required_approval',
  'approval_outcome',
  'final_outcome',
  'result_quality',
  'worked',
  'failed',
  'lesson_learned',
  'follow_up_recommendation',
  'created_at',
];

data.records.forEach((record, index) => {
  requiredFields.forEach((field) => {
    if (!(field in record)) {
      errors.push(`Record ${index} missing ${field}`);
    }
  });
  if ('attempted_locally_first' in record && typeof record.attempted_locally_first !== 'boolean') {
    errors.push(`Record ${index} attempted_locally_first must be boolean.`);
  }
  if ('required_approval' in record && typeof record.required_approval !== 'boolean') {
    errors.push(`Record ${index} required_approval must be boolean.`);
  }
  requiredFields.forEach((field) => {
    if (['attempted_locally_first', 'required_approval'].includes(field)) return;
    if (field in record && typeof record[field] !== 'string') {
      errors.push(`Record ${index} ${field} must be a string.`);
    }
  });
});

if (errors.length > 0) {
  console.error('Validation failed:');
  errors.forEach((err) => console.error(`- ${err}`));
  process.exit(1);
}

console.log('learning-records.v1.json is valid.');
