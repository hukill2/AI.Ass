#!/usr/bin/env node
// Usage: node scripts/execute-codex-approved-item-dryrun-v1.js --execution-id <id>

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

const reviews = load('runtime/decision-reviews.v1.json').reviews || [];
const candidates = load('runtime/execution-candidates.v1.json').candidates || [];
const payloads = load('runtime/executor-payloads.v1.json').payloads || [];
const codexPackets = load('runtime/codex-handoff-packets.v1.json').packets || [];
const previews = load('runtime/codex-invocation-previews.v1.json').previews || [];
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
if (!candidate) {
  console.error(`Execution candidate ${executionId} not found.`);
  process.exit(1);
}

const review = reviews.find((r) => r.review_id === candidate.review_id);
if (!review || review.operator_status !== 'approved' || review.classification !== 'approval-required') {
  console.error('Review precondition failed.');
  process.exit(1);
}

const payload = payloads.find((p) => p.execution_id === executionId);
if (!payload) {
  console.error('Executor payload missing.');
  process.exit(1);
}

const packet = codexPackets.find((p) => p.payload_id === payload.payload_id);
if (!packet) {
  console.error('Codex handoff packet missing.');
  process.exit(1);
}

const preview = previews.find((p) => p.handoff_id === packet.handoff_id);
if (!preview) {
  console.error('Codex invocation preview missing.');
  process.exit(1);
}

const existingLog = logsDoc.logs.find((log) => log.execution_id === executionId && log.preview_id === preview.preview_id);
if (existingLog) {
  console.log('Dry-run execution log already exists for this chain.');
  console.log(`Total logs stored: ${logsDoc.logs.length}`);
  process.exit(0);
}

const logEntry = {
  execution_log_id: `log-${Date.now()}`,
  execution_id: executionId,
  review_id: review.review_id,
  decision_id: review.decision_id,
  payload_id: payload.payload_id,
  handoff_id: packet.handoff_id,
  preview_id: preview.preview_id,
  executor: 'codex-dryrun',
  execution_result: 'no_change',
  files_changed: [],
  notes: 'Dry-run only; no Codex invocation performed.',
  created_at: new Date().toISOString(),
};

logsDoc.logs.push(logEntry);
fs.writeFileSync(logsPath, JSON.stringify(logsDoc, null, 2) + '\n', 'utf8');

console.log('Dry-run execution log recorded.');
console.log(`execution_id: ${executionId}`);
console.log(`review_id: ${review.review_id}`);
console.log(`decision_id: ${review.decision_id}`);
console.log(`execution_result: ${logEntry.execution_result}`);
console.log(`Total logs stored: ${logsDoc.logs.length}`);
process.exit(0);
