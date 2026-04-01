// Usage: node scripts/execution-candidates-status-report-v1.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FILE_PATH = path.join(__dirname, '..', 'runtime', 'execution-candidates.v1.json');
const VALIDATOR = path.join(__dirname, 'validate-execution-candidates-v1.js');

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

function findMissing(candidates) {
  const missing = [];
  candidates.forEach((candidate, index) => {
    const issues = [];
    ['execution_id', 'review_id', 'decision_id', 'execution_status'].forEach((field) => {
      if (!candidate[field]) issues.push(field);
    });
    if (issues.length) {
      missing.push({ index, candidate, missing: issues });
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
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const valid = runValidator();
  const missing = findMissing(candidates);
  const statusCounts = candidates.reduce((acc, candidate) => {
    const status = candidate.execution_status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  console.log('--- Execution Candidates Status ---');
  console.log(`Version: ${data.version || 'unknown'}`);
  console.log(`Candidate count: ${candidates.length}`);
  console.log(`Validation: ${valid ? 'passed' : 'failed'}`);
  console.log('Status counts:');
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });
  if (missing.length) {
    console.log('Missing required fields:');
    missing.forEach((entry) => {
      console.log(
        `  - candidate ${entry.index} review=${entry.candidate.review_id} missing ${entry.missing.join(', ')}`
      );
    });
  }
  console.log('----------------------------------');
  if (!valid || missing.length) process.exit(1);
}

main();
