#!/usr/bin/env node
const { execFileSync } = require('child_process');
const path = require('path');

const summaryScript = path.resolve(__dirname, 'summarize-execution-candidate-validator-suite-status-v1.js');

const suiteOutput = execFileSync(process.execPath, [summaryScript], { encoding: 'utf8' });
const lines = suiteOutput.split('\n').map((line) => line.trim()).filter(Boolean);

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

const validatorStatus = {};
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

validators.forEach((validator) => {
  const scriptPath = path.resolve(__dirname, `${validator}.js`);
  try {
    execFileSync(process.execPath, [scriptPath], { stdio: 'ignore' });
    validatorStatus[validator] = 'pass';
  } catch {
    validatorStatus[validator] = 'fail';
  }
});

const errors = [];

validators.forEach((validator) => {
  if (!results[validator]) {
    errors.push(`missing markdown entry for ${validator}`);
  } else if (results[validator] !== validatorStatus[validator]) {
    errors.push(`${validator} markdown status ${results[validator]} != actual ${validatorStatus[validator]}`);
  }
});

const actualOverall = Object.values(validatorStatus).every((status) => status === 'pass') ? 'pass' : 'fail';
if (overall !== actualOverall) {
  errors.push(`overall markdown status ${overall} != actual ${actualOverall}`);
}

if (errors.length > 0) {
  console.error('Markdown suite validation failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('Markdown suite-status validation succeeded.');
process.exit(0);
