#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CANDIDATES_PATH = path.resolve(__dirname, '../runtime/execution-candidates.v1.json');
const TASK_CONTEXT_PATH = path.resolve(__dirname, '../runtime/task-context.v1.json');

function fail(message) {
  console.error(`Eligible candidate task-context error: ${message}`);
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
    `Eligible candidate task-context check skipped (${eligible.length} eligible candidate${
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

const taskId = candidate.task_id;
if (!taskId || typeof taskId !== 'string' || !taskId.trim()) {
  fail(`eligible candidate ${execId} missing task_id`);
}

const taskDoc = loadJson(TASK_CONTEXT_PATH);
let taskEntries = [];
if (Array.isArray(taskDoc.task_context)) {
  taskEntries = taskDoc.task_context;
} else if (taskDoc.task_id) {
  taskEntries = [taskDoc];
} else {
  fail('task-context data lacks task entries');
}

if (!taskEntries.find((task) => task.task_id === taskId)) {
  fail(`no task-context record found for task_id=${taskId} (execution_id=${execId})`);
}

console.log(`Eligible execution_id=${execId} links to task_id=${taskId}.`);
process.exit(0);
