#!/usr/bin/env node
// Usage: node scripts/validate-execution-candidate-tooling-catalog-v1.js

const fs = require('fs');
const path = require('path');

const catalogScript = path.resolve(__dirname, 'summarize-execution-candidate-tooling-catalog-v1.js');

if (!fs.existsSync(catalogScript)) {
  console.error('Tooling catalog generator missing.');
  process.exit(1);
}

const { execFileSync } = require('child_process');

const manifestText = execFileSync(process.execPath, [catalogScript], { encoding: 'utf8' });
const catalogOutput = JSON.parse(manifestText);

if (!catalogOutput || !Array.isArray(catalogOutput.catalog)) {
  console.error('Catalog output malformed.');
  process.exit(1);
}

const missing = [];
const invalidRole = [];

catalogOutput.catalog.forEach((entry) => {
  if (!['lane_summary', 'lane_validator', 'anomaly_tool', 'unreviewed_tool', 'coverage_tool', 'lane_validator', 'consolidated_status', 'status_output', 'tooling_inventory'].includes(entry.role)) {
    invalidRole.push(entry);
  }
  if (!fs.existsSync(path.resolve(__dirname, '..', entry.path))) {
    missing.push(entry.path);
  }
});

if (missing.length > 0 || invalidRole.length > 0) {
  if (missing.length > 0) {
    console.error('Missing catalog tools:');
    missing.forEach((pathRel) => console.error(`  - ${pathRel}`));
  }
  if (invalidRole.length > 0) {
    console.error('Entries with invalid roles:');
    invalidRole.forEach((entry) => console.error(`  - ${entry.name} (${entry.role})`));
  }
  process.exit(1);
}

console.log('Execution candidate tooling catalog validation succeeded.');
process.exit(0);
