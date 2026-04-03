#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const LOGS_PATH = path.resolve(__dirname, '../runtime/execution-logs.v1.json');

function fail(message) {
  console.error(`Eligible candidate log error: ${message}`);
  process.exit(1);
}

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    fail(`unable to load ${p} (${err.message})`);
  }
}

const candidatesDoc = loadJson(CANDIDATES_PATH);
if (!Array.isArray(candidatesDoc.candidates)) {
  fail('"candidates" array missing');
}

const eligible = candidatesDoc.candidates.filter((candidate) => {
  if (!candidate || typeof candidate !== 'object') return false;
  const status = typeof candidate.execution_status === 'string' ? candidate.execution_status.trim() : '';
  return status && ['awaiting_execution', 'execution_prepared'].includes(status);
});

if (eligible.length !== 1) {
  console.log(
    `Eligible candidate log check skipped (${eligible.length} eligible candidate${
      eligible.length === 1 ? '' : 's'
    } present).`
  );
  process.exit(0);
}

const target = eligible[0];
const execId = target.execution_id;
if (!execId) {
  fail('eligible candidate missing execution_id');
}

const logDoc = loadJson(LOGS_PATH);
if (!Array.isArray(logDoc.logs)) {
  fail('"logs" array missing in execution logs');
}

const hasReadonly = logDoc.logs.some(
  (entry) =>
    entry &&
    entry.execution_id === execId &&
    entry.executor === 'qwen-readonly' &&
    entry.execution_result === 'success'
);

if (!hasReadonly) {
  fail(`no successful qwen-readonly log found for execution_id=${execId}`);
}

console.log(`Eligible execution_id=${execId} has a successful qwen-readonly log.`);
process.exit(0);
