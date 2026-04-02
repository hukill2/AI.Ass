#!/usr/bin/env node
// Usage: node scripts/summarize-execution-candidate-validator-suite-status-v1.js

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

const results = [];
validators.forEach((name) => {
  const scriptPath = path.resolve(__dirname, name + '.js');
  try {
    execFileSync(process.execPath, [scriptPath], { stdio: 'ignore' });
    results.push({ name, status: 'pass' });
  } catch (err) {
    results.push({ name, status: 'fail' });
  }
});

const suitePass = results.every((result) => result.status === 'pass');

console.log('Execution candidate validator suite status');
results.forEach((result) => {
  console.log(`  ${result.name}: ${result.status}`);
});
console.log(`overall: ${suitePass ? 'pass' : 'fail'}`);
process.exit(suitePass ? 0 : 1);
