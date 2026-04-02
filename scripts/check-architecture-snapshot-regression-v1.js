#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const options = { baseline: null, current: null };

function usage() {
  console.error('Usage: node scripts/check-architecture-snapshot-regression-v1.js --baseline=PATH --current=PATH');
  process.exit(1);
}

args.forEach((arg) => {
  if (arg.startsWith('--baseline=')) {
    options.baseline = arg.split('=')[1];
    return;
  }
  if (arg.startsWith('--current=')) {
    options.current = arg.split('=')[1];
    return;
  }
  usage();
});

if (!options.baseline) {
  usage();
}
if (!options.current) {
  usage();
}

const validatorPath = path.join(__dirname, 'validate-architecture-snapshot-v1.js');
console.log('Snapshot regression guard: baseline=' + options.baseline + ', current=' + options.current);
const result = spawnSync(process.execPath, [validatorPath, options.baseline, options.current], {
  encoding: 'utf8',
});

if (result.stdout) {
  console.log(result.stdout.trim());
}
if (result.stderr) {
  console.error(result.stderr.trim());
}
if (result.error) {
  console.error('Validator execution failed:', result.error.message);
  process.exit(1);
}

if (result.status === 0) {
  console.log('Snapshot regression guard passed.');
  process.exit(0);
}

if (result.status === 2) {
  console.error('Snapshot regression detected.');
  process.exit(2);
}

console.error('Snapshot validator reported a validation error.');
process.exit(result.status ? result.status : 1);
