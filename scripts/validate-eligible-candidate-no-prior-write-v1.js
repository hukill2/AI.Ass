#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const LOGS_PATH = path.resolve(__dirname, '../runtime/execution-logs.v1.json');

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Eligible candidate write-check error: unable to load ${filePath} (${err.message})`);
    process.exit(1);
  }
}

function fail(message) {
  console.error(`Eligible candidate write-check error: ${message}`);
  process.exit(1);
}

function eligibleCandidates(candidates) {
  return candidates.filter((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return false;
    }
    const status = typeof candidate.execution_status === 'string' ? candidate.execution_status.trim() : '';
    return status && ['awaiting_execution', 'execution_prepared'].includes(status);
  });
}

const candidatesDoc = loadJson(CANDIDATES_PATH);
if (!Array.isArray(candidatesDoc.candidates)) {
  fail('"candidates" array missing');
}

const eligible = eligibleCandidates(candidatesDoc.candidates);
if (eligible.length !== 1) {
  console.log(
    `Eligible candidate write check skipped (${eligible.length} eligible candidate${
      eligible.length === 1 ? '' : 's'
    } present).`
  );
  process.exit(0);
}

const candidate = eligible[0];
const execId = candidate.execution_id;
if (!execId) {
  fail('eligible candidate missing execution_id');
}

const logsDoc = loadJson(LOGS_PATH);
if (!Array.isArray(logsDoc.logs)) {
  fail('"logs" array missing');
}

const hasPriorWrite = logsDoc.logs.some(
  (entry) =>
    entry &&
    entry.execution_id === execId &&
    entry.executor === 'qwen-write' &&
    entry.execution_result === 'success'
);

if (hasPriorWrite) {
  fail(`execution_id=${execId} already has a successful qwen-write log`);
}

console.log(`Eligible execution_id=${execId} has no prior successful qwen-write log.`);
process.exit(0);
