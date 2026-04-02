#!/usr/bin/env node
// Usage: node scripts/summarize-all-review-lanes-v1.js

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
const decisionsDoc = loadJson('runtime/assistant-decisions.v1.json');

if (!Array.isArray(candidatesDoc.candidates) || !Array.isArray(reviewsDoc.reviews) || !Array.isArray(decisionsDoc.decisions)) {
  console.error('One of the runtime collections is malformed.');
  process.exit(1);
}

function laneSummary(candidates) {
  return candidates.map((candidate) => {
    const review = reviewsDoc.reviews.find((r) => r.review_id === candidate.review_id);
    const decision = decisionsDoc.decisions.find((d) => d.decision_id === candidate.decision_id);
    const nextStep = decision ? (decision.recommended_next_step || '').replace(/\s+/g, ' ').trim() : '<missing decision>';
    const files = decision && Array.isArray(decision.files_to_create_or_update) && decision.files_to_create_or_update.length > 0
      ? decision.files_to_create_or_update.join(', ')
      : '(no files)';
    const reviewStatus = review ? `${review.operator_status} (${review.classification})` : '(no review)';
    return `${candidate.execution_id} | ${candidate.task_id} | ${candidate.execution_status} | ${reviewStatus} | ${nextStep.slice(0, 80)}${nextStep.length > 80 ? '…' : ''} | ${files}`;
  });
}

const approvedAwaiting = candidatesDoc.candidates.filter((candidate) => {
  if (candidate.execution_status !== 'awaiting_execution') return false;
  const review = reviewsDoc.reviews.find((r) => r.review_id === candidate.review_id);
  return review && review.operator_status === 'approved';
});

const pendingReview = candidatesDoc.candidates.filter((candidate) => {
  const review = reviewsDoc.reviews.find((r) => r.review_id === candidate.review_id);
  return review && review.operator_status !== 'approved' && review.operator_status !== 'rejected';
});

const rejected = candidatesDoc.candidates.filter((candidate) => {
  const review = reviewsDoc.reviews.find((r) => r.review_id === candidate.review_id);
  return review && review.operator_status === 'rejected';
});

console.log('=== Review lane summary ===');

function printLane(title, collection) {
  console.log(`\n${title} (${collection.length})`);
  if (collection.length === 0) {
    console.log('  (none)');
    return;
  }
  laneSummary(collection).forEach((line) => console.log(`  ${line}`));
}

printLane('Approved & awaiting execution', approvedAwaiting);
printLane('Pending operator review', pendingReview);
printLane('Operator rejected', rejected);
