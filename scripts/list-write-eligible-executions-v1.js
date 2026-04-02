#!/usr/bin/env node
// Usage: node scripts/list-write-eligible-executions-v1.js

const fs = require('fs');
const path = require('path');

const loadJson = (relPath) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8'));
const candidatesDoc = loadJson('runtime/execution-candidates.v1.json');
const reviewsDoc = loadJson('runtime/decision-reviews.v1.json');
const logsDoc = loadJson('runtime/execution-logs.v1.json');

if (!Array.isArray(candidatesDoc.candidates) || !Array.isArray(reviewsDoc.reviews) || !Array.isArray(logsDoc.logs)) {
  console.error('Malformed documents.');
  process.exit(1);
}

const readonlySuccessLogs = logsDoc.logs.filter(log => log.executor === 'qwen-readonly' && log.execution_result === 'success');
const successSet = new Map();
readonlySuccessLogs.forEach(log => successSet.set(log.execution_id, log));

const blockedKeywords = ['refactor','architecture','guardrail','routing','approval','integration'];
const genericSteps = ['implementation','update','fix','improve','refactor','analysis-only','analysis'];

function hasSpecificStep(step) {
  if (!step || typeof step !== 'string') return false;
  const lower = step.toLowerCase().trim();
  if (!lower) return false;
  const containsFile = lower.includes('scripts/') || lower.includes('runtime/') || lower.includes('.js');
  const containsDetail = lower.includes('exit') || lower.includes('check') || lower.includes('target') || lower.includes('output') || lower.includes('field');
  if (containsFile || containsDetail) return true;
  for (const generic of genericSteps) {
    if (lower === generic) return false;
  }
  return true;
}

const eligible = candidatesDoc.candidates.filter(candidate => {
  if (candidate.execution_status !== 'execution_prepared') return false;
  const review = reviewsDoc.reviews.find(r => r.review_id === candidate.review_id);
  if (!review) return false;
  if (!['approval-required', 'review-required'].includes(review.classification) || review.operator_status !== 'approved') return false;
  const successLog = successSet.get(candidate.execution_id);
  if (!successLog) return false;
  const files = candidate.files_to_create_or_update || [];
  if (!files.length) return false;
  const nextStep = (candidate.recommended_next_step || '').toLowerCase();
  if (!hasSpecificStep(candidate.recommended_next_step)) return false;
  for (const keyword of blockedKeywords) {
    if (nextStep.includes(keyword)) return false;
  }
  candidate._log = successLog;
  return true;
});

console.log('--- Write-Elgible Execution Candidates v1 ---');
if (!eligible.length) {
  console.log('No write-eligible execution candidates found.');
  process.exit(0);
}
console.log(`Total write-eligible candidates: ${eligible.length}`);
for (const candidate of eligible) {
  console.log(`- execution_id: ${candidate.execution_id}`);
  console.log(`  review_id: ${candidate.review_id}`);
  console.log(`  decision_id: ${candidate.decision_id}`);
  console.log(`  task_id: ${candidate.task_id}`);
  console.log(`  execution_status: ${candidate.execution_status}`);
  console.log(`  recommended_next_step: ${candidate.recommended_next_step || '<none>'}`);
  console.log(`  files_to_create_or_update: ${JSON.stringify(candidate.files_to_create_or_update || [])}`);
}
