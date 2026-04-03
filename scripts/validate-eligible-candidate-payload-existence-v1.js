#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const PAYLOADS_PATH = path.resolve(__dirname, '../runtime/executor-payloads.v1.json');

function fail(message) {
  console.error(`Eligible candidate payload existence error: ${message}`);
  process.exit(1);
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    fail(`unable to load ${filePath} (${err.message})`);
  }
}

const candidatesDoc = loadJson(CANDIDATES_PATH);
if (!Array.isArray(candidatesDoc.candidates)) {
  fail('"candidates" array missing');
}

const eligible = candidatesDoc.candidates.filter((candidate) => {
  if (!candidate || typeof candidate !== 'object') return false;
  const status =
    typeof candidate.execution_status === 'string' ? candidate.execution_status.trim() : '';
  return status && ['awaiting_execution', 'execution_prepared'].includes(status);
});

if (eligible.length !== 1) {
  console.log(
    `Eligible candidate payload existence check skipped (${eligible.length} eligible candidate${
      eligible.length === 1 ? '' : 's'
    } present).`
  );
  process.exit(0);
}

const candidate = eligible[0];
const execId = typeof candidate.execution_id === 'string' ? candidate.execution_id.trim() : '';
if (!execId) {
  fail('eligible candidate missing execution_id');
}

const payloadId = typeof candidate.payload_id === 'string' ? candidate.payload_id.trim() : '';
if (!payloadId) {
  fail('eligible candidate missing payload_id');
}

const payloadsDoc = loadJson(PAYLOADS_PATH);
if (!Array.isArray(payloadsDoc.payloads)) {
  fail('"payloads" array missing');
}

const payload = payloadsDoc.payloads.find(
  (entry) =>
    entry &&
    entry.payload_id === payloadId &&
    typeof entry.execution_id === 'string' &&
    entry.execution_id.trim() === execId
);

if (!payload) {
  fail(
    `unable to resolve executor payload payload_id=${payloadId} for eligible execution_id=${execId}`
  );
}

console.log(
  `Eligible execution_id=${execId} payload_id=${payloadId} resolves to an executor payload record.`
);
process.exit(0);
