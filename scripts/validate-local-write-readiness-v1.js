#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const execArgs = process.argv.slice(2);
const idIndex = execArgs.findIndex((arg) => arg.startsWith('--execution-id='));
if (idIndex < 0) {
  console.error('Usage: node scripts/validate-local-write-readiness-v1.js --execution-id=<id>');
  process.exit(1);
}

const executionId = execArgs[idIndex].split('=')[1];
if (!executionId) {
  console.error('Please provide a non-empty execution_id.');
  process.exit(1);
}

function load(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

const candidates = load(path.resolve(__dirname, '../runtime/execution-candidates.v1.json'));
if (!candidates) {
  console.error('Missing execution candidates data.');
  process.exit(1);
}

const candidate = candidates.candidates.find((item) => item.execution_id === executionId);
if (!candidate) {
  console.error(`No execution candidate found for ${executionId}.`);
  process.exit(1);
}

if (candidate.execution_status !== 'execution_prepared' && candidate.execution_status !== 'awaiting_execution') {
  console.error(`Execution ${executionId} is not ready (status=${candidate.execution_status}).`);
  process.exit(1);
}

const payloads = load(path.resolve(__dirname, '../runtime/executor-payloads.v1.json'));
if (!payloads) {
  console.error('Missing executor payload records.');
  process.exit(1);
}

const payload = payloads.payloads.find((item) => item.execution_id === executionId);
if (!payload) {
  console.error(`Missing executor payload for ${executionId}.`);
  process.exit(1);
}

if (!payload.payload_id) {
  console.error('Payload record is missing the required payload_id.');
  process.exit(1);
}

const logs = load(path.resolve(__dirname, '../runtime/execution-logs.v1.json'));
if (!logs || !Array.isArray(logs.logs)) {
  console.error('Missing execution logs.');
  process.exit(1);
}

const maxLogTimestamp = (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

const readonlySuccess = logs.logs
  .filter(
    (log) =>
      log.execution_id === executionId &&
      log.executor === 'qwen-readonly' &&
      log.execution_result === 'success' &&
      log.handoff_id &&
      log.handoff_id !== 'n/a' &&
      log.preview_id &&
      log.preview_id !== 'n/a'
  )
  .sort((a, b) => maxLogTimestamp(a, b));

if (!readonlySuccess.length) {
  console.error(`No successful qwen-readonly log with artifact metadata found for ${executionId}.`);
  process.exit(1);
}

const readonlyLog = readonlySuccess[readonlySuccess.length - 1];
const { handoff_id: handoffId, preview_id: previewId } = readonlyLog;

const dryrunLogs = load(path.resolve(__dirname, '../runtime/write-execution-dryrun-logs.v1.json'));
if (!dryrunLogs || !Array.isArray(dryrunLogs.logs)) {
  console.error('Missing write dry-run logs.');
  process.exit(1);
}
const dryrunSuccess = dryrunLogs.logs
  .filter(
    (log) =>
      log.execution_id === executionId &&
      log.executor === 'qwen-write-dryrun' &&
      log.execution_result === 'no_change'
  )
  .sort((a, b) => maxLogTimestamp(a, b));

if (!dryrunSuccess.length) {
  console.error(`No successful qwen-write-dryrun log found for ${executionId}.`);
  process.exit(1);
}

const latestDryrun = dryrunSuccess[dryrunSuccess.length - 1];

const handoff = load(path.resolve(__dirname, '../runtime/codex-handoff-packets.v1.json'));
if (!handoff) {
  console.error('Missing Codex handoff packet store.');
  process.exit(1);
}
const handoffEntry = handoff.packets.find((item) => item.handoff_id === handoffId);
if (!handoffEntry) {
  console.error(`No Codex handoff packet found for handoff_id=${handoffId}.`);
  process.exit(1);
}

const previewStore = load(path.resolve(__dirname, '../runtime/codex-invocation-previews.v1.json'));
if (!previewStore) {
  console.error('Missing Codex invocation preview store.');
  process.exit(1);
}
const previewEntry = previewStore.previews.find((item) => item.preview_id === previewId);
if (!previewEntry) {
  console.error(`No Codex invocation preview found for preview_id=${previewId}.`);
  process.exit(1);
}

console.log(
  `Execution ${executionId} is ready for real write execution. ` +
    `Candidate status=${candidate.execution_status}, payload_id=${payload.payload_id}, ` +
    `readonly_log=${readonlyLog.execution_log_id}, ` +
    `write_dryrun_log=${latestDryrun.write_dryrun_log_id}, handoff_id=${handoffId}, preview_id=${previewId}.`
);
