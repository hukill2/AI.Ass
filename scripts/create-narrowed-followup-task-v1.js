#!/usr/bin/env node
// Usage: node scripts/create-narrowed-followup-task-v1.js --execution-id <id> --summary "..." --target-file <file> [--notes "..."]

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
};
const executionId = getArg('--execution-id');
const summary = getArg('--summary');
const target = getArg('--target-file');
const notes = getArg('--notes') || '';
if (!executionId || !summary || !target) {
  console.error('execution-id, summary, and target-file are required.');
  process.exit(1);
}

const candidates = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'runtime', 'execution-candidates.v1.json'), 'utf8')).candidates || [];
const reviews = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'runtime', 'decision-reviews.v1.json'), 'utf8')).reviews || [];
const followupPath = path.resolve(__dirname, '..', 'runtime', 'narrowed-followup-tasks.v1.json');
const followupDoc = JSON.parse(fs.readFileSync(followupPath, 'utf8'));

const candidate = candidates.find((c) => c.execution_id === executionId);
if (!candidate) {
  console.error(`Execution candidate ${executionId} not found.`);
  process.exit(1);
}
const review = reviews.find((r) => r.review_id === candidate.review_id);
if (!review) {
  console.error('Matching review not found.');
  process.exit(1);
}

const followup = {
  followup_id: `followup-${Date.now()}`,
  source_execution_id: executionId,
  source_review_id: review.review_id,
  source_decision_id: review.decision_id,
  task_id: candidate.task_id,
  narrowed_task_summary: summary,
  target_files: [target],
  reason_for_narrowing: 'narrowed for write-safe v1 scope',
  operator_notes: notes,
  created_at: new Date().toISOString(),
};

followupDoc.tasks.push(followup);
fs.writeFileSync(followupPath, JSON.stringify(followupDoc, null, 2) + '\n', 'utf8');

console.log('Narrowed follow-up task recorded.');
console.log(`execution_id: ${executionId}`);
console.log(`followup_id: ${followup.followup_id}`);
console.log(`task_id: ${followup.task_id}`);
console.log(`target_files: ${JSON.stringify(followup.target_files)}`);
console.log(`Total follow-up tasks stored: ${followupDoc.tasks.length}`);
