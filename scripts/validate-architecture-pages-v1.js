// Usage: node scripts/validate-architecture-pages-v1.js
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'mirror', 'architecture-pages.v1.json');

function exitError(message) {
  console.error(message);
  process.exit(1);
}

function loadJson() {
  if (!fs.existsSync(FILE_PATH)) {
    exitError(`Missing architecture pages file: ${FILE_PATH}`);
  }
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch (err) {
    exitError(`Failed to parse architecture pages file: ${err.message}`);
  }
}

function isString(value) {
  return typeof value === 'string';
}

function validatePage(page, index, errors) {
  const required = ['page_id', 'page_url', 'title', 'parent_title', 'created_at', 'updated_at', 'content'];
  required.forEach((field) => {
    if (!(field in page)) {
      errors.push(`page ${index} missing ${field}`);
    } else if (!isString(page[field])) {
      errors.push(`page ${index} ${field} must be a string`);
    }
  });
}

function validate(data) {
  const errors = [];
  if (!('version' in data)) {
    errors.push('missing version');
  } else if (!isString(data.version)) {
    errors.push('version must be a string');
  }
  if (!('root_title' in data)) {
    errors.push('missing root_title');
  } else if (!isString(data.root_title)) {
    errors.push('root_title must be a string');
  }
  if (!('pages' in data)) {
    errors.push('missing pages array');
  } else if (!Array.isArray(data.pages)) {
    errors.push('pages must be an array');
  } else {
    data.pages.forEach((page, idx) => {
      if (typeof page !== 'object' || page === null) {
        errors.push(`page ${idx} must be an object`);
      } else {
        validatePage(page, idx, errors);
      }
    });
  }
  return errors;
}

function main() {
  const data = loadJson();
  const errors = validate(data);
  if (errors.length) {
    console.error('Architecture pages validation failed:');
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }
  console.log('architecture-pages.v1.json is valid.');
}

main();
