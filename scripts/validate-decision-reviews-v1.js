// Usage: node scripts/validate-decision-reviews-v1.js
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'runtime', 'decision-reviews.v1.json');

function exitError(msg) {
  console.error(msg);
  process.exit(1);
}

function loadJson() {
  if (!fs.existsSync(FILE_PATH)) exitError(`Missing file: ${FILE_PATH}`);
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch (err) {
    exitError(`Failed to parse ${FILE_PATH}: ${err.message}`);
  }
}

function mustBeString(value, field, index, errors) {
  if (!(field in value)) {
    errors.push(`review ${index} missing ${field}`);
  } else if (typeof value[field] !== 'string') {
    errors.push(`review ${index} ${field} must be a string`);
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
  if (!('reviews' in data)) {
    errors.push('missing reviews array');
  } else if (!Array.isArray(data.reviews)) {
    errors.push('reviews must be an array');
  } else {
    data.reviews.forEach((review, index) => {
      if (typeof review !== 'object' || review === null) {
        errors.push(`review ${index} must be an object`);
        return;
      }
      [
        'review_id',
        'decision_id',
        'task_id',
        'classification',
        'recommended_action',
        'operator_status',
        'operator_notes',
        'created_at',
        'updated_at',
      ].forEach((field) => mustBeString(review, field, index, errors));
    });
  }
  if (errors.length) {
    console.error('decision-reviews.v1.json validation failed:');
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }
  console.log('runtime/decision-reviews.v1.json is valid.');
}

main();
