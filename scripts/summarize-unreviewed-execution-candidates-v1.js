#!/usr/bin/env node
// Usage: node scripts/summarize-unreviewed-execution-candidates-v1.js

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

const unreviewed = candidatesDoc.candidates.filter((candidate) => {
  return !reviewsDoc.reviews.some((rev) => rev.review_id === candidate.review_id);
});

if (unreviewed.length === 0) {
  console.log('No unreviewed execution candidates.');
  process.exit(0);
}

const summarizeDecision = (candidate) => {
  const decision = decisionsDoc.decisions.find((d) => d.decision_id === candidate.decision_id);
  if (!decision) {
    return { nextStep: '<no decision>', files: '(no files)' };
  }
  const trimmed = (decision.recommended_next_step || '').replace(/\s+/g, ' ').trim();
  const nextStep = trimmed ? trimmed : '<no recommended_next_step>';
  const files = Array.isArray(decision.files_to_create_or_update) && decision.files_to_create_or_update.length > 0
    ? decision.files_to_create_or_update.join(', ')
    : '(no files)';
  return { nextStep, files };
};

console.log('Unreviewed execution candidates summary:');
console.log('execution_id | task_id | execution_status | next_step | files');
unreviewed.forEach((candidate) => {
  const { nextStep, files } = summarizeDecision(candidate);
  console.log(`${candidate.execution_id} | ${candidate.task_id || '<no task>'} | ${candidate.execution_status || '<no status>'} | ${nextStep.slice(0, 80)}${nextStep.length > 80 ? '…' : ''} | ${files}`);
});
console.log(`Count: ${unreviewed.length}`);
