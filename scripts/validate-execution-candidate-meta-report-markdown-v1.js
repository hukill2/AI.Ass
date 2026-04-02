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

function parseAlignment() {
  const output = execFileSync(process.execPath, [
    path.resolve(__dirname, 'validate-execution-candidate-handoff-output-alignment-v1.js')
  ], { encoding: 'utf8' });
  return output.includes('aligned') ? 'pass' : 'fail';
}

function parseMarkdown(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('|'));
  const coverage = {};
  const tooling = {};
  const suite = {};
  let stage = null;
  lines.forEach((line) => {
    if (line.startsWith('| bucket ')) stage = 'coverage';
    else if (line.startsWith('| tooling status ')) stage = 'tooling';
    else if (line.startsWith('| validator suite status ')) stage = 'suite';
    else if (line.startsWith('| health alignment ')) stage = 'alignment';
    else {
      const match = line.match(/^\|\s*(.+?)\s*\|\s*(\d+|pass|fail)\s*\|$/i);
      if (!match) return;
      const key = match[1].trim().toLowerCase().replace(/ /g, '_');
      const value = match[2].trim();
      if (stage === 'coverage') coverage[key] = parseInt(value, 10);
      else if (stage === 'tooling') tooling[key] = parseInt(value, 10);
      else if (stage === 'suite') suite[key] = isNaN(Number(value)) ? value : parseInt(value, 10);
      else if (stage === 'alignment') suite[key] = value;
    }
  });
  return { coverage, tooling, suite };
}

const coverage = computeCoverage();
const manifest = parseManifest();
const tooling = {
  present: manifest.manifest.filter((entry) => entry.exists).length,
  missing: manifest.manifest.length - manifest.manifest.filter((entry) => entry.exists).length
};
const validatorSummary = parseValidatorSummary();
const healthAlignment = parseAlignment();

const markdownText = execFileSync(process.execPath, [
  path.resolve(__dirname, 'summarize-execution-candidate-meta-report-markdown-v1.js')
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
const suiteKeys = ['overall', 'total_validators', 'passed', 'failed'];
suiteKeys.forEach((key) => {
  const expected = validatorSummary[key];
  const reported = parsed.suite[key === 'total_validators' ? 'total_validators' : key];
  if (String(reported) !== String(expected)) {
    errors.push(`validator_suite.${key} mismatch (${reported} vs ${expected})`);
  }
});
if (parsed.suite['overall_alignment'] !== healthAlignment) {
  errors.push(`health_alignment mismatch (${parsed.suite['overall_alignment']} vs ${healthAlignment})`);
}

if (errors.length > 0) {
  console.error('Meta report markdown validation failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('Meta report markdown validation succeeded.');
process.exit(0);
