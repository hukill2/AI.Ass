#!/usr/bin/env node
// Usage: node scripts/validate-execution-candidate-status-markdown-v1.js

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

let manifestOutput;
try {
  const output = execFileSync(process.execPath, [
    path.resolve(__dirname, 'summarize-execution-candidate-tooling-manifest-v1.js')
  ], { encoding: 'utf8' });
  manifestOutput = JSON.parse(output);
} catch (err) {
  console.error(`Failed to generate tooling manifest: ${err.message}`);
  process.exit(1);
}

const tools = manifestOutput.manifest || [];
const present = tools.filter((entry) => entry.exists).length;

let markdown;
try {
  markdown = execFileSync(process.execPath, [
    path.resolve(__dirname, 'summarize-execution-candidate-status-markdown-v1.js')
  ], { encoding: 'utf8' });
} catch (err) {
  console.error(`Failed to generate markdown: ${err.message}`);
  process.exit(1);
}

const coverageChecks = [
  `| approved | ${buckets.approved} |`,
  `| pending | ${buckets.pending} |`,
  `| rejected | ${buckets.rejected} |`,
  `| unreviewed | ${buckets.unreviewed} |`,
  `| anomalies | ${buckets.anomalies} |`,
  `| total candidates | ${totalCandidates} |`
];

let missing = coverageChecks.filter((line) => !markdown.includes(line));
let errors = [];

if (missing.length > 0) {
  errors.push('coverage counts not reflected in markdown');
}

if (!markdown.includes(`| present | ${present} |`)) {
  errors.push('tooling present count mismatch');
}

if (!markdown.includes(`| missing | ${tools.length - present} |`)) {
  errors.push('tooling missing count mismatch');
}

if (errors.length > 0) {
  console.error('Markdown validation failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('Markdown status validation succeeded.');
process.exit(0);
