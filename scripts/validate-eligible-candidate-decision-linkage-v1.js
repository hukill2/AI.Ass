#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const REVIEWS_PATH = path.resolve(__dirname, '../runtime/decision-reviews.v1.json');

function fail(message) {
  console.error(`Eligible candidate decision error: ${message}`);
  process.exit(1);
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    fail(`unable to load ${filePath} (${err.message})`);
  }
}

function eligibleCandidates(candidates) {
  return candidates.filter((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return false;
    }
    const status = typeof candidate.execution_status === 'string' ? candidate.execution_status.trim() : '';
    return status && ['awaiting_execution', 'execution_prepared'].includes(status);
  });
}

const candidatesDoc = loadJson(CANDIDATES_PATH);
if (!Array.isArray(candidatesDoc.candidates)) {
  fail('"candidates" array missing');
}

const eligible = eligibleCandidates(candidatesDoc.candidates);
if (eligible.length !== 1) {
  console.log(
    `Eligible candidate decision check skipped (${eligible.length} eligible candidate${
      eligible.length === 1 ? '' : 's'
    } present).`
  );
  process.exit(0);
}

const candidate = eligible[0];
const execId = candidate.execution_id;
if (!execId) {
  fail('eligible candidate missing execution_id');
}

const decisionId = candidate.decision_id;
if (!decisionId || typeof decisionId !== 'string' || !decisionId.trim()) {
  fail(`eligible candidate ${execId} missing decision_id`);
}

const reviewsDoc = loadJson(REVIEWS_PATH);
if (!Array.isArray(reviewsDoc.reviews)) {
  fail('"reviews" array missing');
}

const review = reviewsDoc.reviews.find((entry) => entry.review_id === candidate.review_id);
if (!review) {
  fail(`no review entry found for review_id=${candidate.review_id} (execution_id=${execId})`);
}

const reviewDecisionId = review.decision_id;
if (!reviewDecisionId || typeof reviewDecisionId !== 'string' || !reviewDecisionId.trim()) {
  fail(`review ${review.review_id} missing decision_id`);
}

if (reviewDecisionId !== decisionId) {
  fail(
    `decision_id mismatch for execution_id=${execId}: candidate has ${decisionId}, review ${review.review_id} has ${reviewDecisionId}`
  );
}

console.log(`Eligible execution_id=${execId} decision_id=${decisionId} matches review ${review.review_id}.`);
process.exit(0);
