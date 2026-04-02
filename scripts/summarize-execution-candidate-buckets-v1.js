#!/usr/bin/env node
// Usage: node scripts/summarize-execution-candidate-buckets-v1.js

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

const reviewedMap = new Map();
for (const review of reviewsDoc.reviews) {
  reviewedMap.set(review.review_id, review);
}

let approvedAwaiting = 0;
let pendingReview = 0;
let rejected = 0;
let unreviewed = 0;

for (const candidate of candidatesDoc.candidates) {
  const review = reviewedMap.get(candidate.review_id);
  if (!review) {
    unreviewed += 1;
    continue;
  }
  if (candidate.execution_status === 'awaiting_execution' && review.operator_status === 'approved') {
    approvedAwaiting += 1;
    continue;
  }
  if (review.operator_status === 'rejected') {
    rejected += 1;
    continue;
  }
  pendingReview += 1;
}

const total = candidatesDoc.candidates.length;

console.log('Execution candidate buckets:');
console.log(`  approved-awaiting: ${approvedAwaiting}`);
console.log(`  pending-review:    ${pendingReview}`);
console.log(`  rejected:          ${rejected}`);
console.log(`  unreviewed:        ${unreviewed}`);
console.log(`  total candidates:  ${total}`);
