#!/usr/bin/env node
// Usage: node scripts/latest-executor-handoff-summary-v1.js

const fs = require('fs');
const path = require('path');

function load(relPath) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8'));
}

const reviews = (load('runtime/decision-reviews.v1.json').reviews) || [];
const candidates = (load('runtime/execution-candidates.v1.json').candidates) || [];
const payloads = (load('runtime/executor-payloads.v1.json').payloads) || [];
const executorPackets = (load('runtime/executor-handoff-packets.v1.json').packets) || [];

const approved = reviews
  .filter((r) => r.operator_status === 'approved')
  .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));

if (!approved.length) {
  console.log('No approved reviews found.');
  process.exit(0);
}

const latestReview = approved[0];
const candidate = candidates.find((c) => c.review_id === latestReview.review_id);
const payload = candidate ? payloads.find((p) => p.execution_id === candidate.execution_id) : undefined;
const executor = payload ? executorPackets.find((packet) => packet.payload_id === payload.payload_id) : undefined;

console.log('--- Latest executor Handoff Summary ---');
console.log(`review_id: ${latestReview.review_id}`);
console.log(`decision_id: ${latestReview.decision_id}`);
console.log(`task_id: ${latestReview.task_id}`);
console.log(`classification: ${latestReview.classification}`);
console.log(`operator_status: ${latestReview.operator_status}`);

if (!candidate) {
  console.log('No execution candidate linked to this review yet.');
  console.log('Chain complete through executor: no');
  process.exit(0);
}

console.log(`execution_id: ${candidate.execution_id}`);
console.log(`execution_status: ${candidate.execution_status}`);

if (!payload) {
  console.log('No executor payload linked to this execution yet.');
  console.log('Chain complete through executor: no');
  process.exit(0);
}

console.log(`payload_id: ${payload.payload_id}`);

if (!executor) {
  console.log('No executor handoff packet prepared for this payload yet.');
  console.log('Chain complete through executor: no');
  process.exit(0);
}

console.log(`handoff_id: ${executor.handoff_id}`);
console.log(`executor_target: ${executor.executor_target}`);
console.log('Chain complete through executor: yes');
process.exit(0);
