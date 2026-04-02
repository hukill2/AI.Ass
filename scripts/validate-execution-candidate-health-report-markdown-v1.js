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

function loadManifest() {
  const output = execFileSync(process.execPath, [
    path.resolve(__dirname, 'summarize-execution-candidate-tooling-manifest-v1.js')
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

function loadValidatorSummary() {
  const output = execFileSync(process.execPath, [
    path.resolve(__dirname, 'summarize-execution-candidate-validator-suite-status-json-v1.js')
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

function parseMarkdown(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('|'));
  const coverage = {};
  const tooling = {};
  const suite = {};
  let stage = 'coverage';

  lines.forEach((line) => {
    if (line.startsWith('| bucket |')) stage = 'coverage';
    else if (line.startsWith('| tooling status |')) stage = 'tooling';
    else if (line.startsWith('| validator suite |')) stage = 'suite';
    else {
      const match = line.match(/^\|\s*(.+?)\s*\|\s*(\d+|pass|fail)\s*\|$/i);
      if (!match) return;
      const keyRaw = match[1].trim();
      const valueRaw = match[2].trim();
      const key = keyRaw.toLowerCase().replace(/ /g, '_');
      if (stage === 'coverage') {
        coverage[key] = parseInt(valueRaw, 10);
      } else if (stage === 'tooling') {
        tooling[key] = parseInt(valueRaw, 10);
      } else if (stage === 'suite') {
        suite[key] = valueRaw;
      }
    }
  });
  return { coverage, tooling, suite };
}

const coverage = computeCoverage();
const toolingManifest = loadManifest();
const toolingList = toolingManifest.manifest || [];
const tooling = {
  present: toolingList.filter((entry) => entry.exists).length,
  missing: toolingList.length - toolingList.filter((entry) => entry.exists).length
};
const validatorSummary = loadValidatorSummary();

const markdownText = execFileSync(process.execPath, [
  path.resolve(__dirname, 'summarize-execution-candidate-health-report-markdown-v1.js')
], { encoding: 'utf8' });
const parsed = parseMarkdown(markdownText);

const errors = [];
Object.keys(coverage).forEach((key) => {
  if (parsed.coverage[key] !== coverage[key]) {
    errors.push(`coverage.${key} mismatch (${parsed.coverage[key]} vs ${coverage[key]})`);
  }
});

if (parsed.tooling.present !== tooling.present) {
  errors.push(`tooling.present mismatch (${parsed.tooling.present} vs ${tooling.present})`);
}
if (parsed.tooling.missing !== tooling.missing) {
  errors.push(`tooling.missing mismatch (${parsed.tooling.missing} vs ${tooling.missing})`);
}

const suiteCheck = {
  overall: validatorSummary.overall,
  total_validators: validatorSummary.total_validators.toString(),
  passed: validatorSummary.passed.toString(),
  failed: validatorSummary.failed.toString()
};

Object.entries(suiteCheck).forEach(([key, expected]) => {
  if (parsed.suite[key] !== expected) {
    errors.push(`suite.${key} mismatch (${parsed.suite[key]} vs ${expected})`);
  }
});

if (errors.length > 0) {
  console.error('Health markdown validation failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('Health markdown validation succeeded.');
process.exit(0);
