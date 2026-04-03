#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const LOGS_PATH = path.resolve(__dirname, '../runtime/execution-logs.v1.json');

function fail(message) {
  console.error(`Eligible candidate readonly log freshness guard error: ${message}`);
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
    `Eligible candidate readonly log freshness guard check skipped (${eligible.length} eligible candidate${
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

const candidateUpdatedRaw = typeof candidate.updated_at === 'string' ? candidate.updated_at.trim() : '';
if (!candidateUpdatedRaw) {
  fail('eligible candidate missing updated_at');
}

const candidateUpdated = new Date(candidateUpdatedRaw);
if (Number.isNaN(candidateUpdated.getTime())) {
  fail('eligible candidate updated_at is not a valid timestamp');
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
  fail(`eligible execution_id=${execId} has no successful qwen-readonly log entries to verify freshness`);
}

const latestLog = relevantLogs.reduce((prev, curr) => {
  const prevDate = new Date(prev.created_at);
  const currDate = new Date(curr.created_at);
  return currDate > prevDate ? curr : prev;
});

const logTimestamp = new Date(latestLog.created_at);
if (isNaN(logTimestamp.getTime())) {
  fail(`latest qwen-readonly log for execution_id=${execId} lacks a valid created_at timestamp`);
}

if (logTimestamp < candidateUpdated) {
  fail(
    `latest qwen-readonly log (${latestLog.created_at}) predates candidate updated_at (${candidate.updated_at}); refresh the log or candidate`
  );
}

console.log(
  `Eligible execution_id=${execId} latest qwen-readonly log (${latestLog.created_at}) is at least as recent as candidate updated_at (${candidate.updated_at}).`
);
