// Usage: node scripts/assistant-decisions-status-report-v1.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FILE_PATH = path.join(__dirname, '..', 'runtime', 'assistant-decisions.v1.json');
const VALIDATOR = path.join(__dirname, 'validate-assistant-decisions-v1.js');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runValidator() {
  const result = spawnSync('node', [VALIDATOR], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });
  if (result.stdout) {
    console.log(result.stdout.trim());
  }
  if (result.stderr) {
    console.error(result.stderr.trim());
  }
  return result.status === 0;
}

function findMissing(decisions) {
  const missing = [];
  decisions.forEach((decision, index) => {
    const issues = [];
    ['decision_id', 'task_id', 'model', 'recommended_next_step'].forEach((field) => {
      if (!decision[field]) {
        issues.push(field);
      }
    });
    if (issues.length) {
      missing.push({
        index,
        title: decision.task_id || '<missing task>',
        id: decision.decision_id || '<missing id>',
        missing: issues,
      });
    }
  });
  return missing;
}

function main() {
  let data;
  try {
    data = readJson(FILE_PATH);
  } catch (err) {
    console.error(`Failed to read decisions store: ${err.message}`);
    process.exit(1);
  }

  const validationPassed = runValidator();
  const decisions = Array.isArray(data.decisions) ? data.decisions : [];
  const missing = findMissing(decisions);

  console.log('--- Assistant Decisions Status ---');
  console.log(`Version: ${data.version || 'unknown'}`);
  console.log(`Decision count: ${decisions.length}`);
  console.log(`Validation: ${validationPassed ? 'passed' : 'failed'}`);
  if (missing.length) {
    console.log('Decisions missing required fields:');
    missing.forEach((entry) => {
      console.log(
        `  - decision ${entry.index} (task_id=${entry.title}, decision_id=${entry.id}): missing ${entry.missing.join(', ')}`
      );
    });
  }
  console.log('----------------------------------');

  if (!validationPassed || missing.length) {
    process.exit(1);
  }
}

main();
