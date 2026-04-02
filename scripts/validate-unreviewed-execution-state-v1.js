#!/usr/bin/env node
// Usage: node scripts/validate-unreviewed-execution-state-v1.js

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
  console.error('Runtime documents malformed.');
  process.exit(1);
}

const unreviewed = candidatesDoc.candidates.filter(
  (candidate) => !reviewsDoc.reviews.some((review) => review.review_id === candidate.review_id)
);

if (unreviewed.length === 0) {
  console.log('No unreviewed candidates to validate.');
  process.exit(0);
}

const issues = [];

for (const candidate of unreviewed) {
  if (typeof candidate.execution_id !== 'string' || !candidate.execution_id.trim()) {
    issues.push(`Missing execution_id for candidate with task_id=${candidate.task_id || '<unknown>'}`);
  }
  if (typeof candidate.task_id !== 'string' || !candidate.task_id.trim()) {
    issues.push(`Execution_id ${candidate.execution_id || '<unknown>'} missing task_id`);
  }
  const decision = decisionsDoc.decisions.find((d) => d.decision_id === candidate.decision_id);
  if (decision) {
    const nextStep = typeof decision.recommended_next_step === 'string' ? decision.recommended_next_step.trim() : '';
    if (!nextStep) {
      issues.push(`execution_id ${candidate.execution_id} decision ${decision.decision_id} lacks recommended_next_step`);
    }
    if (decision.files_to_create_or_update && !Array.isArray(decision.files_to_create_or_update)) {
      issues.push(`execution_id ${candidate.execution_id} decision ${decision.decision_id} files_to_create_or_update is not an array`);
    }
  }
}

if (issues.length > 0) {
  console.error('Unreviewed state validator found issues:');
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}

console.log(`Unreviewed execution state is consistent (${unreviewed.length} candidate${unreviewed.length === 1 ? '' : 's'}).`);
process.exit(0);
