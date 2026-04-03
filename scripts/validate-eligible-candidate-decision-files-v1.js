#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const DECISIONS_PATH = path.resolve(__dirname, '../runtime/assistant-decisions.v1.json');

function fail(message) {
  console.error(`Eligible candidate decision files guard: ${message}`);
  process.exit(1);
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    fail(`unable to load ${filePath}: ${err.message}`);
  }
}

function eligibleCandidates(candidates) {
  const statuses = new Set(['awaiting_execution', 'execution_prepared']);
  return candidates.filter((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return false;
    }
    const status = typeof candidate.execution_status === 'string' ? candidate.execution_status.trim() : '';
    return statuses.has(status);
  });
}

const candidatesDoc = loadJson(CANDIDATES_PATH);
if (!Array.isArray(candidatesDoc.candidates)) {
  fail('candidates array missing from execution-candidates.v1.json');
}

const eligible = eligibleCandidates(candidatesDoc.candidates);
if (eligible.length !== 1) {
  console.log('Eligible candidate decision files guard skipped because exactly one eligible candidate is not present.');
  process.exit(0);
}

const candidate = eligible[0];
const execId = candidate.execution_id;
if (!execId) {
  fail('eligible candidate missing execution_id');
}

const decisionId = typeof candidate.decision_id === 'string' ? candidate.decision_id.trim() : '';
if (!decisionId) {
  fail(`eligible candidate execution_id=${execId} missing decision_id`);
}

const decisionsDoc = loadJson(DECISIONS_PATH);
if (!Array.isArray(decisionsDoc.decisions)) {
  fail('decisions array missing from assistant-decisions.v1.json');
}

const decision = decisionsDoc.decisions.find((entry) => entry && entry.decision_id === decisionId);
if (!decision) {
  fail(`decision_id=${decisionId} referenced by execution_id=${execId} is not in assistant-decisions.v1.json`);
}

const files = decision.files_to_create_or_update;
if (!Array.isArray(files) || files.length === 0) {
  fail(`decision_id=${decisionId} referenced by execution_id=${execId} lacks files_to_create_or_update`);
}

console.log(`Eligible execution_id=${execId} references ${files.length} file(s) via decision_id=${decisionId}.`);
process.exit(0);
