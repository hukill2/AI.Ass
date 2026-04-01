#!/usr/bin/env node
// Usage: node scripts/list-execution-logs-v1.js

const fs = require('fs');
const path = require('path');
const filePath = path.resolve(__dirname, '..', 'runtime', 'execution-logs.v1.json');
let doc;
try {
  doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (err) {
  console.error(`Failed to read execution logs: ${err.message}`);
  process.exit(1);
}
const logs = Array.isArray(doc.logs) ? doc.logs : [];
console.log('--- Execution Logs ---');
console.log(`Total logs: ${logs.length}`);
for (const log of logs) {
  console.log(`- execution_log_id: ${log.execution_log_id}`);
  console.log(`  execution_id: ${log.execution_id}`);
  console.log(`  decision_id: ${log.decision_id}`);
  console.log(`  executor: ${log.executor}`);
  console.log(`  execution_result: ${log.execution_result}`);
}
process.exit(0);
