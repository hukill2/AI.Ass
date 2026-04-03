#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const LOGS_PATH = path.resolve(__dirname, '../runtime/execution-logs.v1.json');
const HANDOFF_PATH = path.resolve(__dirname, '../runtime/codex-handoff-packets.v1.json');
const PREVIEW_PATH = path.resolve(__dirname, '../runtime/codex-invocation-previews.v1.json');

function fail(message) {
  console.error(`Eligible candidate readonly log handoff/preview match error: ${message}`);
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
    `Eligible candidate readonly log handoff/preview match check skipped (${eligible.length} eligible candidate${
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

const decisionId = typeof candidate.decision_id === 'string' ? candidate.decision_id.trim() : '';
if (!decisionId) {
  fail(`eligible candidate ${execId} missing decision_id`);
}

const handoffDoc = loadJson(HANDOFF_PATH);
if (!Array.isArray(handoffDoc.packets)) {
  fail('"packets" array missing in codex-handoff-packets.v1.json');
}
const handoffEntry = handoffDoc.packets.find((entry) => entry && entry.decision_id === decisionId);
if (!handoffEntry || typeof handoffEntry.handoff_id !== 'string' || !handoffEntry.handoff_id.trim()) {
  fail(`no handoff_id recorded for decision_id=${decisionId}`);
}
const handoffId = handoffEntry.handoff_id.trim();

const previewDoc = loadJson(PREVIEW_PATH);
if (!Array.isArray(previewDoc.previews)) {
  fail('"previews" array missing in codex-invocation-previews.v1.json');
}
const previewEntry = previewDoc.previews.find((entry) => entry && entry.decision_id === decisionId);
if (!previewEntry || typeof previewEntry.preview_id !== 'string' || !previewEntry.preview_id.trim()) {
  fail(`no preview_id recorded for decision_id=${decisionId}`);
}
const previewId = previewEntry.preview_id.trim();

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
  const logHandoffId = typeof log.handoff_id === 'string' ? log.handoff_id.trim() : '';
  const logPreviewId = typeof log.preview_id === 'string' ? log.preview_id.trim() : '';
  return logHandoffId === handoffId && logPreviewId === previewId;
});

if (matching.length > 0) {
  console.log(
    `Eligible execution_id=${execId} qwen-readonly log matches handoff_id=${handoffId} and preview_id=${previewId}.`
  );
  process.exit(0);
}

const observedPairs = Array.from(
  new Set(
    relevantLogs
      .map((log) => {
        const logHandoffId = typeof log.handoff_id === 'string' ? log.handoff_id.trim() : '';
        const logPreviewId = typeof log.preview_id === 'string' ? log.preview_id.trim() : '';
        return logHandoffId && logPreviewId ? `${logHandoffId}:${logPreviewId}` : '';
      })
      .filter(Boolean)
  )
);

if (observedPairs.length === 0) {
  fail(
    `eligible execution_id=${execId} has qwen-readonly log(s) lacking handoff_id/preview_id while candidate references handoff_id=${handoffId}, preview_id=${previewId}`
  );
}

fail(
  `eligible execution_id=${execId} references handoff_id=${handoffId}, preview_id=${previewId} but qwen-readonly log(s) cite handoff/preview pairs=${observedPairs.join(
    ','
  )}`
);
