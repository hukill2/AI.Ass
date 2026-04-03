#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
let content;

try {
  content = fs.readFileSync(CANDIDATES_PATH, 'utf8');
} catch (err) {
  console.error(`Failed to read execution candidates: ${err.message}`);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(content);
} catch (err) {
  console.error(`Failed to parse execution candidates JSON: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(parsed.candidates)) {
  console.error('Execution candidates data missing "candidates" array.');
  process.exit(1);
}

const eligible = parsed.candidates.filter((candidate) => {
  if (!candidate) return false;
  const status = typeof candidate.execution_status === 'string' ? candidate.execution_status.trim() : '';
  return status && ['awaiting_execution', 'execution_prepared'].includes(status);
});

if (!eligible.length) {
  console.log('No eligible write-readiness candidates found (awaiting_execution/execution_prepared).');
  process.exit(0);
}

console.log('Eligible write-readiness candidates:');
eligible.forEach((candidate) => {
  const status = candidate.execution_status || '<unknown>';
  const execId = candidate.execution_id || '<missing>';
  const label = candidate.recommended_next_step || candidate.task_id || '<no task>';
  console.log(`- execution_id=${execId} status=${status} task=${label}`);
});

process.exit(0);
