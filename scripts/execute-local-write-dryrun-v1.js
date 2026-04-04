#!/usr/bin/env node
// Usage: node scripts/execute-local-write-dryrun-v1.js --execution-id <id>

const fs = require('fs');
const path = require('path');

function load(relPath) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8'));
}

const args = process.argv.slice(2);
const idIndex = args.indexOf('--execution-id');
const executionId = idIndex >= 0 ? args[idIndex + 1] : undefined;
if (!executionId) {
  console.error('Missing --execution-id.');
  process.exit(1);
}

const reviews = load('runtime/decision-reviews.v1.json').reviews || [];
const candidates = load('runtime/execution-candidates.v1.json').candidates || [];
const logs = load('runtime/execution-logs.v1.json').logs || [];
const payloads = load('runtime/executor-payloads.v1.json').payloads || [];
const handoffs = load('runtime/executor-handoff-packets.v1.json').packets || [];
const previews = load('runtime/executor-invocation-previews.v1.json').previews || [];
const dryrunPath = path.resolve(__dirname, '..', 'runtime', 'write-execution-dryrun-logs.v1.json');
let dryrunDoc;
try {
  dryrunDoc = JSON.parse(fs.readFileSync(dryrunPath, 'utf8'));
} catch (err) {
  console.error(`Failed to read dry-run logs: ${err.message}`);
  process.exit(1);
}
if (!Array.isArray(dryrunDoc.logs)) {
  console.error('Write dry-run log store malformed.');
  process.exit(1);
}

const candidate = candidates.find((c) => c.execution_id === executionId);
if (!candidate) {
  console.error(`Execution candidate ${executionId} not found.`);
  process.exit(1);
}
const review = reviews.find((r) => r.review_id === candidate.review_id);
const readonlyLog = logs.find((log) => log.execution_id === executionId && log.executor === 'qwen-readonly' && log.execution_result === 'success');
const writeLogExists = dryrunDoc.logs.some((log) => log.execution_id === executionId);
const files = candidate.files_to_create_or_update || [];
const blockedKeywords = ['refactor','architecture','guardrail','routing','approval','integration'];
const summary = (candidate.recommended_next_step || '').toLowerCase();
const blocked = blockedKeywords.some((kw) => summary.includes(kw));

let executionResult = 'no_change';
let notes = 'Dry-run write would validate or update target files without modifying the repo.';
if (!review || !['approval-required','review-required'].includes(review.classification) || review.operator_status !== 'approved') {
  executionResult = 'blocked';
  notes = 'Write dry-run blocked: review not approved.';
}
if (candidate.execution_status !== 'execution_prepared') {
  executionResult = 'blocked';
  notes = 'Write dry-run blocked: candidate not in execution_prepared state.';
}
if (!readonlyLog) {
  executionResult = 'blocked';
  notes = 'Write dry-run blocked: no successful readonly execution log.';
}
if (!files.length) {
  executionResult = 'blocked';
  notes = 'Write dry-run blocked: no target files.';
}
if (blocked) {
  executionResult = 'blocked';
  notes = 'Write dry-run blocked: task shape too broad for v1 scope.';
}
if (writeLogExists) {
  console.log('Dry-run write log already exists for this execution candidate.');
  process.exit(0);
}

const logEntry = {
  write_dryrun_log_id: `write-dryrun-${Date.now()}`,
  execution_id: executionId,
  review_id: review ? review.review_id : 'n/a',
  decision_id: review ? review.decision_id : 'n/a',
  execution_result: executionResult,
  executor: 'qwen-write-dryrun',
  target_files: files.slice(),
  files_changed: [],
  notes,
  created_at: new Date().toISOString(),
};

dryrunDoc.logs.push(logEntry);
fs.writeFileSync(dryrunPath, JSON.stringify(dryrunDoc, null, 2) + '\n', 'utf8');

console.log('Write dry-run log recorded.');
console.log(`execution_id: ${executionId}`);
console.log(`review_id: ${logEntry.review_id}`);
console.log(`decision_id: ${logEntry.decision_id}`);
console.log(`execution_result: ${executionResult}`);
console.log(`target_files: ${JSON.stringify(logEntry.target_files)}`);
console.log(`Total write dry-run logs: ${dryrunDoc.logs.length}`);
