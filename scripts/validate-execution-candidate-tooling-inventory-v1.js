#!/usr/bin/env node
// Usage: node scripts/validate-execution-candidate-tooling-inventory-v1.js

const fs = require('fs');
const path = require('path');

const tooling = [
  'scripts/summarize-approved-execution-candidates-v1.js',
  'scripts/summarize-awaiting-approved-execution-v1.js',
  'scripts/summarize-pending-review-candidates-v1.js',
  'scripts/summarize-rejected-execution-candidates-v1.js',
  'scripts/summarize-execution-candidate-anomalies-v1.js',
  'scripts/validate-execution-candidate-anomalies-v1.js',
  'scripts/summarize-unreviewed-execution-candidates-v1.js',
  'scripts/validate-unreviewed-execution-state-v1.js',
  'scripts/summarize-execution-candidate-coverage-buckets-v1.js',
  'scripts/validate-execution-candidate-coverage-buckets-v1.js',
  'scripts/validate-execution-candidate-view-coverage-v1.js',
  'scripts/validate-all-review-lanes-state-v1.js',
  'scripts/validate-review-lane-summary-alignment-v1.js',
  'scripts/summarize-execution-candidate-tooling-inventory-v1.js'
];

let missing = [];

tooling.forEach((relPath) => {
  const fullPath = path.resolve(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) {
    missing.push(relPath);
  }
});

if (missing.length === 0) {
  console.log('Execution candidate tooling inventory is complete.');
  process.exit(0);
}

console.error('Missing tooling scripts:');
missing.forEach((pathRel) => console.error(`  - ${pathRel}`));
process.exit(1);
