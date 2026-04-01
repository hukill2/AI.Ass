#!/usr/bin/env node
// Usage: node scripts/validate-codex-handoff-packets-v1.js

const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'runtime', 'codex-handoff-packets.v1.json');
let doc;
try {
  doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (err) {
  console.error(`Failed to read codex handoff packets: ${err.message}`);
  process.exit(1);
}

if (typeof doc.version !== 'string') {
  console.error('version must be a string');
  process.exit(1);
}

if (!Array.isArray(doc.packets)) {
  console.error('packets must be an array');
  process.exit(1);
}

for (const packet of doc.packets) {
  const requiredStrings = ['handoff_id','payload_id','execution_id','review_id','decision_id','task_id','executor_target','recommended_next_step','reasoning','operator_notes','prepared_at'];
  for (const key of requiredStrings) {
    if (typeof packet[key] !== 'string') {
      console.error(`packet ${packet.handoff_id || '<unknown>'} missing or invalid string field: ${key}`);
      process.exit(1);
    }
  }
  if (!Array.isArray(packet.files_to_create_or_update)) {
    console.error(`packet ${packet.handoff_id} files_to_create_or_update must be an array`);
    process.exit(1);
  }
  if (!Array.isArray(packet.risks_or_guardrails)) {
    console.error(`packet ${packet.handoff_id} risks_or_guardrails must be an array`);
    process.exit(1);
  }
}

console.log(`codex handoff packets appear valid (${doc.packets.length} entries).`);
process.exit(0);
