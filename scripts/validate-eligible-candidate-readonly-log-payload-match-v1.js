#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const PAYLOADS_PATH = path.resolve(__dirname, '../runtime/executor-payloads.v1.json');
const LOGS_PATH = path.resolve(__dirname, '../runtime/execution-logs.v1.json');

function fail(message) {
  console.error(`Eligible candidate readonly log payload match error: ${message}`);
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
    `Eligible candidate readonly log payload match check skipped (${eligible.length} eligible candidate${
      eligible.length === 1 ? '' : 's'
    } present).`
  );
  process.exit(0);
}

const candidate = eligible[0];
const execId = candidate.execution_id;
if (!execId || typeof execId !== 'string' || !execId.trim()) {
  fail('eligible candidate missing execution_id');
}

const payloadsDoc = loadJson(PAYLOADS_PATH);
if (!Array.isArray(payloadsDoc.payloads)) {
  fail('"payloads" array missing in executor payloads');
}

const payload = payloadsDoc.payloads.find((entry) => entry && entry.execution_id === execId);
if (!payload || typeof payload.payload_id !== 'string' || !payload.payload_id.trim()) {
  fail(`eligible candidate ${execId} lacks a linked executor payload with payload_id`);
}

const payloadId = payload.payload_id.trim();

const logsDoc = loadJson(LOGS_PATH);
if (!Array.isArray(logsDoc.logs)) {
  fail('"logs" array missing in execution-logs.v1.json');
}

const relevantLogs = logsDoc.logs.filter((log) => {
  if (!log || typeof log !== 'object') return false;
  const logExecId = typeof log.execution_id === 'string' ? log.execution_id.trim() : '';
  const executor = typeof log.executor === 'string' ? log.executor.trim().toLowerCase() : '';
  const result = typeof log.execution_result === 'string' ? log.execution_result.trim().toLowerCase() : '';
  return logExecId === execId && executor === 'qwen-readonly' && result === 'success';
});

if (relevantLogs.length === 0) {
  fail(`eligible execution_id=${execId} has no successful qwen-readonly log to verify`);
}

const matching = relevantLogs.filter((log) => {
  const logPayloadId = typeof log.payload_id === 'string' ? log.payload_id.trim() : '';
  return logPayloadId === payloadId;
});

if (matching.length > 0) {
  console.log(
    `Eligible execution_id=${execId} paged qwen-readonly log matches payload_id=${payloadId}.`
  );
  process.exit(0);
}

const observedPayloads = Array.from(new Set(
  relevantLogs
    .map((log) => (typeof log.payload_id === 'string' ? log.payload_id.trim() : ''))
    .filter(Boolean)
));

if (observedPayloads.length === 0) {
  fail(
    `eligible execution_id=${execId} has successful qwen-readonly log(s) without payload_id while candidate references payload_id=${payloadId}`
  );
}

fail(
  `eligible execution_id=${execId} references payload_id=${payloadId} but qwen-readonly log(s) cite payload_id(s)=${observedPayloads.join(',')}`
);
