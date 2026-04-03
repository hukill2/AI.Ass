#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const guardPath = path.resolve(__dirname, '../logs/prompt-template-guard.json');

if (!fs.existsSync(guardPath)) {
  console.error(`Guard artifact missing at ${guardPath}.`);
  process.exit(1);
}

try {
  const raw = fs.readFileSync(guardPath, 'utf8').trim();
  if (!raw) {
    throw new Error('empty file');
  }
  const detail = JSON.parse(raw);
  const parts = [];
  if (detail.status) parts.push(`status=${detail.status}`);
  if (detail.reason) parts.push(`reason=${detail.reason}`);
  if (detail.template) parts.push(`template=${detail.template}`);
  if (detail.lastRefreshed) parts.push(`lastRefreshed=${detail.lastRefreshed}`);
  console.log(`Stored guard detail: ${parts.join(', ')}`);
} catch (err) {
  console.error(`Failed to read guard artifact: ${err.message}`);
  process.exit(1);
}
