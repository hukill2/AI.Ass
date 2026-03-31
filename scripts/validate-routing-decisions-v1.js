// Usage: node scripts/validate-routing-decisions-v1.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'mirror', 'routing-decisions.v1.json');

if (!fs.existsSync(filePath)) {
  console.error(`Missing file: ${filePath}`);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (err) {
  console.error(`Unable to parse routing decisions: ${err.message}`);
  process.exit(1);
}

const errors = [];
if (typeof data.version !== 'string') {
  errors.push('version must be a string.');
}
if (!Array.isArray(data.decisions)) {
  errors.push('decisions must be an array.');
}

if (Array.isArray(data.decisions)) {
  data.decisions.forEach((decision, idx) => {
    ['task_id', 'classification', 'risk', 'recommended_route', 'requires_approval', 'reasoning', 'notes', 'based_on'].forEach((field) => {
      if (!(field in decision)) {
        errors.push(`decision ${idx} missing ${field}`);
      }
    });

    if ('requires_approval' in decision && typeof decision.requires_approval !== 'boolean') {
      errors.push(`decision ${idx} requires_approval must be boolean.`);
    }

    ['classification', 'risk', 'recommended_route', 'reasoning', 'notes'].forEach((field) => {
      if (field in decision && typeof decision[field] !== 'string') {
        errors.push(`decision ${idx} ${field} must be a string.`);
      }
    });

    if ('based_on' in decision) {
      if (typeof decision.based_on !== 'object' || decision.based_on === null) {
        errors.push(`decision ${idx} based_on must be an object.`);
      } else {
        ['code_heavy', 'reasoning_heavy', 'ambiguous', 'multi_file', 'prior_pattern_used'].forEach((flag) => {
          if (!(flag in decision.based_on)) {
            errors.push(`decision ${idx} based_on missing ${flag}`);
          } else if (typeof decision.based_on[flag] !== 'boolean') {
            errors.push(`decision ${idx} based_on.${flag} must be boolean.`);
          }
        });
      }
    }
  });
}

if (errors.length) {
  console.error('Validation failed:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('routing-decisions.v1.json is valid.');
