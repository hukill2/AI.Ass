// Usage: node scripts/validate-assistant-decisions-v1.js
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'runtime', 'assistant-decisions.v1.json');

function exitError(message) {
  console.error(message);
  process.exit(1);
}

function loadJson() {
  if (!fs.existsSync(FILE_PATH)) {
    exitError(`Missing assistant decisions file: ${FILE_PATH}`);
  }
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch (err) {
    exitError(`Failed to parse assistant decisions file: ${err.message}`);
  }
}

function isString(value) {
  return typeof value === 'string';
}

function main() {
  const data = loadJson();
  const errors = [];
  if (!('version' in data)) {
    errors.push('missing version');
  } else if (!isString(data.version)) {
    errors.push('version must be a string');
  }
  if (!('decisions' in data)) {
    errors.push('missing decisions array');
  } else if (!Array.isArray(data.decisions)) {
    errors.push('decisions must be an array');
  } else {
    data.decisions.forEach((decision, idx) => {
      if (typeof decision !== 'object' || decision === null) {
        errors.push(`decision ${idx} must be an object`);
        return;
      }
      const requiredStrings = [
        'decision_id',
        'task_id',
        'model',
        'recommended_next_step',
        'reasoning',
        'notes',
        'created_at',
      ];
      requiredStrings.forEach((field) => {
        if (!(field in decision)) {
          errors.push(`decision ${idx} missing ${field}`);
        } else if (!isString(decision[field])) {
          errors.push(`decision ${idx} ${field} must be a string`);
        }
      });
      if (!('files_to_create_or_update' in decision)) {
        errors.push(`decision ${idx} missing files_to_create_or_update`);
      } else if (!Array.isArray(decision.files_to_create_or_update)) {
        errors.push(`decision ${idx} files_to_create_or_update must be an array`);
      }
      if (!('risks_or_guardrails' in decision)) {
        errors.push(`decision ${idx} missing risks_or_guardrails`);
      } else if (!Array.isArray(decision.risks_or_guardrails)) {
        errors.push(`decision ${idx} risks_or_guardrails must be an array`);
      }
    });
  }

  if (errors.length) {
    console.error('assistant-decisions.v1.json validation failed:');
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  console.log('runtime/assistant-decisions.v1.json is valid.');
}

main();
