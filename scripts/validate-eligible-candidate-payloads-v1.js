#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const PAYLOADS_PATH = path.resolve(__dirname, '../runtime/executor-payloads.v1.json');

function fail(message) {
  console.error(`Eligible candidate payload error: ${message}`);
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
    `Eligible candidate payload check skipped (${eligible.length} eligible candidate${
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

const payloadsDoc = loadJson(PAYLOADS_PATH);
if (!Array.isArray(payloadsDoc.payloads)) {
  fail('"payloads" array missing in executor payloads');
}

const payload = payloadsDoc.payloads.find((entry) => entry.execution_id === execId);
if (!payload) {
  fail(`no executor payload record found for execution_id=${execId}`);
}

const payloadId = payload.payload_id;
if (!payloadId || typeof payloadId !== 'string' || !payloadId.trim()) {
  fail(`executor payload for ${execId} missing required payload_id`);
}

console.log(`Eligible execution_id=${execId} has a linked executor payload.`);
process.exit(0);
