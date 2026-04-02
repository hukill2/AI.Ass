#!/usr/bin/env node
// Usage: node scripts/validate-execution-candidate-view-coverage-v1.js

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
  console.error('Runtime documents malformed.');
  process.exit(1);
}

const reviewMap = new Map(reviewsDoc.reviews.map((review) => [review.review_id, review]));
const anomaliesScript = path.resolve(__dirname, 'validate-execution-candidate-anomalies-v1.js');

const coverage = {
  approvedAwaiting: 0,
  pendingReview: 0,
  rejected: 0,
  unreviewed: 0,
  anomalous: 0,
};

for (const candidate of candidatesDoc.candidates) {
  const review = reviewMap.get(candidate.review_id);
  if (!review) {
    coverage.unreviewed += 1;
    continue;
  }
  if (review.operator_status === 'approved') {
    coverage.approvedAwaiting += 1;
    continue;
  }
  if (review.operator_status === 'rejected') {
    coverage.rejected += 1;
    continue;
  }
  if (review.operator_status && review.operator_status !== 'approved') {
    coverage.pendingReview += 1;
    continue;
  }
  coverage.anomalous += 1;
}

const total = candidatesDoc.candidates.length;
const covered = coverage.approvedAwaiting + coverage.pendingReview + coverage.rejected + coverage.unreviewed;

console.log('Execution candidate view coverage:');
console.log(`  approved-awaiting: ${coverage.approvedAwaiting}`);
console.log(`  pending-review:    ${coverage.pendingReview}`);
console.log(`  rejected:          ${coverage.rejected}`);
console.log(`  unreviewed:        ${coverage.unreviewed}`);
console.log(`  anomalous:         ${coverage.anomalous}`);
console.log(`  total:             ${total}`);

if (coverage.anomalous > 0) {
  console.error('Anomalous candidates detected; inspect with summarize-execution-candidate-anomalies-v1.js');
  process.exit(1);
}

if (covered !== total) {
  console.error('Coverage gap detected.');
  process.exit(1);
}

console.log('Coverage is complete.');
process.exit(0);
