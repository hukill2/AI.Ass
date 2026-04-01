// Usage: node scripts/decision-reviews-status-report-v1.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FILE_PATH = path.join(__dirname, '..', 'runtime', 'decision-reviews.v1.json');
const VALIDATOR = path.join(__dirname, 'validate-decision-reviews-v1.js');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runValidator() {
  const result = spawnSync('node', [VALIDATOR], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });
  if (result.stdout) console.log(result.stdout.trim());
  if (result.stderr) console.error(result.stderr.trim());
  return result.status === 0;
}

function findMissing(reviews) {
  const missing = [];
  reviews.forEach((review, index) => {
    const issues = [];
    ['review_id', 'decision_id', 'classification', 'recommended_action', 'operator_status'].forEach(
      (field) => {
        if (!review[field]) issues.push(field);
      }
    );
    if (issues.length) {
      missing.push({
        index,
        review_id: review.review_id || '<missing>',
        task_id: review.task_id || '<missing>',
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
    console.error(err.message);
    process.exit(1);
  }
  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  const valid = runValidator();
  const missing = findMissing(reviews);
  console.log('--- Decision Reviews Status ---');
  console.log(`Version: ${data.version || 'unknown'}`);
  console.log(`Review count: ${reviews.length}`);
  console.log(`Validation: ${valid ? 'passed' : 'failed'}`);
  if (missing.length) {
    console.log('Missing fields:');
    missing.forEach((entry) => {
      console.log(
        `  - review ${entry.index} (decision_id=${entry.review_id}, task=${entry.task_id}): missing ${entry.missing.join(
          ', '
        )}`
      );
    });
  }
  console.log('--------------------------------');
  if (!valid || missing.length) process.exit(1);
}

main();
