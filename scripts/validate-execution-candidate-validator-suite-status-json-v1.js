#!/usr/bin/env node
const { execFileSync } = require('child_process');
const path = require('path');

function runValidator(name) {
  const script = path.resolve(__dirname, `${name}.js`);
  try {
    execFileSync(process.execPath, [script], { stdio: 'ignore' });
    return 'pass';
  } catch {
    return 'fail';
  }
}

function generateJsonSummary() {
  const summaryScript = path.resolve(__dirname, 'summarize-execution-candidate-validator-suite-status-json-v1.js');
  const output = execFileSync(process.execPath, [summaryScript], { encoding: 'utf8' });
  return JSON.parse(output);
}

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

const actualStatus = {};
validators.forEach((name) => {
  actualStatus[name] = runValidator(name);
});

const summary = generateJsonSummary();
const errors = [];

if (summary.overall !== 'pass' && !Object.values(actualStatus).some((status) => status === 'fail')) {
  errors.push(`overall summary ${summary.overall} inconsistent with actual`);
}

if (summary.overall === 'pass' && Object.values(actualStatus).some((status) => status === 'fail')) {
  errors.push('overall summary pass but actual failure present');
}

Object.keys(actualStatus).forEach((name) => {
  const expected = actualStatus[name];
  const reported = summary.validators[name];
  if (!reported) {
    errors.push(`missing validator entry for ${name}`);
  } else if (reported !== expected) {
    errors.push(`${name} summary=${reported} actual=${expected}`);
  }
});

const total = validators.length;
if (summary.total_validators !== total) {
  errors.push(`total_validators ${summary.total_validators} != ${total}`);
}

const passedCount = Object.values(actualStatus).filter((status) => status === 'pass').length;
const failedCount = total - passedCount;
if (summary.passed !== passedCount) {
  errors.push(`passed count mismatch ${summary.passed} != ${passedCount}`);
}
if (summary.failed !== failedCount) {
  errors.push(`failed count mismatch ${summary.failed} != ${failedCount}`);
}

if (errors.length > 0) {
  console.error('JSON suite-status validation failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('JSON suite-status validation succeeded.');
process.exit(0);
