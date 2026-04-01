// Usage: node scripts/validate-task-context-v1.js
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'runtime', 'task-context.v1.json');

function exitError(message) {
  console.error(message);
  process.exit(1);
}

function loadJson() {
  if (!fs.existsSync(FILE_PATH)) {
    exitError(`Missing task context file: ${FILE_PATH}`);
  }
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch (err) {
    exitError(`Failed to parse task context file: ${err.message}`);
  }
}

function isString(value) {
  return typeof value === 'string';
}

function main() {
  const data = loadJson();
  const errors = [];
  const requiredStrings = ['task_id', 'task_summary', 'notes'];
  requiredStrings.forEach((key) => {
    if (!(key in data)) {
      errors.push(`missing ${key}`);
    } else if (!isString(data[key])) {
      errors.push(`${key} must be a string`);
    }
  });
  const requiredArrays = [
    'relevant_routing_examples',
    'relevant_learning_records',
    'relevant_review_state',
    'relevant_architecture_context',
  ];
  requiredArrays.forEach((key) => {
    if (!(key in data)) {
      errors.push(`missing ${key}`);
    } else if (!Array.isArray(data[key])) {
      errors.push(`${key} must be an array`);
    }
  });

  if (errors.length) {
    console.error('task-context.v1.json validation failed:');
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  console.log('runtime/task-context.v1.json is valid.');
}

main();
