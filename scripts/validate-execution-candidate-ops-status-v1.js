#!/usr/bin/env node
// Usage: node scripts/validate-execution-candidate-ops-status-v1.js

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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
  if (review.operator_status === 'approved') {
    buckets.approved += 1;
  } else if (review.operator_status === 'rejected') {
    buckets.rejected += 1;
  } else {
    buckets.pending += 1;
  }
}

const totalCandidates = candidatesDoc.candidates.length;

let manifest;
try {
  const output = execFileSync(process.execPath, [
    path.resolve(__dirname, 'summarize-execution-candidate-tooling-manifest-v1.js')
  ], { encoding: 'utf8' });
  manifest = JSON.parse(output);
} catch (err) {
  console.error(`Failed to generate tooling manifest: ${err.message}`);
  process.exit(1);
}

const tools = manifest.manifest || [];
const present = tools.filter((entry) => entry.exists).length;

const missing = tools.length - present;

let errors = [];

if (buckets.anomalies > 0) {
  errors.push(`anomalies detected (${buckets.anomalies})`);
}

if (present !== tools.length) {
  errors.push(`tooling manifest missing ${missing} utilities`);
}

if ((buckets.approved + buckets.pending + buckets.rejected + buckets.unreviewed + buckets.anomalies) !== totalCandidates) {
  errors.push('coverage bucket sum mismatch');
}

if (errors.length > 0) {
  console.error('Op-status validation failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('Op-status validation succeeded.');
process.exit(0);
