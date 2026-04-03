#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');

function fail(message) {
  console.error(`Execution candidate schema error: ${message}`);
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync(CANDIDATES_PATH, 'utf8');
} catch (err) {
  fail(`unable to read ${CANDIDATES_PATH} (${err.message})`);
}

let doc;
try {
  doc = JSON.parse(raw);
} catch (err) {
  fail(`malformed JSON (${err.message})`);
}

if (!Array.isArray(doc.candidates)) {
  fail('"candidates" array missing');
}

const allowedStatuses = new Set(['awaiting_execution', 'execution_prepared', 'execution_in_progress', 'execution_completed']);

doc.candidates.forEach((candidate, index) => {
  if (!candidate || typeof candidate !== 'object') {
    fail(`entry ${index} is not an object`);
  }
  const fields = ['execution_id', 'execution_status', 'review_id', 'decision_id', 'task_id'];
  for (const field of fields) {
    if (!candidate[field] || typeof candidate[field] !== 'string' || !candidate[field].trim()) {
      fail(`entry ${index} missing or invalid ${field}`);
    }
  }
  const status = candidate.execution_status.trim();
  if (!allowedStatuses.has(status)) {
    fail(`entry ${index} has unexpected execution_status "${status}"`);
  }
});

console.log('Execution candidate schema validation passed.');
process.exit(0);
