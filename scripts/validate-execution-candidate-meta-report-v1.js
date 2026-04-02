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

function parseValidatorSummary() {
  const output = execFileSync(process.execPath, [
    path.resolve(__dirname, 'summarize-execution-candidate-validator-suite-status-json-v1.js')
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

function getHealthAlignment() {
  const output = execFileSync(process.execPath, [
    path.resolve(__dirname, 'validate-execution-candidate-handoff-output-alignment-v1.js')
  ], { encoding: 'utf8' });
  return output.includes('aligned') ? 'pass' : 'fail';
}

const coverage = computeCoverage();
const manifest = parseManifest();
const tooling = {
  present: manifest.manifest.filter((entry) => entry.exists).length,
  missing: manifest.manifest.length - manifest.manifest.filter((entry) => entry.exists).length
};
const validatorSummary = parseValidatorSummary();
const healthAlignment = getHealthAlignment();

const metaReportPath = path.resolve(__dirname, 'summarize-execution-candidate-meta-report-v1.js');
const metaOutput = execFileSync(process.execPath, [metaReportPath], { encoding: 'utf8' });
const meta = JSON.parse(metaOutput);

const errors = [];
Object.keys(coverage).forEach((key) => {
  if (meta.coverage[key] !== coverage[key]) {
    errors.push(`coverage.${key} mismatch (${meta.coverage[key]} vs ${coverage[key]})`);
  }
});

if (meta.tooling.present !== tooling.present) errors.push(`tooling.present mismatch (${meta.tooling.present} vs ${tooling.present})`);
if (meta.tooling.missing !== tooling.missing) errors.push(`tooling.missing mismatch (${meta.tooling.missing} vs ${tooling.missing})`);

if (meta.validator_suite.overall !== validatorSummary.overall) errors.push(`validator_suite.overall mismatch (${meta.validator_suite.overall} vs ${validatorSummary.overall})`);
if (meta.validator_suite.total_validators !== validatorSummary.total_validators) errors.push(`validator_suite.total_validators mismatch (${meta.validator_suite.total_validators} vs ${validatorSummary.total_validators})`);
if (meta.validator_suite.passed !== validatorSummary.passed) errors.push(`validator_suite.passed mismatch (${meta.validator_suite.passed} vs ${validatorSummary.passed})`);
if (meta.validator_suite.failed !== validatorSummary.failed) errors.push(`validator_suite.failed mismatch (${meta.validator_suite.failed} vs ${validatorSummary.failed})`);

if (meta.health_alignment !== healthAlignment) {
  errors.push(`health_alignment mismatch (${meta.health_alignment} vs ${healthAlignment})`);
}

if (errors.length > 0) {
  console.error('Meta report validation failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log(meta.health_alignment === 'pass' ? 'Meta report validation succeeded.' : 'Meta report validation failed: health alignment not pass.');
process.exit(meta.health_alignment === 'pass' ? 0 : 1);
