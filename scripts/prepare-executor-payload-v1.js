#!/usr/bin/env node
// Usage: node scripts/prepare-executor-payload-v1.js --execution-id <id>

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

const args = process.argv.slice(2);
const execIdIndex = args.findIndex((value) => value === '--execution-id');
const executionId = execIdIndex >= 0 ? args[execIdIndex + 1] : undefined;
if (!executionId) {
  console.error('Missing --execution-id.');
  process.exit(1);
}

const candidatesDoc = loadJson('runtime/execution-candidates.v1.json');
const reviewsDoc = loadJson('runtime/decision-reviews.v1.json');
const decisionsDoc = loadJson('runtime/assistant-decisions.v1.json');
const payloadsPath = path.resolve(__dirname, '..', 'runtime/executor-payloads.v1.json');
let payloadsDoc;
try {
  payloadsDoc = JSON.parse(fs.readFileSync(payloadsPath, 'utf8'));
} catch (err) {
  console.error(`Failed to read executor payloads: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(candidatesDoc.candidates) || !Array.isArray(reviewsDoc.reviews) || !Array.isArray(decisionsDoc.decisions) || !Array.isArray(payloadsDoc.payloads)) {
  console.error('One of the source documents is malformed.');
  process.exit(1);
}

const candidate = candidatesDoc.candidates.find((c) => c.execution_id === executionId);
if (!candidate) {
  console.error(`Execution candidate ${executionId} not found.`);
  process.exit(1);
}

if (candidate.execution_status !== 'awaiting_execution') {
  console.error(`Candidate ${executionId} is not awaiting_execution.`);
  process.exit(1);
}

const review = reviewsDoc.reviews.find((r) => r.review_id === candidate.review_id);
if (
  !review ||
  !['approval-required', 'review-required'].includes(review.classification) ||
  review.operator_status !== 'approved'
) {
  console.error(`Review for ${executionId} is not an approved item.`);
  process.exit(1);
}

const decision = decisionsDoc.decisions.find((d) => d.decision_id === candidate.decision_id);
if (!decision) {
  console.error(`Decision ${candidate.decision_id} not found.`);
  process.exit(1);
}

const nextStep = (decision.recommended_next_step || '').trim();
if (!nextStep) {
  console.error('Decision missing recommended_next_step.');
  process.exit(1);
}

const implementationKeywords = /\b(create|update|modify|implement|write|edit)\b/i;
if (implementationKeywords.test(nextStep) && (!Array.isArray(decision.files_to_create_or_update) || decision.files_to_create_or_update.length === 0)) {
  console.error('Implementation-oriented decision requires files_to_create_or_update.');
  process.exit(1);
}

if (payloadsDoc.payloads.some((p) => p.execution_id === executionId)) {
  console.log(`Payload for ${executionId} already exists.`);
  console.log(`Total payloads stored: ${payloadsDoc.payloads.length}`);
  process.exit(0);
}

const payload = {
  payload_id: `payload-${Date.now()}`,
  execution_id: candidate.execution_id,
  review_id: review.review_id,
  decision_id: decision.decision_id,
  task_id: candidate.task_id,
  recommended_next_step: nextStep,
  files_to_create_or_update: Array.isArray(decision.files_to_create_or_update) ? decision.files_to_create_or_update.slice() : [],
  reasoning: decision.reasoning || '',
  risks_or_guardrails: Array.isArray(decision.risks_or_guardrails) ? decision.risks_or_guardrails.slice() : [],
  operator_notes: review.operator_notes || '',
  prepared_at: new Date().toISOString(),
};

payloadsDoc.payloads.push(payload);
fs.writeFileSync(payloadsPath, JSON.stringify(payloadsDoc, null, 2) + '\n', 'utf8');

console.log('Executor payload prepared.');
console.log(`execution_id: ${payload.execution_id}`);
console.log(`decision_id: ${payload.decision_id}`);
console.log(`task_id: ${payload.task_id}`);
console.log(`payload_id: ${payload.payload_id}`);
console.log(`Total payloads stored: ${payloadsDoc.payloads.length}`);
process.exit(0);
