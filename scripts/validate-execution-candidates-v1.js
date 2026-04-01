// Usage: node scripts/validate-execution-candidates-v1.js
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'runtime', 'execution-candidates.v1.json');

function exitWith(msg) {
  console.error(msg);
  process.exit(1);
}

function loadJson() {
  if (!fs.existsSync(FILE_PATH)) exitWith(`Missing file: ${FILE_PATH}`);
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch (err) {
    exitWith(`Failed to parse ${FILE_PATH}: ${err.message}`);
  }
}

function mustBeString(obj, field, index, errors) {
  if (!(field in obj)) {
    errors.push(`candidate ${index} missing ${field}`);
  } else if (typeof obj[field] !== 'string') {
    errors.push(`candidate ${index} ${field} must be a string`);
  }
}

function main() {
  const data = loadJson();
  const errors = [];
  if (!('version' in data)) {
    errors.push('missing version');
  } else if (typeof data.version !== 'string') {
    errors.push('version must be a string');
  }
  if (!('candidates' in data)) {
    errors.push('missing candidates array');
  } else if (!Array.isArray(data.candidates)) {
    errors.push('candidates must be an array');
  } else {
    data.candidates.forEach((candidate, index) => {
      if (typeof candidate !== 'object' || candidate === null) {
        errors.push(`candidate ${index} must be an object`);
        return;
      }
      [
        'execution_id',
        'review_id',
        'decision_id',
        'task_id',
        'execution_status',
        'recommended_next_step',
        'reasoning',
        'operator_notes',
        'created_at',
        'updated_at',
      ].forEach((field) => mustBeString(candidate, field, index, errors));
      if (!Array.isArray(candidate.files_to_create_or_update)) {
        errors.push(`candidate ${index} files_to_create_or_update must be an array`);
      }
      if (!Array.isArray(candidate.risks_or_guardrails)) {
        errors.push(`candidate ${index} risks_or_guardrails must be an array`);
      }
    });
  }
  if (errors.length) {
    console.error('execution-candidates.v1.json validation failed:');
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }
  console.log('runtime/execution-candidates.v1.json is valid.');
}

main();
