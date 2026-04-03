#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const DECISIONS_PATH = path.resolve(__dirname, '../runtime/assistant-decisions.v1.json');

function fail(message) {
  console.error(`Eligible candidate decision existence error: ${message}`);
  process.exit(1);
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    fail(`unable to load ${filePath} (${err.message})`);
  }
}

function eligibleCandidates(candidates) {
  return candidates.filter((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return false;
    }
    const status = typeof candidate.execution_status === 'string' ? candidate.execution_status.trim() : '';
    return status && ['awaiting_execution', 'execution_prepared'].includes(status);
  });
}

const candidatesDoc = loadJson(CANDIDATES_PATH);
if (!Array.isArray(candidatesDoc.candidates)) {
  fail('"candidates" array missing');
}

const eligible = eligibleCandidates(candidatesDoc.candidates);
if (eligible.length !== 1) {
  console.log(
    `Eligible candidate decision existence check skipped (${eligible.length} eligible candidate${
      eligible.length === 1 ? '' : 's'
    } present).`
  );
  process.exit(0);
}

const candidate = eligible[0];
const execId = candidate.execution_id;
if (!execId) {
  fail('eligible candidate missing execution_id');
}

const decisionId = candidate.decision_id;
if (!decisionId || typeof decisionId !== 'string' || !decisionId.trim()) {
  fail(`eligible candidate ${execId} missing decision_id`);
}

const decisionsDoc = loadJson(DECISIONS_PATH);
if (!Array.isArray(decisionsDoc.decisions)) {
  fail('"decisions" array missing');
}

if (!decisionsDoc.decisions.find((decision) => decision.decision_id === decisionId)) {
  fail(`decision ${decisionId} referenced by execution_id=${execId} not found`);
}

console.log(`Eligible execution_id=${execId} decision ${decisionId} exists.`);
process.exit(0);
