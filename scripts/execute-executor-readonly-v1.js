#!/usr/bin/env node
// Usage: node scripts/execute-executor-readonly-v1.js --execution-id <id>

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const execIndex = args.indexOf('--execution-id');
const executionId = execIndex >= 0 ? args[execIndex + 1] : undefined;
if (!executionId) {
  console.error('Missing --execution-id.');
  process.exit(1);
}

function load(relPath) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8'));
}

const reviews = (load('runtime/decision-reviews.v1.json').reviews) || [];
const candidates = (load('runtime/execution-candidates.v1.json').candidates) || [];
const payloads = (load('runtime/executor-payloads.v1.json').payloads) || [];
const handoffs = (load('runtime/executor-handoff-packets.v1.json').packets) || [];
const previews = (load('runtime/executor-invocation-previews.v1.json').previews) || [];
const logsPath = path.resolve(__dirname, '..', 'runtime', 'execution-logs.v1.json');
let logsDoc;
try {
  logsDoc = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
} catch (err) {
  console.error(`Failed to read execution logs: ${err.message}`);
  process.exit(1);
}
if (!Array.isArray(logsDoc.logs)) {
  console.error('Execution log store malformed.');
  process.exit(1);
}

const candidate = candidates.find((c) => c.execution_id === executionId);
const review = candidate ? reviews.find((r) => r.review_id === candidate.review_id) : undefined;
const payload = candidate ? payloads.find((p) => p.execution_id === executionId) : undefined;
const handoff = payload ? handoffs.find((p) => p.payload_id === payload.payload_id) : undefined;
const preview = handoff ? previews.find((p) => p.handoff_id === handoff.handoff_id) : undefined;

if (!candidate || !review || !payload || !handoff || !preview) {
  console.error('Execution chain incomplete; cannot run executor readonly.');
  process.exit(1);
}
if (review.operator_status !== 'approved' || !['approval-required','review-required'].includes(review.classification)) {
  console.error('Review not approved for executor execution.');
  process.exit(1);
}
if (candidate.execution_status !== 'execution_prepared') {
  console.error('Execution candidate is not in execution_prepared state.');
  process.exit(1);
}
const existingLog = logsDoc.logs.find((log) => log.execution_id === executionId && log.executor === 'qwen-readonly');
if (existingLog) {
  console.error('A qwen-readonly execution log already exists for this execution_id.');
  process.exit(1);
}

const cmd = 'ollama';
const modelName = 'qwen2.5-coder:7b';
const fullPrompt = preview.prompt_text;
const argsCmd = ['run', modelName];
const spawnResult = invokeOllama(fullPrompt);
let executionResult = 'success';
let notes = '';
const stdoutPreview = sanitizeAnsi((spawnResult.stdout || '').trim()).replace(/\s+/g, ' ').slice(0, 200);
const commandDetail = `${cmd} ${argsCmd.join(' ')}`;
const stderrRaw = (spawnResult.stderr || '').trim();
const sanitizedStderr = sanitizeAnsi(stderrRaw);
const is500 = spawnResult._ollama500 || sanitizedStderr.includes('500 Internal Server Error');
if (spawnResult.error) {
  executionResult = 'failed';
  const errMsg = spawnResult.error.message;
  notes = `Qwen invocation failed: ${errMsg}`;
} else if (spawnResult.status !== 0) {
  executionResult = 'failed';
  const status = spawnResult.status;
  const signal = spawnResult.signal ? ` signal=${spawnResult.signal}` : '';
  notes = `Qwen exited ${status}${signal}; stderr=${sanitizedStderr || '<none>'}`;
} else {
  notes = stdoutPreview ? `Readonly output: ${stdoutPreview}` : 'Qwen returned empty readonly response.';
}
if (is500) {
  notes += ' (500 Internal Server Error from Ollama; see docs/executor-real-executor-readonly-plan-v1.md)';
}
notes += `; model=${modelName}; cmd=${commandDetail}`;

function sanitizeAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

function invokeOllama(payload) {
  const opts = { encoding: 'utf8', timeout: 120000, input: payload };
  let attempt = 0;
  while (true) {
    attempt += 1;
    const result = spawnSync(cmd, argsCmd, opts);
    const stderr = result.stderr ? result.stderr.toString() : '';
    if (
      attempt < 2 &&
      (result.status !== 0 || result.error) &&
      stderr.includes('500 Internal Server Error')
    ) {
      console.warn('Ollama returned 500; retrying once after a brief wait...');
      continue;
    }
    result._ollama500 = stderr.includes('500 Internal Server Error');
    return result;
  }
}

const logEntry = {
  execution_log_id: `log-${Date.now()}`,
  execution_id: executionId,
  review_id: review.review_id,
  decision_id: review.decision_id,
  payload_id: payload.payload_id,
  handoff_id: handoff.handoff_id,
  preview_id: preview.preview_id,
  executor: 'qwen-readonly',
  execution_result: executionResult,
  files_changed: [],
  notes: notes || 'Qwen readonly check completed.',
  created_at: new Date().toISOString(),
};

logsDoc.logs.push(logEntry);
fs.writeFileSync(logsPath, JSON.stringify(logsDoc, null, 2) + '\n', 'utf8');
console.log('Qwen readonly executor log recorded.');
console.log(`execution_id: ${executionId}`);
console.log(`review_id: ${review.review_id}`);
console.log(`decision_id: ${review.decision_id}`);
console.log(`execution_result: ${executionResult}`);
console.log(`Latest log_id: ${logEntry.execution_log_id}`);
console.log(`Total logs stored: ${logsDoc.logs.length}`);
if (spawnResult.stdout) {
  console.log(`Qwen readonly response: ${(spawnResult.stdout || '').trim().replace(/\s+/g, ' ').slice(0, 200)}`);
}
if (spawnResult.error || spawnResult.status !== 0) {
  const statusInfo = spawnResult.error ? `error=${spawnResult.error.message}` : `exit=${spawnResult.status}${spawnResult.signal ? ` signal=${spawnResult.signal}` : ''}`;
  console.log(`Qwen readonly failure detail: ${statusInfo}; stderr=${(spawnResult.stderr || '').trim() || '<none>'}; cmd=${cmd} ${argsCmd.join(' ')}`);
}
process.exit(executionResult === 'success' ? 0 : 1);
