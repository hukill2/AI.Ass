#!/usr/bin/env node
// Usage: node scripts/summarize-execution-candidate-validator-suite-catalog-v1.js

const fs = require('fs');
const path = require('path');

const validators = [
  { name: 'Lane state validator', path: 'scripts/validate-all-review-lanes-state-v1.js', role: 'lane_state' },
  { name: 'Lane alignment validator', path: 'scripts/validate-review-lane-summary-alignment-v1.js', role: 'lane_state' },
  { name: 'Anomaly validator', path: 'scripts/validate-execution-candidate-anomalies-v1.js', role: 'anomaly' },
  { name: 'Unreviewed validator', path: 'scripts/validate-unreviewed-execution-state-v1.js', role: 'anomaly' },
  { name: 'Coverage validator', path: 'scripts/validate-execution-candidate-coverage-buckets-v1.js', role: 'coverage' },
  { name: 'View coverage validator', path: 'scripts/validate-execution-candidate-view-coverage-v1.js', role: 'coverage' },
  { name: 'Tooling inventory validator', path: 'scripts/validate-execution-candidate-tooling-inventory-v1.js', role: 'tooling' },
  { name: 'Tooling manifest validator', path: 'scripts/validate-execution-candidate-tooling-manifest-v1.js', role: 'tooling' },
  { name: 'Ops status validator', path: 'scripts/validate-execution-candidate-ops-status-v1.js', role: 'consolidated_status' },
  { name: 'Markdown status validator', path: 'scripts/validate-execution-candidate-status-markdown-v1.js', role: 'status_output' },
  { name: 'JSON status validator', path: 'scripts/validate-execution-candidate-status-json-v1.js', role: 'status_output' },
  { name: 'Output alignment validator', path: 'scripts/validate-execution-candidate-status-output-alignment-v1.js', role: 'status_output' },
  { name: 'Tooling catalog validator', path: 'scripts/validate-execution-candidate-tooling-catalog-v1.js', role: 'tooling' }
];

const report = validators.map((entry) => ({
  name: entry.name,
  path: entry.path,
  role: entry.role,
  present: fs.existsSync(path.resolve(__dirname, '..', entry.path))
}));

console.log(JSON.stringify({ validators: report }, null, 2));
