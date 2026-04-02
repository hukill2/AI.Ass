#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function loadJson(relPath) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8'));
}

function computeBuckets() {
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
  return { buckets, total };
}

function parseOpsStatus(text) {
  const lines = text.split('\n');
  const coverage = {};
  let tooling = {};
  for (const line of lines) {
    const covMatch = line.match(/coverage -> (.+)/);
    if (covMatch) {
      const parts = covMatch[1].split(/\s+/);
      parts.forEach((part) => {
        const m = part.match(/^(.+):(\d+)$/);
        if (m) {
          let key = m[1];
          if (key === 'total') key = 'total_candidates';
          coverage[key] = parseInt(m[2], 10);
        }
      });
    }
    const toolMatch = line.match(/tooling\s+->\s+present:(\d+)\s+missing:(\d+)/);
    if (toolMatch) {
      tooling = { present: parseInt(toolMatch[1], 10), missing: parseInt(toolMatch[2], 10) };
    }
  }
  return { coverage, tooling };
}

function parseMarkdown(text) {
  const coverage = {};
  const tooling = {};
  const lines = text.split('\n').map((line) => line.trim());
  lines.forEach((line) => {
    const covMatch = line.match(/^\|\s*(approved|pending|rejected|unreviewed|anomalies|total candidates)\s*\|\s*(\d+)\s*\|/i);
    if (covMatch) {
      const key = covMatch[1].toLowerCase().replace(' ', '_');
      coverage[key] = parseInt(covMatch[2], 10);
    }
    const toolMatch = line.match(/^\|\s*(present|missing)\s*\|\s*(\d+)\s*\|/i);
    if (toolMatch) {
      tooling[toolMatch[1]] = parseInt(toolMatch[2], 10);
    }
  });
  return { coverage, tooling };
}

function parseJson() {
  const output = execFileSync(process.execPath, [
    path.resolve(__dirname, 'summarize-execution-candidate-status-json-v1.js')
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

function parseManifest() {
  const output = execFileSync(process.execPath, [
    path.resolve(__dirname, 'summarize-execution-candidate-tooling-manifest-v1.js')
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

const { buckets, total } = computeBuckets();

const opsText = execFileSync(process.execPath, [
  path.resolve(__dirname, 'summarize-execution-candidate-ops-status-v1.js')
], { encoding: 'utf8' });
const opsStatus = parseOpsStatus(opsText);

const markdownText = execFileSync(process.execPath, [
  path.resolve(__dirname, 'summarize-execution-candidate-status-markdown-v1.js')
], { encoding: 'utf8' });
const markdownStatus = parseMarkdown(markdownText);

const jsonStatus = parseJson();

const manifest = parseManifest();
const manifestTools = manifest.manifest || [];
const present = manifestTools.filter((entry) => entry.exists).length;
const missing = manifestTools.length - present;

const errors = [];

const expectedCoverage = { ...buckets, total_candidates: total };
const statuses = [
  { name: 'ops', status: opsStatus.coverage, tooling: opsStatus.tooling },
  { name: 'markdown', status: markdownStatus.coverage, tooling: markdownStatus.tooling },
  { name: 'json', status: jsonStatus.coverage, tooling: jsonStatus.tooling }
];

statuses.forEach(({ name, status, tooling }) => {
  Object.keys(expectedCoverage).forEach((key) => {
    if (status[key] !== expectedCoverage[key]) {
      errors.push(`${name} coverage.${key} (${status[key]}) != expected (${expectedCoverage[key]})`);
    }
  });
  if (tooling.present !== present) errors.push(`${name} tooling.present (${tooling.present}) != ${present}`);
  if (tooling.missing !== missing) errors.push(`${name} tooling.missing (${tooling.missing}) != ${missing}`);
});

if (errors.length > 0) {
  console.error('Status output alignment failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('Execution candidate status outputs are aligned.');
process.exit(0);
