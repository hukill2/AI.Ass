#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function loadJson(relPath) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8'));
}

const candidatesDoc = loadJson('runtime/execution-candidates.v1.json');
const reviewsDoc = loadJson('runtime/decision-reviews.v1.json');

const reviewMap = new Map(reviewsDoc.reviews.map((review) => [review.review_id, review]));
const buckets = { approved: 0, pending: 0, rejected: 0, unreviewed: 0, anomalies: 0 };

for (const candidate of candidatesDoc.candidates) {
  if (!candidate.execution_id || !candidate.task_id) {
    buckets.anomalies += 1;
    continue;
  }
  const review = reviewMap.get(candidate.review_id);
  if (!review) {
    buckets.unreviewed += 1;
    continue;
  }
  if (!review.operator_status || typeof review.operator_status !== 'string') {
    buckets.anomalies += 1;
    continue;
  }
  if (review.operator_status === 'approved') buckets.approved += 1;
  else if (review.operator_status === 'rejected') buckets.rejected += 1;
  else buckets.pending += 1;
}

const total = candidatesDoc.candidates.length;

function generateJson() {
  const output = execFileSync(process.execPath, [
    path.resolve(__dirname, 'summarize-execution-candidate-status-json-v1.js')
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

let summary;
try {
  summary = generateJson();
} catch (err) {
  console.error(`failed to generate status json: ${err.message}`);
  process.exit(1);
}

const coverage = summary.coverage || {};
const tooling = summary.tooling || {};
const expectedTooling = buckets.approved + buckets.pending + buckets.rejected + buckets.unreviewed + buckets.anomalies === total;

const errors = [];

for (const key of Object.keys(buckets)) {
  if (coverage[key] !== buckets[key]) errors.push(`coverage.${key} mismatch (${coverage[key]} vs ${buckets[key]})`);
}

if (coverage.total_candidates !== total) errors.push(`coverage.total_candidates mismatch (${coverage.total_candidates} vs ${total})`);

const manifestOutput = execFileSync(process.execPath, [
  path.resolve(__dirname, 'summarize-execution-candidate-tooling-manifest-v1.js')
], { encoding: 'utf8' });
const manifest = JSON.parse(manifestOutput);
const present = (manifest.manifest || []).filter((entry) => entry.exists).length;
const missing = (manifest.manifest || []).length - present;

if (tooling.present !== present) errors.push(`tooling.present mismatch (${tooling.present} vs ${present})`);
if (tooling.missing !== missing) errors.push(`tooling.missing mismatch (${tooling.missing} vs ${missing})`);

if (errors.length > 0 || !expectedTooling) {
  console.error('Validation failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  if (!expectedTooling) console.error('  - coverage buckets total mismatch');
  process.exit(1);
}

console.log('Execution candidate status JSON validation succeeded.');
process.exit(0);
