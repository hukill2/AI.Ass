#!/usr/bin/env node
// Usage: node scripts/validate-execution-logs-v1.js

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
if (typeof doc.version !== 'string') {
  console.error('version must be a string');
  process.exit(1);
}
if (!Array.isArray(doc.logs)) {
  console.error('logs must be an array');
  process.exit(1);
}
for (const log of doc.logs) {
  const required = ['execution_log_id','execution_id','review_id','decision_id','payload_id','handoff_id','preview_id','executor','execution_result','notes','created_at'];
  for (const key of required) {
    if (typeof log[key] !== 'string') {
      console.error(`log ${log.execution_log_id || '<unknown>'} invalid field ${key}`);
      process.exit(1);
    }
  }
  if (!Array.isArray(log.files_changed)) {
    console.error(`log ${log.execution_log_id} files_changed must be an array`);
    process.exit(1);
  }
}
console.log(`execution logs appear valid (${doc.logs.length} entries).`);
process.exit(0);
