#!/usr/bin/env node
// Usage: node scripts/validate-review-lane-summary-alignment-v1.js

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

function reviewFor(candidate) {
  return reviewsDoc.reviews.find((r) => r.review_id === candidate.review_id);
}

const approvedLane = [];
const pendingLane = [];
const rejectedLane = [];

for (const candidate of candidatesDoc.candidates) {
  const review = reviewFor(candidate);
  if (!review) continue;
  if (candidate.execution_status === 'awaiting_execution' && review.operator_status === 'approved') {
    approvedLane.push(candidate.execution_id);
    continue;
  }
  if (review.operator_status === 'rejected') {
    rejectedLane.push(candidate.execution_id);
    continue;
  }
  if (review.operator_status && review.operator_status !== 'approved') {
    pendingLane.push(candidate.execution_id);
  }
}

const totalUnique = new Set([...approvedLane, ...pendingLane, ...rejectedLane]).size;
const laneSum = approvedLane.length + pendingLane.length + rejectedLane.length;
const eligibleCount = candidatesDoc.candidates.filter((candidate) => {
  const review = reviewFor(candidate);
  if (!review) return false;
  if (candidate.execution_status === 'awaiting_execution' && review.operator_status === 'approved') return true;
  if (review.operator_status === 'rejected') return true;
  if (review.operator_status && review.operator_status !== 'approved') return true;
  return false;
}).length;

console.log('Review lane alignment check:');
console.log(`  approved-awating: ${approvedLane.length}`);
console.log(`  pending-review:   ${pendingLane.length}`);
console.log(`  rejected:         ${rejectedLane.length}`);

if (laneSum !== totalUnique) {
  console.error('Lane alignment issue: candidate counted in multiple lanes.');
  process.exit(1);
}

if (laneSum !== eligibleCount) {
  console.error('Lane alignment issue: some reviewed candidates missing from lanes.');
  process.exit(1);
}

console.log('  alignment OK');
process.exit(0);
