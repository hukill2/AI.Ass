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
const toolingList = manifest.manifest || [];
const tooling = {
  present: toolingList.filter((entry) => entry.exists).length,
  missing: toolingList.length - toolingList.filter((entry) => entry.exists).length
};
const validatorSummary = parseValidatorJson();

const reportPath = path.resolve(__dirname, 'summarize-execution-candidate-health-report-v1.js');
const reportOutput = execFileSync(process.execPath, [reportPath], { encoding: 'utf8' });
const report = JSON.parse(reportOutput);

const errors = [];
Object.keys(coverage).forEach((key) => {
  if (report.coverage[key] !== coverage[key]) {
    errors.push(`coverage.${key} mismatch (${report.coverage[key]} != ${coverage[key]})`);
  }
});

if (report.tooling.present !== tooling.present) {
  errors.push(`tooling.present mismatch (${report.tooling.present} != ${tooling.present})`);
}
if (report.tooling.missing !== tooling.missing) {
  errors.push(`tooling.missing mismatch (${report.tooling.missing} != ${tooling.missing})`);
}

if (report.validator_suite.overall !== validatorSummary.overall) {
  errors.push(`validator_suite.overall ${report.validator_suite.overall} != ${validatorSummary.overall}`);
}
if (report.validator_suite.total_validators !== validatorSummary.total_validators) {
  errors.push(`total_validators mismatch (${report.validator_suite.total_validators} != ${validatorSummary.total_validators})`);
}
if (report.validator_suite.passed !== validatorSummary.passed) {
  errors.push(`passed mismatch (${report.validator_suite.passed} != ${validatorSummary.passed})`);
}
if (report.validator_suite.failed !== validatorSummary.failed) {
  errors.push(`failed mismatch (${report.validator_suite.failed} != ${validatorSummary.failed})`);
}

if (errors.length > 0) {
  console.error('Health report validation failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('Execution candidate health report validation succeeded.');
process.exit(0);
