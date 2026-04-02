#!/usr/bin/env node
// Usage: node scripts/validate-execution-candidate-coverage-buckets-v1.js

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

const buckets = {
  approved: 0,
  pending: 0,
  rejected: 0,
  unreviewed: 0,
  anomalies: 0,
};

for (const candidate of candidatesDoc.candidates) {
  if (!candidate.execution_id || typeof candidate.execution_id !== 'string' || !candidate.execution_id.trim()
    || !candidate.task_id || typeof candidate.task_id !== 'string' || !candidate.task_id.trim()) {
    buckets.anomalies += 1;
    continue;
  }
  const review = reviewMap.get(candidate.review_id);
  if (!review) {
    buckets.unreviewed += 1;
    continue;
  }
  if (!review.operator_status || typeof review.operator_status !== 'string') {
    buckets.anomalies += 1;
    continue;
  }
  if (review.operator_status === 'approved') {
    buckets.approved += 1;
    continue;
  }
  if (review.operator_status === 'rejected') {
    buckets.rejected += 1;
    continue;
  }
  buckets.pending += 1;
}

const total = candidatesDoc.candidates.length;
const considered = buckets.approved + buckets.pending + buckets.rejected + buckets.unreviewed + buckets.anomalies;

console.log('Execution candidate coverage validation:');
console.log(`  approved:  ${buckets.approved}`);
console.log(`  pending:   ${buckets.pending}`);
console.log(`  rejected:  ${buckets.rejected}`);
console.log(`  unreviewed:${buckets.unreviewed}`);
console.log(`  anomalies: ${buckets.anomalies}`);
console.log(`  total:     ${total}`);

if (buckets.anomalies > 0) {
  console.error('Validation failed: anomalies present');
  process.exit(1);
}

if (considered !== total) {
  console.error('Validation failed: bucket coverage mismatch');
  process.exit(1);
}

console.log('Bucket coverage is consistent.');
process.exit(0);
