#!/usr/bin/env node
// Usage: node scripts/validate-executor-payloads-v1.js

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

if (typeof doc.version !== 'string') {
  console.error('version must be a string');
  process.exit(1);
}

if (!Array.isArray(doc.payloads)) {
  console.error('payloads must be an array');
  process.exit(1);
}

for (const payload of doc.payloads) {
  const requiredStrings = ['payload_id','execution_id','review_id','decision_id','task_id','recommended_next_step','reasoning','operator_notes','prepared_at'];
  for (const key of requiredStrings) {
    if (typeof payload[key] !== 'string') {
      console.error(`payload ${payload.payload_id || '<unknown>'} missing or invalid string field: ${key}`);
      process.exit(1);
    }
  }
  if (!Array.isArray(payload.files_to_create_or_update)) {
    console.error(`payload ${payload.payload_id} files_to_create_or_update must be an array`);
    process.exit(1);
  }
  if (!Array.isArray(payload.risks_or_guardrails)) {
    console.error(`payload ${payload.payload_id} risks_or_guardrails must be an array`);
    process.exit(1);
  }
}

console.log(`executor payloads appear valid (${doc.payloads.length} entries).`);
process.exit(0);
