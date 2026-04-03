#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const REVIEWS_PATH = path.resolve(__dirname, '../runtime/decision-reviews.v1.json');

function fail(message) {
  console.error(`Eligible candidate review error: ${message}`);
  process.exit(1);
}

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    fail(`unable to load ${p} (${err.message})`);
  }
}

function selectEligible(candidates) {
  return candidates.filter((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const status =
      typeof candidate.execution_status === 'string' ? candidate.execution_status.trim() : '';
    return status && ['awaiting_execution', 'execution_prepared'].includes(status);
  });
}

const candidatesDoc = loadJson(CANDIDATES_PATH);
if (!Array.isArray(candidatesDoc.candidates)) {
  fail('"candidates" array missing');
}

const eligible = selectEligible(candidatesDoc.candidates);
if (eligible.length !== 1) {
  console.log(
    `Eligible candidate review check skipped (${eligible.length} eligible candidate${
      eligible.length === 1 ? '' : 's'
    } present).`
  );
  process.exit(0);
}

const target = eligible[0];
const execId = target.execution_id;
if (!execId) {
  fail('eligible candidate missing execution_id');
}

const reviewId = target.review_id;
if (!reviewId || typeof reviewId !== 'string' || !reviewId.trim()) {
  fail(`eligible candidate ${execId} missing review_id`);
}

const reviewsDoc = loadJson(REVIEWS_PATH);
if (!Array.isArray(reviewsDoc.reviews)) {
  fail('"reviews" array missing in decision reviews');
}

if (!reviewsDoc.reviews.find((review) => review.review_id === reviewId)) {
  fail(`no decision review found for review_id=${reviewId} (execution_id=${execId})`);
}

console.log(`Eligible execution_id=${execId} links to review_id=${reviewId}.`);
process.exit(0);
