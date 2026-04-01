#!/usr/bin/env node
// Usage: node scripts/latest-full-chain-summary-v1.js

const fs = require('fs');
const path = require('path');

function load(relPath) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8'));
}

const decisions = (load('runtime/assistant-decisions.v1.json').decisions) || [];
const reviews = (load('runtime/decision-reviews.v1.json').reviews) || [];
const candidates = (load('runtime/execution-candidates.v1.json').candidates) || [];
const payloads = (load('runtime/executor-payloads.v1.json').payloads) || [];
const handoffs = (load('runtime/codex-handoff-packets.v1.json').packets) || [];
const previews = (load('runtime/codex-invocation-previews.v1.json').previews) || [];
const logs = (load('runtime/execution-logs.v1.json').logs) || [];

function sortByCreated(items) {
  return items.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

let found = null;
for (const decision of sortByCreated(decisions)) {
  const review = reviews.find((r) => r.decision_id === decision.decision_id);
  if (!review) continue;
  const candidate = candidates.find((c) => c.review_id === review.review_id);
  if (!candidate) continue;
  const payload = payloads.find((p) => p.execution_id === candidate.execution_id);
  if (!payload) continue;
  const handoff = handoffs.find((h) => h.payload_id === payload.payload_id);
  if (!handoff) continue;
  const preview = previews.find((p) => p.handoff_id === handoff.handoff_id);
  if (!preview) continue;
  const log = logs.find((l) => l.execution_id === candidate.execution_id && l.preview_id === preview.preview_id);
  found = { decision, review, candidate, payload, handoff, preview, log };
  if (log) break;
}

console.log('--- Latest Full Chain Summary ---');
if (!found) {
  console.log('No decision yet has a complete chain including execution log.');
  process.exit(0);
}
const { decision, review, candidate, payload, handoff, preview, log } = found;
console.log(`decision_id: ${decision.decision_id}`);
console.log(`review_id: ${review.review_id}`);
console.log(`execution_id: ${candidate.execution_id}`);
console.log(`payload_id: ${payload.payload_id}`);
console.log(`handoff_id: ${handoff.handoff_id}`);
console.log(`preview_id: ${preview.preview_id}`);
console.log(`execution_log_id: ${log ? log.execution_log_id : '<missing>'}`);
console.log(`classification: ${review.classification}`);
console.log(`operator_status: ${review.operator_status}`);
console.log(`execution_status: ${candidate.execution_status}`);
console.log(`executor: ${log ? log.executor : '<missing>'}`);
console.log(`execution_result: ${log ? log.execution_result : '<missing>'}`);
console.log(`Full dry-run chain complete: ${log ? 'yes' : 'no'}`);
process.exit(0);
