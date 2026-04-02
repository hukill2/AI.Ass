#!/usr/bin/env node
// Usage: node scripts/summarize-pending-review-candidates-v1.js

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

const pendingReviews = candidatesDoc.candidates.filter((candidate) => {
  const review = reviewsDoc.reviews.find((r) => r.review_id === candidate.review_id);
  return review && review.operator_status !== 'approved';
});

if (pendingReviews.length === 0) {
  console.log('No execution candidates are currently pending review.');
  process.exit(0);
}

const lines = pendingReviews.map((candidate) => {
  const review = reviewsDoc.reviews.find((r) => r.review_id === candidate.review_id);
  const decision = decisionsDoc.decisions.find((d) => d.decision_id === candidate.decision_id);
  const status = review ? `${review.operator_status} (${review.classification})` : '(no review)';
  const nextStep = decision ? (decision.recommended_next_step || '').replace(/\s+/g, ' ').trim() : '<missing decision>';
  const files = decision && Array.isArray(decision.files_to_create_or_update) && decision.files_to_create_or_update.length > 0
    ? decision.files_to_create_or_update.join(', ')
    : '(no files)';
  return `${candidate.execution_id} | ${candidate.task_id} | ${status} | ${nextStep.slice(0, 80)}${nextStep.length > 80 ? '…' : ''} | ${files}`;
});

console.log('Pending review execution candidates:');
console.log('execution_id | task_id | review_status | recommended_next_step | files_to_create_or_update');
lines.forEach((line) => console.log(line));
console.log(`Total pending-review candidates: ${pendingReviews.length}`);
