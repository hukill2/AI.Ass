#!/usr/bin/env node
// Usage: node scripts/execute-executor-readonly-check-v1.js --execution-id <id>

const fs = require('fs');
const path = require('path');

function load(relPath) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8'));
}

const args = process.argv.slice(2);
const execIndex = args.findIndex((value) => value === '--execution-id');
const executionId = execIndex >= 0 ? args[execIndex + 1] : undefined;
if (!executionId) {
  console.error('Missing --execution-id.');
  process.exit(1);
}

const reviews = (load('runtime/decision-reviews.v1.json').reviews) || [];
const candidates = (load('runtime/execution-candidates.v1.json').candidates) || [];
const payloads = (load('runtime/executor-payloads.v1.json').payloads) || [];
const handoffs = (load('runtime/executor-handoff-packets.v1.json').packets) || [];
const previews = (load('runtime/executor-invocation-previews.v1.json').previews) || [];
const logsPath = path.resolve(__dirname, '..', 'runtime', 'execution-logs.v1.json');
let logsDoc;
try {
  logsDoc = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
} catch (err) {
  console.error(`Failed to read execution logs: ${err.message}`);
  process.exit(1);
}
if (!Array.isArray(logsDoc.logs)) {
  console.error('Execution log store malformed.');
  process.exit(1);
}

const candidate = candidates.find((c) => c.execution_id === executionId);
const review = candidate ? reviews.find((r) => r.review_id === candidate.review_id) : undefined;
const payload = candidate ? payloads.find((p) => p.execution_id === executionId) : undefined;
const handoff = payload ? handoffs.find((p) => p.payload_id === payload.payload_id) : undefined;
const preview = handoff ? previews.find((p) => p.handoff_id === handoff.handoff_id) : undefined;

const realExecutorExists = logsDoc.logs.some((log) => log.execution_id === executionId && log.executor !== 'executor-dryrun' && log.executor !== 'executor-readonly-check');
let executionResult = 'no_change';
let note = 'Read-only pre-execution eligibility check; no executor invocation performed.';

if (
  !candidate ||
  !review ||
  !payload ||
  !handoff ||
  !preview ||
  candidate.execution_status !== 'awaiting_execution' ||
  review.operator_status !== 'approved' ||
  !['approval-required', 'review-required'].includes(review.classification)
) {
  executionResult = 'blocked';
  note = 'Read-only check failed: missing approved chain or candidate no longer eligible.';
}
if (realExecutorExists) {
  executionResult = 'blocked';
  note = 'Read-only check blocked because a real executor executor log already exists for this execution_id.';
}

const logEntry = {
  execution_log_id: `log-${Date.now()}`,
  execution_id: executionId,
  review_id: review ? review.review_id : 'n/a',
  decision_id: review ? review.decision_id : 'n/a',
  payload_id: payload ? payload.payload_id : 'n/a',
  handoff_id: handoff ? handoff.handoff_id : 'n/a',
  preview_id: preview ? preview.preview_id : 'n/a',
  executor: 'executor-readonly-check',
  execution_result: executionResult,
  files_changed: [],
  notes: note,
  created_at: new Date().toISOString(),
};

logsDoc.logs.push(logEntry);
fs.writeFileSync(logsPath, JSON.stringify(logsDoc, null, 2) + '\n', 'utf8');

console.log('executor read-only check log recorded.');
console.log(`execution_id: ${executionId}`);
console.log(`review_id: ${logEntry.review_id}`);
console.log(`decision_id: ${logEntry.decision_id}`);
console.log(`execution_result: ${logEntry.execution_result}`);
console.log(`Total logs stored: ${logsDoc.logs.length}`);
process.exit(0);
