#!/usr/bin/env node
// Usage: node scripts/list-readonly-successful-executions-v1.js

const fs = require('fs');
const path = require('path');

function loadJson(relPath) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8'));
}

const candidatesDoc = loadJson('runtime/execution-candidates.v1.json');
const logsDoc = loadJson('runtime/execution-logs.v1.json');

if (!Array.isArray(candidatesDoc.candidates) || !Array.isArray(logsDoc.logs)) {
  console.error('Malformed execution candidates or logs.');
  process.exit(1);
}

const successLogs = logsDoc.logs.filter((log) => log.executor === 'qwen-readonly' && log.execution_result === 'success');
const successByExecution = new Map();
for (const log of successLogs) {
  successByExecution.set(log.execution_id, log);
}

const prepared = candidatesDoc.candidates.filter((candidate) => {
  return candidate.execution_status === 'execution_prepared' && successByExecution.has(candidate.execution_id);
});

console.log('--- Readonly-Successful Prepared Execution Candidates ---');
if (!prepared.length) {
  console.log('No execution_prepared candidates have passed a readonly qwen run yet.');
  process.exit(0);
}
console.log(`Total readonly-successful prepared candidates: ${prepared.length}`);
for (const candidate of prepared) {
  const log = successByExecution.get(candidate.execution_id);
  console.log(`- execution_id: ${candidate.execution_id}`);
  console.log(`  review_id: ${candidate.review_id}`);
  console.log(`  decision_id: ${candidate.decision_id}`);
  console.log(`  task_id: ${candidate.task_id}`);
  console.log(`  execution_status: ${candidate.execution_status}`);
  console.log(`  latest readonly log_id: ${log.execution_log_id}`);
}


