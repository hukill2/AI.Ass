#!/usr/bin/env node
// Usage: node scripts/list-prepared-executor-payloads-v1.js

const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'runtime', 'executor-payloads.v1.json');
let doc;
try {
  doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (err) {
  console.error(`Failed to read executor payloads: ${err.message}`);
  process.exit(1);
}

const payloads = Array.isArray(doc.payloads) ? doc.payloads : [];
console.log('--- Prepared Executor Payloads ---');
console.log(`Total payloads: ${payloads.length}`);
for (const payload of payloads) {
  console.log(`- payload_id: ${payload.payload_id}`);
  console.log(`  execution_id: ${payload.execution_id}`);
  console.log(`  decision_id: ${payload.decision_id}`);
  console.log(`  task_id: ${payload.task_id}`);
  console.log(`  recommended_next_step: ${payload.recommended_next_step}`);
}
process.exit(0);
