#!/usr/bin/env node
// Usage: node scripts/validate-execution-candidate-buckets-v1.js

const fs = require('fs');
const path = require('path');

function loadJson(relPath) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8'));
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

const reviewMap = new Map();
for (const review of reviewsDoc.reviews) {
  reviewMap.set(review.review_id, review);
}

let approvedAwaiting = 0;
let pendingReview = 0;
let rejected = 0;
let unreviewed = 0;

for (const candidate of candidatesDoc.candidates) {
  const review = reviewMap.get(candidate.review_id);
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
const summed = approvedAwaiting + pendingReview + rejected + unreviewed;

console.log('Validating execution candidate buckets...');
console.log(`  approved-awaiting: ${approvedAwaiting}`);
console.log(`  pending-review:    ${pendingReview}`);
console.log(`  rejected:          ${rejected}`);
console.log(`  unreviewed:        ${unreviewed}`);
console.log(`  total:             ${total}`);

if (summed !== total) {
  console.error('Bucket count mismatch');
  process.exit(1);
}

console.log('Bucket counts are consistent.');
process.exit(0);
