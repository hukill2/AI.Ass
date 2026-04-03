#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const LOGS_PATH = path.resolve(__dirname, '../runtime/execution-logs.v1.json');

function fail(message) {
  console.error(`Eligible candidate readonly log timestamp guard error: ${message}`);
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
    `Eligible candidate readonly log timestamp guard check skipped (${eligible.length} eligible candidate${
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
  const logExecId = typeof log.execution_id === 'string' ? log.execution_id.trim() : '';
  const executor = typeof log.executor === 'string' ? log.executor.trim().toLowerCase() : '';
  const result = typeof log.execution_result === 'string' ? log.execution_result.trim().toLowerCase() : '';
  return logExecId === execId && executor === 'qwen-readonly' && result === 'success';
});

if (relevantLogs.length === 0) {
  fail(`eligible execution_id=${execId} has no successful qwen-readonly log entries to verify`);
}

const parseDate = (value) => {
  try {
    return new Date(value);
  } catch {
    return new Date(0);
  }
};

const latestLog = relevantLogs.reduce((prev, curr) => {
  const prevDate = parseDate(prev.created_at);
  const currDate = parseDate(curr.created_at);
  return currDate > prevDate ? curr : prev;
});

const candidateFields = {
  payload_id: typeof candidate.payload_id === 'string' ? candidate.payload_id.trim() : '',
  review_id: typeof candidate.review_id === 'string' ? candidate.review_id.trim() : '',
  decision_id: typeof candidate.decision_id === 'string' ? candidate.decision_id.trim() : '',
  handoff_id: typeof candidate.handoff_id === 'string' ? candidate.handoff_id.trim() : '',
  preview_id: typeof candidate.preview_id === 'string' ? candidate.preview_id.trim() : ''
};

const mismatches = [];

for (const [key, value] of Object.entries(candidateFields)) {
  const logValue = typeof latestLog[key] === 'string' ? latestLog[key].trim() : '';
  if (value && logValue && logValue !== value) {
    mismatches.push(`${key}(candidate=${value},log=${logValue})`);
  }
  if (value && !logValue) {
    mismatches.push(`${key}(candidate=${value},log=missing)`);
  }
}

if (mismatches.length === 0) {
  console.log(
    `Eligible execution_id=${execId} has latest qwen-readonly log at ${latestLog.created_at} matching candidate metadata.`
  );
  process.exit(0);
}

fail(
  `eligible execution_id=${execId} latest qwen-readonly log ${latestLog.created_at} mismatches candidate metadata: ${mismatches.join(
    ', '
  )}`
);
