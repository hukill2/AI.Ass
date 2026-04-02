#!/usr/bin/env node
const { execFileSync } = require('child_process');
const path = require('path');

const validators = [
  'validate-all-review-lanes-state-v1',
  'validate-review-lane-summary-alignment-v1',
  'validate-execution-candidate-anomalies-v1',
  'validate-unreviewed-execution-state-v1',
  'validate-execution-candidate-coverage-buckets-v1',
  'validate-execution-candidate-view-coverage-v1',
  'validate-execution-candidate-tooling-inventory-v1',
  'validate-execution-candidate-tooling-manifest-v1',
  'validate-execution-candidate-ops-status-v1',
  'validate-execution-candidate-status-markdown-v1',
  'validate-execution-candidate-status-json-v1',
  'validate-execution-candidate-status-output-alignment-v1',
  'validate-execution-candidate-tooling-catalog-v1'
];

function runScript(name) {
  const scriptPath = path.resolve(__dirname, name + '.js');
  try {
    execFileSync(process.execPath, [scriptPath], { stdio: 'ignore' });
    return 'pass';
  } catch {
    return 'fail';
  }
}

function parseSummary() {
  const summaryPath = path.resolve(__dirname, 'summarize-execution-candidate-validator-suite-status-v1.js');
  const output = execFileSync(process.execPath, [summaryPath], { encoding: 'utf8' });
  const lines = output.split('\n').map((line) => line.trim()).filter(Boolean);
  const results = {};
  let overall = 'fail';
  lines.forEach((line) => {
    if (line.startsWith('overall:')) {
      overall = line.split(':')[1].trim();
    } else if (line.includes(':')) {
      const [name, status] = line.split(':').map((part) => part.trim());
      if (name !== 'Execution candidate validator suite status') {
        results[name] = status;
      }
    }
  });
  return { results, overall };
}

const actual = {};
validators.forEach((validator) => {
  actual[validator] = runScript(validator);
});

const summary = parseSummary();
const missing = [];
const mismatched = [];
validators.forEach((validator) => {
  const summaryKey = validator;
  const summaryStatus = summary.results[summaryKey];
  if (!summaryStatus) {
    missing.push(summaryKey);
    return;
  }
  if (summaryStatus !== actual[validator]) {
    mismatched.push({ name: validator, summary: summaryStatus, actual: actual[validator] });
  }
});

if (summary.overall !== 'pass') {
  mismatched.push({ name: 'overall', summary: summary.overall, actual: Object.values(actual).every((s) => s === 'pass') ? 'pass' : 'fail' });
}

if (missing.length > 0 || mismatched.length > 0) {
  console.error('Validator suite validation failed.');
  if (missing.length > 0) {
    console.error('Missing status entries:');
    missing.forEach((name) => console.error(`  - ${name}`));
  }
  if (mismatched.length > 0) {
    console.error('Mismatched statuses:');
    mismatched.forEach((item) => console.error(`  - ${item.name}: summary=${item.summary} actual=${item.actual}`));
  }
  process.exit(1);
}

console.log('Validator suite status alignment OK.');
process.exit(0);
