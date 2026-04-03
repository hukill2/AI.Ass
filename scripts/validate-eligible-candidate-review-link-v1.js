#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const REVIEWS_PATH = path.resolve(__dirname, '../runtime/decision-reviews.v1.json');
const REQUIRED_STATUS = 'approved';

function fail(message) {
  console.error(`Eligible candidate review link error: ${message}`);
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
    `Eligible candidate review link check skipped (${eligible.length} eligible candidate${
      eligible.length === 1 ? '' : 's'
    } present).`
  );
  process.exit(0);
}

const [candidate] = eligible;
const execId = candidate.execution_id;
if (!execId) {
  fail('eligible candidate missing execution_id');
}

const reviewId = candidate.review_id;
if (!reviewId || typeof reviewId !== 'string' || !reviewId.trim()) {
  fail(`eligible candidate ${execId} missing review_id`);
}

const reviewsDoc = loadJson(REVIEWS_PATH);
if (!Array.isArray(reviewsDoc.reviews)) {
  fail('"reviews" array missing');
}

const review = reviewsDoc.reviews.find((entry) => entry.review_id === reviewId);
if (!review) {
  fail(`no decision review found for review_id=${reviewId} (execution_id=${execId})`);
}

const status = (review.operator_status || '').trim().toLowerCase();
if (status !== REQUIRED_STATUS) {
  fail(
    `review ${reviewId} for execution_id=${execId} has operator_status="${review.operator_status}", expected "${REQUIRED_STATUS}"`
  );
}

console.log(`Eligible execution_id=${execId} review ${reviewId} operator_status=${review.operator_status}.`);
process.exit(0);
