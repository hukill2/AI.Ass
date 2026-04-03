#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const LOGS_PATH = path.resolve(__dirname, '../runtime/execution-logs.v1.json');

function fail(message) {
  console.error(`Eligible candidate readonly log execution-id match error: ${message}`);
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
  const status = typeof candidate.execution_status === 'string' ? candidate.execution_status.trim() : '';
  return status && ['awaiting_execution', 'execution_prepared'].includes(status);
});

if (eligible.length !== 1) {
  console.log(
    `Eligible candidate readonly log execution-id match check skipped (${eligible.length} eligible candidate${
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

const logsDoc = loadJson(LOGS_PATH);
if (!Array.isArray(logsDoc.logs)) {
  fail('"logs" array missing');
}

const relevantLogs = logsDoc.logs.filter((log) => {
  if (!log || typeof log !== 'object') return false;
  const executor = typeof log.executor === 'string' ? log.executor.trim().toLowerCase() : '';
  const result = typeof log.execution_result === 'string' ? log.execution_result.trim().toLowerCase() : '';
  return executor === 'qwen-readonly' && result === 'success';
});

if (relevantLogs.length === 0) {
  fail(`eligible execution_id=${execId} has no successful qwen-readonly log entries to verify`);
}

const matchingLogs = relevantLogs.filter((log) => {
  const logExecId = typeof log.execution_id === 'string' ? log.execution_id.trim() : '';
  return logExecId === execId;
});

if (matchingLogs.length > 0) {
  console.log(`Eligible execution_id=${execId} has qwen-readonly log(s) with matching execution_id.`);
  process.exit(0);
}

const observedExecIds = Array.from(
  new Set(
    relevantLogs
      .map((log) => (typeof log.execution_id === 'string' ? log.execution_id.trim() : ''))
      .filter(Boolean)
  )
);

fail(
  `eligible execution_id=${execId} has qwen-readonly log entries for execution_ids=${observedExecIds.join(
    ','
  )} but none match the candidate execution_id`
);
