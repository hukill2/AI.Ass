#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');

function fail(message) {
  console.error(`Execution candidate uniqueness error: ${message}`);
  process.exit(1);
}

let content;
try {
  content = fs.readFileSync(CANDIDATES_PATH, 'utf8');
} catch (err) {
  fail(`unable to read ${CANDIDATES_PATH} (${err.message})`);
}

let doc;
try {
  doc = JSON.parse(content);
} catch (err) {
  fail(`malformed JSON (${err.message})`);
}

if (!Array.isArray(doc.candidates)) {
  fail('"candidates" array missing');
}

const seen = new Map();
doc.candidates.forEach((candidate, index) => {
  if (!candidate || typeof candidate !== 'object') return;
  const executionId = candidate.execution_id;
  if (typeof executionId !== 'string' || !executionId.trim()) return;
  if (seen.has(executionId)) {
    const firstIndex = seen.get(executionId);
    fail(`duplicate execution_id "${executionId}" found at entries ${firstIndex} and ${index}`);
  }
  seen.set(executionId, index);
});

console.log('Execution candidate uniqueness validation passed.');
process.exit(0);
