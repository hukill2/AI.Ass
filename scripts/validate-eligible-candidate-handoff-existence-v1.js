#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const HANDOFF_PATH = path.resolve(__dirname, '../runtime/codex-handoff-packets.v1.json');

function fail(message) {
  console.error(`Eligible candidate handoff existence error: ${message}`);
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
    `Eligible candidate handoff existence check skipped (${eligible.length} eligible candidate${
      eligible.length === 1 ? '' : 's'
    } present).`
  );
  process.exit(0);
}

const candidate = eligible[0];
const executionId = typeof candidate.execution_id === 'string' ? candidate.execution_id.trim() : '';
if (!executionId) {
  fail('eligible candidate missing execution_id');
}

const decisionId = typeof candidate.decision_id === 'string' ? candidate.decision_id.trim() : '';
if (!decisionId) {
  fail(`eligible candidate ${executionId} missing decision_id`);
}

const handoffDoc = loadJson(HANDOFF_PATH);
if (!Array.isArray(handoffDoc.packets)) {
  fail('"packets" array missing in codex-handoff-packets.v1.json');
}

const handoffEntry = handoffDoc.packets.find((entry) => entry && entry.decision_id === decisionId);
if (!handoffEntry) {
  fail(`no handoff packet recorded for decision_id=${decisionId}`);
}

const requiredFields = [
  'handoff_id',
  'payload_id',
  'execution_id',
  'review_id',
  'decision_id',
  'task_id',
  'executor_target',
  'files_to_create_or_update',
  'prepared_at'
];

for (const field of requiredFields) {
  if (!(field in handoffEntry)) {
    fail(`handoff packet ${handoffEntry.handoff_id || '<unknown>'} missing required field ${field}`);
  }
}

if (handoffEntry.execution_id !== executionId) {
  fail(
    `handoff packet ${handoffEntry.handoff_id} execution_id=${handoffEntry.execution_id} does not match eligible execution_id=${executionId}`
  );
}

if (!Array.isArray(handoffEntry.files_to_create_or_update) || handoffEntry.files_to_create_or_update.length === 0) {
  fail(`handoff packet ${handoffEntry.handoff_id} has empty files_to_create_or_update`);
}

const preparedAt = new Date(handoffEntry.prepared_at);
if (Number.isNaN(preparedAt.getTime())) {
  fail(`handoff packet ${handoffEntry.handoff_id} has invalid prepared_at timestamp`);
}

console.log(
  `Eligible execution_id=${executionId} handoff_id=${handoffEntry.handoff_id} exists with the required schema metadata.`
);
process.exit(0);
