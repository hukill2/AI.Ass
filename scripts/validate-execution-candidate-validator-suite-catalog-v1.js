#!/usr/bin/env node
// Usage: node scripts/validate-execution-candidate-validator-suite-catalog-v1.js

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const catalogScript = path.resolve(__dirname, 'summarize-execution-candidate-validator-suite-catalog-v1.js');

const output = execFileSync(process.execPath, [catalogScript], { encoding: 'utf8' });
const catalog = JSON.parse(output).validators || [];

const recognizedRoles = new Set([
  'lane_state',
  'anomaly',
  'coverage',
  'tooling',
  'consolidated_status',
  'status_output'
]);

const missing = [];
const invalidRoles = [];

catalog.forEach((entry) => {
  if (!recognizedRoles.has(entry.role)) {
    invalidRoles.push(entry);
  }
  if (!fs.existsSync(path.resolve(__dirname, '..', entry.path))) {
    missing.push(entry.path);
  }
});

if (missing.length > 0 || invalidRoles.length > 0) {
  if (missing.length > 0) {
    console.error('Missing validator scripts:');
    missing.forEach((value) => console.error(`  - ${value}`));
  }
  if (invalidRoles.length > 0) {
    console.error('Entries with invalid roles:');
    invalidRoles.forEach((entry) => console.error(`  - ${entry.name} (${entry.role})`));
  }
  process.exit(1);
}

console.log('Validator suite catalog validation succeeded.');
process.exit(0);
