#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const PAYLOADS_PATH = path.resolve(__dirname, '../runtime/executor-payloads.v1.json');

function fail(message) {
  console.error(`Eligible candidate payload schema error: ${message}`);
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
    `Eligible candidate payload schema check skipped (${eligible.length} eligible candidate${
      eligible.length === 1 ? '' : 's'
    } present).`
  );
  process.exit(0);
}

const candidate = eligible[0];
const execId = typeof candidate.execution_id === 'string' ? candidate.execution_id.trim() : '';
const payloadId = typeof candidate.payload_id === 'string' ? candidate.payload_id.trim() : '';
if (!execId) {
  fail('eligible candidate missing execution_id');
}

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
    typeof entry.execution_id === 'string' &&
    entry.execution_id.trim() === execId &&
    typeof entry.payload_id === 'string' &&
    entry.payload_id.trim() === payloadId
);

if (!payload) {
  fail(`unable to resolve executor payload payload_id=${payloadId} for execution_id=${execId}`);
}

const requiredFields = [
  'payload_id',
  'execution_id',
  'review_id',
  'decision_id',
  'task_id',
  'prepared_at',
  'files_to_create_or_update'
];

for (const field of requiredFields) {
  if (!(field in payload)) {
    fail(`executor payload payload_id=${payloadId} missing required field ${field}`);
  }
}

if (!Array.isArray(payload.files_to_create_or_update) || payload.files_to_create_or_update.length === 0) {
  fail(`executor payload payload_id=${payloadId} has empty files_to_create_or_update`);
}

const preparedAt = new Date(payload.prepared_at);
if (Number.isNaN(preparedAt.getTime())) {
  fail(`executor payload payload_id=${payloadId} has invalid prepared_at timestamp`);
}

console.log(
  `Eligible execution_id=${execId} payload_id=${payloadId} meets the expected payload schema requirements.`
);
process.exit(0);
