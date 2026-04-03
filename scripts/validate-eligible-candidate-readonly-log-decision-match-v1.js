#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const LOGS_PATH = path.resolve(__dirname, '../runtime/execution-logs.v1.json');

function fail(message) {
  console.error(`Eligible candidate readonly log decision match error: ${message}`);
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
    `Eligible candidate readonly log decision match check skipped (${eligible.length} eligible candidate${
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

const reviewId = typeof candidate.review_id === 'string' ? candidate.review_id.trim() : '';
if (!reviewId) {
  fail(`eligible candidate ${execId} missing review_id`);
}

const decisionId = typeof candidate.decision_id === 'string' ? candidate.decision_id.trim() : '';
if (!decisionId) {
  fail(`eligible candidate ${execId} missing decision_id`);
}

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
  const logReviewId = typeof log.review_id === 'string' ? log.review_id.trim() : '';
  const logDecisionId = typeof log.decision_id === 'string' ? log.decision_id.trim() : '';
  return logReviewId === reviewId && logDecisionId === decisionId;
});

if (matching.length > 0) {
  console.log(
    `Eligible execution_id=${execId} qwen-readonly log matches review_id=${reviewId} and decision_id=${decisionId}.`
  );
  process.exit(0);
}

const observedPairs = Array.from(
  new Set(
    relevantLogs
      .map((log) => {
        const logReviewId = typeof log.review_id === 'string' ? log.review_id.trim() : '';
        const logDecisionId = typeof log.decision_id === 'string' ? log.decision_id.trim() : '';
        return logReviewId && logDecisionId ? `${logReviewId}:${logDecisionId}` : '';
      })
      .filter(Boolean)
  )
);

if (observedPairs.length === 0) {
  fail(
    `eligible execution_id=${execId} has qwen-readonly log(s) lacking review_id/decision_id while candidate links to review_id=${reviewId}, decision_id=${decisionId}`
  );
}

fail(
  `eligible execution_id=${execId} references review_id=${reviewId}, decision_id=${decisionId} but qwen-readonly log(s) cite review/decision pairs=${observedPairs.join(
    ','
  )}`
);
