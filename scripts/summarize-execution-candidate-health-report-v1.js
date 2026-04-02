#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function loadJson(relPath) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8'));
}

function computeCoverage() {
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
  buckets.total_candidates = candidatesDoc.candidates.length;
  return buckets;
}

function parseManifest() {
  const output = execFileSync(process.execPath, [
    path.resolve(__dirname, 'summarize-execution-candidate-tooling-manifest-v1.js')
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

function parseValidatorJson() {
  const output = execFileSync(process.execPath, [
    path.resolve(__dirname, 'summarize-execution-candidate-validator-suite-status-json-v1.js')
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

const coverage = computeCoverage();
const manifest = parseManifest();
const sum = manifest.manifest || [];
const tooling = {
  present: sum.filter((entry) => entry.exists).length,
  missing: sum.length - sum.filter((entry) => entry.exists).length
};
const validatorStatus = parseValidatorJson();

const report = {
  coverage,
  tooling,
  validator_suite: {
    overall: validatorStatus.overall,
    total_validators: validatorStatus.total_validators,
    passed: validatorStatus.passed,
    failed: validatorStatus.failed
  }
};

console.log(JSON.stringify(report, null, 2));
