#!/usr/bin/env node
// Usage: node scripts/validate-all-review-lanes-state-v1.js

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

function laneCandidates(filterFn) {
  return candidatesDoc.candidates.filter(filterFn);
}

const lanes = [
  {
    name: 'Approved & awaiting execution',
    filter: (candidate) => {
      if (candidate.execution_status !== 'awaiting_execution') return false;
      const review = reviewsDoc.reviews.find((r) => r.review_id === candidate.review_id);
      return review && review.operator_status === 'approved';
    },
    expectStatus: 'approved',
  },
  {
    name: 'Pending operator review',
    filter: (candidate) => {
      const review = reviewsDoc.reviews.find((r) => r.review_id === candidate.review_id);
      return review && review.operator_status && review.operator_status !== 'approved' && review.operator_status !== 'rejected';
    },
    expectStatus: 'pending',
  },
  {
    name: 'Operator rejected',
    filter: (candidate) => {
      const review = reviewsDoc.reviews.find((r) => r.review_id === candidate.review_id);
      return review && review.operator_status === 'rejected';
    },
    expectStatus: 'rejected',
  },
];

let issueCount = 0;

for (const lane of lanes) {
  const collection = laneCandidates(lane.filter);
  if (collection.length === 0) {
    console.log(`${lane.name}: 0 entries (ok)`);
    continue;
  }
  console.log(`${lane.name}: ${collection.length} entries`);
  for (const candidate of collection) {
    if (typeof candidate.execution_id !== 'string' || !candidate.execution_id.trim()) {
      console.error(`  missing execution_id in candidate with task_id=${candidate.task_id || '<unknown>'}`);
      issueCount += 1;
      continue;
    }
    if (typeof candidate.task_id !== 'string' || !candidate.task_id.trim()) {
      console.error(`  execution_id ${candidate.execution_id} missing task_id`);
      issueCount += 1;
    }
    const review = reviewsDoc.reviews.find((r) => r.review_id === candidate.review_id);
    if (!review) {
      console.error(`  execution_id ${candidate.execution_id} references missing review ${candidate.review_id}`);
      issueCount += 1;
      continue;
    }
    if (lane.expectStatus === 'approved' && review.operator_status !== 'approved') {
      console.error(`  execution_id ${candidate.execution_id} expected approved review but found ${review.operator_status}`);
      issueCount += 1;
    }
    if (lane.expectStatus === 'rejected' && review.operator_status !== 'rejected') {
      console.error(`  execution_id ${candidate.execution_id} expected rejected review but found ${review.operator_status}`);
      issueCount += 1;
    }
    if (lane.expectStatus === 'pending' && review.operator_status === 'approved') {
      console.error(`  execution_id ${candidate.execution_id} expected pending review but found approved`);
      issueCount += 1;
    }
    if (!review.classification || typeof review.classification !== 'string' || !review.classification.trim()) {
      console.error(`  review ${review.review_id} missing classification`);
      issueCount += 1;
    }
    const decision = decisionsDoc.decisions.find((d) => d.decision_id === candidate.decision_id);
    if (decision) {
      const nextStep = typeof decision.recommended_next_step === 'string' ? decision.recommended_next_step.trim() : '';
      if (!nextStep) {
        console.error(`  execution_id ${candidate.execution_id} decision ${decision.decision_id} lacks recommended_next_step`);
        issueCount += 1;
      }
    }
  }
}

if (issueCount > 0) {
  console.error(`Validation failed with ${issueCount} issue(s).`);
  process.exit(1);
}

console.log('All review lanes consistent.');
process.exit(0);
