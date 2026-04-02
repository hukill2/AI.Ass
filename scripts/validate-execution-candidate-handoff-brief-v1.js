#!/usr/bin/env node
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

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

function parseBrief(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const coverage = {};
  const tooling = {};
  const suite = {};
  lines.forEach((line) => {
    if (line.startsWith('Coverage:')) {
      line
        .replace('Coverage:', '')
        .split(',')
        .map((part) => part.trim())
        .forEach((part) => {
          let [key, val] = part.split('=').map((item) => item.trim());
          if (key === 'total') key = 'total_candidates';
          coverage[key] = parseInt(val, 10);
        });
    } else if (line.startsWith('Tooling:')) {
      line
        .replace('Tooling:', '')
        .split(',')
        .map((part) => part.trim())
        .forEach((part) => {
          const [key, val] = part.split('=').map((item) => item.trim());
          tooling[key] = parseInt(val, 10);
        });
    } else if (line.startsWith('Validator suite:')) {
      line
        .replace('Validator suite:', '')
        .split(',')
        .map((part) => part.trim())
        .forEach((part) => {
          let [key, val] = part.split('=').map((item) => item.trim());
          if (key === 'total') key = 'total_validators';
          suite[key.replace(/ /g, '_')] = isNaN(Number(val)) ? val : parseInt(val, 10);
        });
    }
  });
  return { coverage, tooling, suite };
}

const coverage = computeCoverage();
const manifest = parseManifest();
const toolingList = manifest.manifest || [];
const tooling = {
  present: toolingList.filter((entry) => entry.exists).length,
  missing: toolingList.length - toolingList.filter((entry) => entry.exists).length
};
const validatorSummary = parseValidatorSummary();

const briefText = execFileSync(process.execPath, [
  path.resolve(__dirname, 'summarize-execution-candidate-handoff-brief-v1.js')
], { encoding: 'utf8' });
const brief = parseBrief(briefText);

const errors = [];

Object.keys(coverage).forEach((key) => {
  if (brief.coverage[key] !== coverage[key]) {
    errors.push(`coverage.${key} mismatch (${brief.coverage[key]} vs ${coverage[key]})`);
  }
});

if (brief.tooling.present !== tooling.present) {
  errors.push(`tooling.present mismatch (${brief.tooling.present} vs ${tooling.present})`);
}
if (brief.tooling.missing !== tooling.missing) {
  errors.push(`tooling.missing mismatch (${brief.tooling.missing} vs ${tooling.missing})`);
}

const suiteKeys = ['overall', 'total_validators', 'passed', 'failed'];
suiteKeys.forEach((key) => {
  const expected = validatorSummary[key];
  const reported = brief.suite[key === 'total_validators' ? 'total_validators' : key];
  if (reported === undefined || String(reported) !== String(expected)) {
    errors.push(`suite.${key} mismatch (${reported} vs ${expected})`);
  }
});

if (errors.length > 0) {
  console.error('Handoff brief validation failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('Handoff brief validation succeeded.');
process.exit(0);
