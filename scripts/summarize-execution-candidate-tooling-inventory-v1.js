#!/usr/bin/env node
// Usage: node scripts/summarize-execution-candidate-tooling-inventory-v1.js

const fs = require('fs');
const path = require('path');

const tooling = [
  { name: 'Lane summary: summarize-approved-execution-candidates-v1', path: 'scripts/summarize-approved-execution-candidates-v1.js' },
  { name: 'Lane summary: summarize-awaiting-approved-execution-v1', path: 'scripts/summarize-awaiting-approved-execution-v1.js' },
  { name: 'Lane summary: summarize-pending-review-candidates-v1', path: 'scripts/summarize-pending-review-candidates-v1.js' },
  { name: 'Lane summary: summarize-rejected-execution-candidates-v1', path: 'scripts/summarize-rejected-execution-candidates-v1.js' },
  { name: 'Anomaly summary: summarize-execution-candidate-anomalies-v1', path: 'scripts/summarize-execution-candidate-anomalies-v1.js' },
  { name: 'Anomaly validator: validate-execution-candidate-anomalies-v1', path: 'scripts/validate-execution-candidate-anomalies-v1.js' },
  { name: 'Lane validator: validate-all-review-lanes-state-v1', path: 'scripts/validate-all-review-lanes-state-v1.js' },
  { name: 'Lane alignment validator: validate-review-lane-summary-alignment-v1', path: 'scripts/validate-review-lane-summary-alignment-v1.js' },
  { name: 'Coverage summary: summarize-execution-candidate-coverage-buckets-v1', path: 'scripts/summarize-execution-candidate-coverage-buckets-v1.js' },
  { name: 'Coverage validator: validate-execution-candidate-coverage-buckets-v1', path: 'scripts/validate-execution-candidate-coverage-buckets-v1.js' },
  { name: 'View coverage validator: validate-execution-candidate-view-coverage-v1', path: 'scripts/validate-execution-candidate-view-coverage-v1.js' },
  { name: 'Unreviewed summary: summarize-unreviewed-execution-candidates-v1', path: 'scripts/summarize-unreviewed-execution-candidates-v1.js' },
  { name: 'Unreviewed validator: validate-unreviewed-execution-state-v1', path: 'scripts/validate-unreviewed-execution-state-v1.js' },
  { name: 'Tooling alignment validator: validate-execution-candidate-tooling-inventory-v1 (this)', path: 'scripts/summarize-execution-candidate-tooling-inventory-v1.js' }
];

console.log('Execution candidate tooling inventory:');
tooling.forEach((tool) => {
  const exists = fs.existsSync(path.resolve(__dirname, '..', tool.path));
  console.log(`  ${tool.name}: ${exists ? 'present' : 'missing'}`);
});
