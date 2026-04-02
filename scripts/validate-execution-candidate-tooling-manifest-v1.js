#!/usr/bin/env node
// Usage: node scripts/validate-execution-candidate-tooling-manifest-v1.js

const fs = require('fs');
const path = require('path');

const { execFileSync } = require('child_process');
const manifestScript = path.resolve(__dirname, 'summarize-execution-candidate-tooling-manifest-v1.js');

if (!fs.existsSync(manifestScript)) {
  console.error('Tooling manifest generator missing; run summarize-execution-candidate-tooling-manifest-v1.js first.');
  process.exit(1);
}

let manifest;
try {
  const output = execFileSync(process.execPath, [manifestScript], { encoding: 'utf8' });
  manifest = JSON.parse(output);
} catch (err) {
  console.error(`Failed to generate manifest: ${err.message}`);
  process.exit(1);
}

if (!manifest || !Array.isArray(manifest.manifest)) {
  console.error('Manifest output malformed.');
  process.exit(1);
}

const missing = manifest.manifest.filter((entry) => !entry.exists).map((entry) => entry.path);

if (missing.length > 0) {
  console.error('Manifest validation failed; missing tools:');
  missing.forEach((pathRel) => console.error(`  - ${pathRel}`));
  process.exit(1);
}

console.log('Tooling manifest validation succeeded.');
process.exit(0);
