#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function loadJson(relPath) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8'));
  } catch (err) {
    console.error(`Failed to read ${relPath}: ${err.message}`);
    process.exit(1);
  }
}

const candidatesDoc = loadJson('runtime/execution-candidates.v1.json');
const reviewsDoc = loadJson('runtime/decision-reviews.v1.json');

if (!Array.isArray(candidatesDoc.candidates) || !Array.isArray(reviewsDoc.reviews)) {
  console.error('Runtime collections malformed.');
  process.exit(1);
}

const reviewMap = new Map(reviewsDoc.reviews.map((review) => [review.review_id, review]));
const issues = [];

for (const candidate of candidatesDoc.candidates) {
  const context = `execution_id=${candidate.execution_id || '<missing>'} task_id=${candidate.task_id || '<missing>'}`;
  if (!candidate.execution_id || typeof candidate.execution_id !== 'string' || !candidate.execution_id.trim()) {
    issues.push(`${context} missing execution_id`);
  }
  if (!candidate.task_id || typeof candidate.task_id !== 'string' || !candidate.task_id.trim()) {
    issues.push(`${context} missing task_id`);
  }
  if (!candidate.review_id) {
    issues.push(`${context} lacks review_id`);
    continue;
  }
  const review = reviewMap.get(candidate.review_id);
  if (!review) {
    issues.push(`${context} review ${candidate.review_id} not found`);
    continue;
  }
  if (!review.operator_status || typeof review.operator_status !== 'string') {
    issues.push(`${context} review ${review.review_id} has invalid operator_status`);
  }
}

if (issues.length === 0) {
  console.log('No execution candidate anomalies detected.');
  process.exit(0);
}

console.error('Execution candidate anomalies found:');
issues.forEach((issue) => console.error(`- ${issue}`));
process.exit(1);
