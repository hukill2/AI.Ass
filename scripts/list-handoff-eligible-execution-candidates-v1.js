#!/usr/bin/env node
// Usage: node scripts/list-handoff-eligible-execution-candidates-v1.js

const fs = require('fs');
const path = require('path');

function loadJson(filePath) {
  const absolute = path.resolve(__dirname, '..', filePath);
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (err) {
    console.error(`Failed to read or parse ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

const candidatesDoc = loadJson('runtime/execution-candidates.v1.json');
const reviewsDoc = loadJson('runtime/decision-reviews.v1.json');
const decisionsDoc = loadJson('runtime/assistant-decisions.v1.json');

if (!Array.isArray(candidatesDoc.candidates)) {
  console.error('Invalid execution-candidates structure: missing candidates array.');
  process.exit(1);
}

if (!Array.isArray(reviewsDoc.reviews) || !Array.isArray(decisionsDoc.decisions)) {
  console.error('Invalid review or decision document structure.');
  process.exit(1);
}

const reviewsById = new Map(reviewsDoc.reviews.map((rev) => [rev.review_id, rev]));
const decisionsById = new Map(decisionsDoc.decisions.map((dec) => [dec.decision_id, dec]));
const implementationKeywords = /\b(create|update|modify|implement|write|edit)\b/i;

const eligible = [];

for (const candidate of candidatesDoc.candidates) {
  if (candidate.execution_status !== 'awaiting_execution') {
    continue;
  }

  const review = reviewsById.get(candidate.review_id);
  if (!review) {
    continue;
  }

  if (review.classification !== 'approval-required' || review.operator_status !== 'approved') {
    continue;
  }

  const decision = decisionsById.get(candidate.decision_id);
  if (!decision) {
    continue;
  }

  const nextStep = (decision.recommended_next_step || '').trim();
  if (!nextStep) {
    continue;
  }

  const implementationOriented = implementationKeywords.test(nextStep);
  if (implementationOriented && (!Array.isArray(decision.files_to_create_or_update) || decision.files_to_create_or_update.length === 0)) {
    continue;
  }

  eligible.push({
    execution_id: candidate.execution_id,
    review_id: candidate.review_id,
    decision_id: candidate.decision_id,
    task_id: candidate.task_id,
    execution_status: candidate.execution_status,
    recommended_next_step: nextStep,
  });
}

console.log('--- Handoff-Eligible Execution Candidates ---');
if (eligible.length === 0) {
  console.log('No execution candidates are currently handoff-eligible.');
  process.exit(0);
}

console.log(`Total handoff-eligible candidates: ${eligible.length}`);
for (const c of eligible) {
  console.log(`- execution_id: ${c.execution_id}`);
  console.log(`  review_id: ${c.review_id}`);
  console.log(`  decision_id: ${c.decision_id}`);
  console.log(`  task_id: ${c.task_id}`);
  console.log(`  execution_status: ${c.execution_status}`);
  console.log(`  recommended_next_step: ${c.recommended_next_step}`);
}

process.exit(0);
