#!/usr/bin/env node
// Usage: node scripts/list-codex-handoff-packets-v1.js

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

const packets = Array.isArray(doc.packets) ? doc.packets : [];
console.log('--- Codex Handoff Packets ---');
console.log(`Total packets: ${packets.length}`);
for (const packet of packets) {
  console.log(`- handoff_id: ${packet.handoff_id}`);
  console.log(`  payload_id: ${packet.payload_id}`);
  console.log(`  execution_id: ${packet.execution_id}`);
  console.log(`  decision_id: ${packet.decision_id}`);
  console.log(`  task_id: ${packet.task_id}`);
  console.log(`  executor_target: ${packet.executor_target}`);
}
process.exit(0);
