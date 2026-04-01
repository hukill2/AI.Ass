#!/usr/bin/env node
// Usage: node scripts/latest-handoff-summary-v1.js

const fs = require('fs');
const path = require('path');

function loadJson(relPath) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8'));
}

const reviews = loadJson('runtime/decision-reviews.v1.json').reviews || [];
const candidates = loadJson('runtime/execution-candidates.v1.json').candidates || [];
const payloads = loadJson('runtime/executor-payloads.v1.json').payloads || [];

const approved = reviews
  .filter((r) => r.operator_status === 'approved')
  .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));

if (approved.length === 0) {
  console.log('No approved reviews found.');
  process.exit(0);
}

const latestReview = approved[0];
const candidate = candidates.find((c) => c.review_id === latestReview.review_id);
const payload = candidate ? payloads.find((p) => p.execution_id === candidate.execution_id) : undefined;

console.log('--- Latest Handoff Summary ---');
console.log(`review_id: ${latestReview.review_id}`);
console.log(`decision_id: ${latestReview.decision_id}`);
console.log(`task_id: ${latestReview.task_id}`);
console.log(`classification: ${latestReview.classification}`);
console.log(`operator_status: ${latestReview.operator_status}`);
console.log(`operator_notes: ${latestReview.operator_notes || '<none>'}`);
if (!candidate) {
  console.log('No execution candidate is linked to this approved review yet.');
  console.log('Chain complete: no');
  process.exit(0);
}

console.log(`execution_id: ${candidate.execution_id}`);
console.log(`execution_status: ${candidate.execution_status}`);
if (!payload) {
  console.log('No executor payload has been prepared for this execution candidate yet.');
  console.log('Chain complete: no');
  process.exit(0);
}

console.log(`payload_id: ${payload.payload_id}`);
console.log('Chain complete: yes');
process.exit(0);
