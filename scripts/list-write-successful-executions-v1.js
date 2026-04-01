#!/usr/bin/env node

// Usage: node scripts/list-write-successful-executions-v1.js

const fs = require('fs');
const path = require('path');

function load(relPath) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8'));
}

let data;
try {
  data = load('runtime/execution-logs.v1.json').logs || [];
} catch (err) {
  console.error(`Unable to read execution logs: ${err.message}`);
  process.exit(1);
}

const successful = data.filter(
  (log) => log.executor === 'qwen-write' && log.execution_result === 'success'
);

console.log('--- Successful Write Executions ---');
if (!successful.length) {
  console.log('No successful write-enabled executions found.');
  process.exit(0);
}

console.log(`Total successful write executions: ${successful.length}`);
successful.forEach((log) => {
  console.log(`- execution_log_id: ${log.execution_log_id}`);
  console.log(`  execution_id: ${log.execution_id}`);
  console.log(`  decision_id: ${log.decision_id}`);
  console.log(`  executor: ${log.executor}`);
  console.log(`  execution_result: ${log.execution_result}`);
  console.log(`  files_changed: ${Array.isArray(log.files_changed) ? log.files_changed.join(', ') : ''}`);
});
