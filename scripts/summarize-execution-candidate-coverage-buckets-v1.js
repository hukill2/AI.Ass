#!/usr/bin/env node
// Usage: node scripts/summarize-execution-candidate-coverage-buckets-v1.js

const fs = require('fs');
const path = require('path');

function loadJson(relPath) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (err) {
    console.error(`Failed to read ${relPath}: ${err.message}`);
    process.exit(1);
  }
}

const candidatesDoc = loadJson('runtime/execution-candidates.v1.json');
const reviewsDoc = loadJson('runtime/decision-reviews.v1.json');

if (!Array.isArray(candidatesDoc.candidates) || !Array.isArray(reviewsDoc.reviews)) {
  console.error('Runtime collections malformed.');
  process.exit(1);
}

const reviewMap = new Map(reviewsDoc.reviews.map((review) => [review.review_id, review]));

let approved = 0;
let pending = 0;
let rejected = 0;
let unreviewed = 0;
let anomalies = 0;

for (const candidate of candidatesDoc.candidates) {
  if (!candidate.execution_id || !candidate.task_id) {
    anomalies += 1;
    continue;
  }
  const review = reviewMap.get(candidate.review_id);
  if (!review) {
    unreviewed += 1;
    continue;
  }
  if (!review.operator_status || typeof review.operator_status !== 'string') {
    anomalies += 1;
    continue;
  }
  if (review.operator_status === 'approved') {
    approved += 1;
    continue;
  }
  if (review.operator_status === 'rejected') {
    rejected += 1;
    continue;
  }
  pending += 1;
}

const total = candidatesDoc.candidates.length;

console.log('Execution candidate coverage buckets:');
console.log(`  approved:  ${approved}`);
console.log(`  pending:   ${pending}`);
console.log(`  rejected:  ${rejected}`);
console.log(`  unreviewed:${unreviewed}`);
console.log(`  anomalies: ${anomalies}`);
console.log(`  total:     ${total}`);
