#!/usr/bin/env node
// Usage: node scripts/validate-pending-review-state-v1.js

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
  console.log('No pending-review execution candidates to validate.');
  process.exit(0);
}

const issues = [];

for (const candidate of pendingReviews) {
  if (typeof candidate.execution_id !== 'string' || !candidate.execution_id.trim()) {
    issues.push(`Candidate missing execution_id (task_id=${candidate.task_id || '<unknown>'})`);
    continue;
  }

  if (typeof candidate.task_id !== 'string' || !candidate.task_id.trim()) {
    issues.push(`execution_id ${candidate.execution_id} missing task_id`);
  }

  const review = reviewsDoc.reviews.find((r) => r.review_id === candidate.review_id);
  if (!review) {
    issues.push(`execution_id ${candidate.execution_id} references missing review ${candidate.review_id}`);
    continue;
  }

  if (review.operator_status === 'approved') {
    issues.push(`execution_id ${candidate.execution_id} review ${review.review_id} should be approved`); // expectation is pending but not approved
    continue;
  }

  if (typeof review.classification !== 'string' || !review.classification.trim()) {
    issues.push(`review ${review.review_id} missing classification`);
  }

  const decision = decisionsDoc.decisions.find((d) => d.decision_id === candidate.decision_id);
  if (!decision) {
    issues.push(`execution_id ${candidate.execution_id} missing decision ${candidate.decision_id}`);
    continue;
  }

  const nextStep = typeof decision.recommended_next_step === 'string' ? decision.recommended_next_step.trim() : '';
  if (!nextStep) {
    issues.push(`execution_id ${candidate.execution_id} decision ${decision.decision_id} lacks recommended_next_step`);
  }
}

if (issues.length > 0) {
  console.error('Pending-review state validator found issues:');
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}

console.log(`Pending-review state is consistent (${pendingReviews.length} candidate${pendingReviews.length === 1 ? '' : 's'}).`);
process.exit(0);
