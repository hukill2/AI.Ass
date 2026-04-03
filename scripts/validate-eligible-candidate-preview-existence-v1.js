#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const PREVIEW_PATH = path.resolve(__dirname, '../runtime/codex-invocation-previews.v1.json');

function fail(message) {
  console.error(`Eligible candidate preview existence error: ${message}`);
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
    `Eligible candidate preview existence check skipped (${eligible.length} eligible candidate${
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

const previewDoc = loadJson(PREVIEW_PATH);
if (!Array.isArray(previewDoc.previews)) {
  fail('"previews" array missing in codex-invocation-previews.v1.json');
}

const previewEntry = previewDoc.previews.find((entry) => entry && entry.decision_id === decisionId);
if (!previewEntry) {
  fail(`no preview packet recorded for decision_id=${decisionId}`);
}

const requiredFields = [
  'preview_id',
  'payload_id',
  'execution_id',
  'review_id',
  'decision_id',
  'task_id',
  'prepared_at'
];

for (const field of requiredFields) {
  if (!(field in previewEntry)) {
    fail(`preview packet ${previewEntry.preview_id || '<unknown>'} missing required field ${field}`);
  }
}

if (previewEntry.execution_id !== executionId) {
  fail(
    `preview packet ${previewEntry.preview_id} execution_id=${previewEntry.execution_id} does not match eligible execution_id=${executionId}`
  );
}

const preparedAt = new Date(previewEntry.prepared_at);
if (Number.isNaN(preparedAt.getTime())) {
  fail(`preview packet ${previewEntry.preview_id} has invalid prepared_at timestamp`);
}

console.log(
  `Eligible execution_id=${executionId} preview_id=${previewEntry.preview_id} exists with the required schema metadata.`
);
process.exit(0);
