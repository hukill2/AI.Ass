#!/usr/bin/env node
// Usage: node scripts/summarize-execution-candidate-tooling-catalog-v1.js

const fs = require('fs');
const path = require('path');

const catalog = [
  { name: 'Approved lane summary', path: 'scripts/summarize-approved-execution-candidates-v1.js', role: 'lane_summary' },
  { name: 'Awaiting approved lane summary', path: 'scripts/summarize-awaiting-approved-execution-v1.js', role: 'lane_summary' },
  { name: 'Pending review lane summary', path: 'scripts/summarize-pending-review-candidates-v1.js', role: 'lane_summary' },
  { name: 'Rejected lane summary', path: 'scripts/summarize-rejected-execution-candidates-v1.js', role: 'lane_summary' },
  { name: 'Anomaly summary', path: 'scripts/summarize-execution-candidate-anomalies-v1.js', role: 'anomaly_tool' },
  { name: 'Anomaly validator', path: 'scripts/validate-execution-candidate-anomalies-v1.js', role: 'anomaly_tool' },
  { name: 'Unreviewed summary', path: 'scripts/summarize-unreviewed-execution-candidates-v1.js', role: 'unreviewed_tool' },
  { name: 'Unreviewed validator', path: 'scripts/validate-unreviewed-execution-state-v1.js', role: 'unreviewed_tool' },
  { name: 'Coverage summary', path: 'scripts/summarize-execution-candidate-coverage-buckets-v1.js', role: 'coverage_tool' },
  { name: 'Coverage validator', path: 'scripts/validate-execution-candidate-coverage-buckets-v1.js', role: 'coverage_tool' },
  { name: 'View coverage validator', path: 'scripts/validate-execution-candidate-view-coverage-v1.js', role: 'coverage_tool' },
  { name: 'Lane validator', path: 'scripts/validate-all-review-lanes-state-v1.js', role: 'lane_validator' },
  { name: 'Alignment validator', path: 'scripts/validate-review-lane-summary-alignment-v1.js', role: 'lane_validator' },
  { name: 'Ops status summary', path: 'scripts/summarize-execution-candidate-ops-status-v1.js', role: 'consolidated_status' },
  { name: 'Ops status validator', path: 'scripts/validate-execution-candidate-ops-status-v1.js', role: 'consolidated_status' },
  { name: 'Markdown status summary', path: 'scripts/summarize-execution-candidate-status-markdown-v1.js', role: 'status_output' },
  { name: 'Markdown status validator', path: 'scripts/validate-execution-candidate-status-markdown-v1.js', role: 'status_output' },
  { name: 'JSON status summary', path: 'scripts/summarize-execution-candidate-status-json-v1.js', role: 'status_output' },
  { name: 'JSON status validator', path: 'scripts/validate-execution-candidate-status-json-v1.js', role: 'status_output' },
  { name: 'Output alignment validator', path: 'scripts/validate-execution-candidate-status-output-alignment-v1.js', role: 'status_output' },
  { name: 'Tooling inventory summary', path: 'scripts/summarize-execution-candidate-tooling-inventory-v1.js', role: 'tooling_inventory' },
  { name: 'Tooling inventory validator', path: 'scripts/validate-execution-candidate-tooling-inventory-v1.js', role: 'tooling_inventory' },
  { name: 'Tooling manifest generator', path: 'scripts/summarize-execution-candidate-tooling-manifest-v1.js', role: 'tooling_inventory' },
  { name: 'Tooling manifest validator', path: 'scripts/validate-execution-candidate-tooling-manifest-v1.js', role: 'tooling_inventory' }
];

const report = catalog.map((entry) => ({
  name: entry.name,
  path: entry.path,
  role: entry.role,
  present: fs.existsSync(path.resolve(__dirname, '..', entry.path))
}));

console.log(JSON.stringify({ catalog: report }, null, 2));
