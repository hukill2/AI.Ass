#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const LOGS_PATH = path.resolve(__dirname, '../runtime/execution-logs.v1.json');
const HANDOFF_PATH = path.resolve(__dirname, '../runtime/executor-handoff-packets.v1.json');
const PREVIEW_PATH = path.resolve(__dirname, '../runtime/executor-invocation-previews.v1.json');

function fail(message) {
  console.error(`Eligible candidate artifact error: ${message}`);
  process.exit(1);
}

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    fail(`unable to load ${p} (${err.message})`);
  }
}

function selectEligible(candidates) {
  return candidates.filter((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const status = typeof candidate.execution_status === 'string' ? candidate.execution_status.trim() : '';
    return status && ['awaiting_execution', 'execution_prepared'].includes(status);
  });
}

const candidatesDoc = loadJson(CANDIDATES_PATH);
if (!Array.isArray(candidatesDoc.candidates)) {
  fail('"candidates" array missing');
}

const eligible = selectEligible(candidatesDoc.candidates);
if (eligible.length !== 1) {
  console.log(
    `Eligible candidate handoff/preview check skipped (${eligible.length} eligible candidate${
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

const logsDoc = loadJson(LOGS_PATH);
if (!Array.isArray(logsDoc.logs)) {
  fail('"logs" array missing in execution logs');
}

function newestLog(executor) {
  return logsDoc.logs
    .filter(
      (entry) =>
        entry &&
        entry.execution_id === execId &&
        entry.executor === executor &&
        typeof entry.execution_result === 'string' &&
        entry.execution_result === 'success'
    )
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
}

const eligibleLog = logsDoc.logs
  .filter(
    (entry) =>
      entry &&
      entry.execution_id === execId &&
      ['qwen-write', 'qwen-readonly'].includes(entry.executor) &&
      entry.execution_result === 'success' &&
      entry.handoff_id &&
      entry.handoff_id.trim() &&
      entry.preview_id &&
      entry.preview_id.trim()
  )
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

if (!eligibleLog) {
  fail(`no qwen-write/qwen-readonly log with handoff/preview found for execution_id=${execId}`);
}

const { handoff_id: handoffId, preview_id: previewId } = eligibleLog;

const handoffDoc = loadJson(HANDOFF_PATH);
if (!Array.isArray(handoffDoc.packets)) {
  fail('"packets" array missing in executor handoff packets');
}
if (!handoffDoc.packets.find((packet) => packet.handoff_id === handoffId)) {
  fail(`no executor handoff packet found for handoff_id=${handoffId}`);
}

const previewDoc = loadJson(PREVIEW_PATH);
if (!Array.isArray(previewDoc.previews)) {
  fail('"previews" array missing in executor invocation previews');
}
if (!previewDoc.previews.find((preview) => preview.preview_id === previewId)) {
  fail(`no executor invocation preview found for preview_id=${previewId}`);
}

console.log(`Eligible execution_id=${execId} has linked handoff=${handoffId} and preview=${previewId}.`);
process.exit(0);
