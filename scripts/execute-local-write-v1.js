#!/usr/bin/env node

// Usage: node scripts/execute-local-write-v1.js --execution-id ID

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function load(relPath) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8'));
}

const args = process.argv.slice(2);
const execIndex = args.indexOf('--execution-id');
const executionId = execIndex >= 0 ? args[execIndex + 1] : undefined;
if (!executionId) {
  console.error('Missing --execution-id.');
  process.exit(1);
}

const reviews = load('runtime/decision-reviews.v1.json').reviews || [];
const candidates = load('runtime/execution-candidates.v1.json').candidates || [];
const execLogs = load('runtime/execution-logs.v1.json').logs || [];
const dryrunLogs = load('runtime/write-execution-dryrun-logs.v1.json').logs || [];
const payloads = load('runtime/executor-payloads.v1.json').payloads || [];
const handoffs = load('runtime/codex-handoff-packets.v1.json').packets || [];
const previews = load('runtime/codex-invocation-previews.v1.json').previews || [];

const candidate = candidates.find((c) => c.execution_id === executionId);
if (!candidate) {
  console.error(`Candidate ${executionId} not found.`);
  process.exit(1);
}

const review = reviews.find((r) => r.review_id === candidate.review_id);
const readonlyLog = execLogs.find((log) => log.execution_id === executionId && log.executor === 'qwen-readonly' && log.execution_result === 'success');
const dryrunLog = dryrunLogs.find((log) => log.execution_id === executionId && log.executor === 'qwen-write-dryrun' && log.execution_result === 'no_change');
const targetFiles = candidate.files_to_create_or_update || [];
const payload = payloads.find((p) => p.execution_id === executionId);
const handoff = payload ? handoffs.find((h) => h.payload_id === payload.payload_id) : undefined;
const preview = handoff ? previews.find((p) => p.handoff_id === handoff.handoff_id) : undefined;

function isAllowed(file) {
  return file.startsWith('scripts/') || file.startsWith('runtime/');
}

const CODE_INDICATORS = ['const', 'let', 'function', 'module.exports', 'json.parse', 'try {', 'require('];
const HELP_PHRASES = ["i'd be happy to help", 'i need more information', 'please provide', 'please clarify', 'could you provide', 'let me know', 'do you have'];
function evaluateQuality(text) {
  const lower = (text || '').toLowerCase();
  const indicator = CODE_INDICATORS.find((ind) => lower.includes(ind));
  if (!indicator) {
    return { pass: false, reason: 'missing code indicator' };
  }
  if (HELP_PHRASES.some((phrase) => lower.includes(phrase))) {
    return { pass: false, reason: 'contains conversational help request' };
  }
  const numbered = /^\s*\d+\./m.test(text);
  if (numbered) {
    return { pass: false, reason: 'contains numbered follow-up' };
  }
  return { pass: true, indicator };
}

function snippet(text) {
  return (text || '').split(/\r?\n/).slice(0, 3).join(' ').trim();
}

let executionResult = 'no_change';
let notes = 'Write execution simulated; refer to logs for details.';
if (!review || !['approval-required','review-required'].includes(review.classification) || review.operator_status !== 'approved') {
  executionResult = 'blocked';
  notes = 'Write blocked: review not approved.';
}
if (candidate.execution_status !== 'execution_prepared') {
  executionResult = 'blocked';
  notes = 'Write blocked: candidate not execution_prepared.';
}
if (!readonlyLog) {
  executionResult = 'blocked';
  notes = 'Write blocked: readonly log missing.';
}
if (!dryrunLog) {
  executionResult = 'blocked';
  notes = 'Write blocked: dry-run log missing.';
}
if (targetFiles.length !== 1 || !isAllowed(targetFiles[0])) {
  executionResult = 'blocked';
  notes = 'Write blocked: invalid target file.';
}
if (!payload || !handoff || !preview) {
  executionResult = 'blocked';
  notes = 'Write blocked: payload/handoff/preview missing.';
}

const targetPath = path.resolve(__dirname, '..', targetFiles[0]);
const existingWrites = execLogs.filter((log) => log.execution_id === executionId && log.executor === 'qwen-write');
const lastSuccess = existingWrites.find((log) => log.execution_result === 'success');
const targetExists = fs.existsSync(targetPath);
const lastVerified = lastSuccess && lastSuccess.verification_passed;
if (lastSuccess && targetExists && lastVerified) {
  console.error('A successful, verified qwen-write log already exists and the target file is still present.');
  process.exit(1);
}
if (lastSuccess && targetExists && !lastVerified) {
  console.log('Previous success log missing verification metadata; rerun allowed.');
}
if (lastSuccess && !targetExists) {
  console.log('Previous success log found but target file missing; rerun allowed.');
}

let filesChanged = [];
let writes = false;
let fileWriteAttempted = false;
let fileWriteSucceeded = false;
let fileCreated = false;
let fileModified = false;
let verificationAttempted = false;
let verificationPassed = false;
let verificationNotes = '';
let verificationCommand = '';
if (executionResult === 'no_change') {
    const instruction = [
      'You are executing the write-enabled AI.Ass assistant for scripts/validate-json-lane.js.',
      'Return ONLY the final contents of the file.',
      'No markdown, no code fences, no explanations, no introductions, no follow-up questions, no bullet points, no numbered lists.',
      'Produce a Node.js script that:',
      '- accepts a JSON file path from argv',
      '- reads and parses the file,',
      '- prints "valid" if parsing succeeds, otherwise prints the parsing or read error,',
      '- exits with a non-zero status when the file is invalid or cannot be read.',
      'Ensure the output is valid JavaScript.'
    ].join(' ');
    const fullPrompt = `${instruction}\n\n${preview.prompt_text}`;
    const spawnResult = spawnSync('ollama', ['run', 'qwen2.5-coder:7b'], { encoding: 'utf8', timeout: 120000, input: fullPrompt });
    const rawOutput = (spawnResult.stdout || '').trim();
    const stdout = rawOutput.replace(/```(?:[a-z]*\n)?([\s\S]*?)```/gi, '$1').trim();
  const stderr = (spawnResult.stderr || '').trim();
  if (spawnResult.error) {
    executionResult = 'failed';
    notes = `Write failed: ${spawnResult.error.message}`;
  } else if (spawnResult.status !== 0) {
    executionResult = 'failed';
    notes = `Write failed: exit ${spawnResult.status}; stderr=${stderr || '<none>'}`;
  } else if (!stdout) {
    executionResult = 'no_change';
    notes = 'Write produced no output.';
  } else {
    const quality = evaluateQuality(stdout);
    if (!quality.pass) {
      executionResult = 'failed';
      const previewText = snippet(stdout);
      notes = `Write failed quality gate (${quality.reason}). Preview: ${previewText || '<empty>'}`;
    } else {
      const writtenPath = path.resolve(__dirname, '..', targetFiles[0]);
      const existedBefore = fs.existsSync(writtenPath);
      fs.mkdirSync(path.dirname(writtenPath), { recursive: true });
      fileWriteAttempted = true;
      fs.writeFileSync(writtenPath, stdout + '\n', 'utf8');
      filesChanged = [targetFiles[0]];
      writes = true;
      fileWriteSucceeded = true;
      fileCreated = !existedBefore;
      fileModified = existedBefore;
      notes = `Wrote ${targetFiles[0]} with generated output.`;
      if (targetFiles[0].endsWith('.js')) {
        verificationAttempted = true;
        const verifyCmd = ['node', '--check', writtenPath];
        verificationCommand = verifyCmd.join(' ');
        const verifyResult = spawnSync(verifyCmd[0], verifyCmd.slice(1), {
          encoding: 'utf8',
          timeout: 5000,
        });
        if (verifyResult.error) {
          verificationPassed = false;
          verificationNotes = `Verification failed: ${verifyResult.error.message}`;
        } else if (verifyResult.status !== 0) {
          verificationPassed = false;
          verificationNotes = `Verification failed: ${verifyResult.stderr || verifyResult.stdout || '<no output>'}`;
        } else {
          verificationPassed = true;
          verificationNotes = 'Syntax check passed.';
        }
        notes += ` Verification ${verificationPassed ? 'passed' : 'failed'}${verificationNotes ? ` (${verificationNotes})` : ''}.`;
      }
    }
  }
}

const logEntry = {
  execution_log_id: `write-${Date.now()}`,
  execution_id: executionId,
  review_id: review ? review.review_id : 'n/a',
  decision_id: review ? review.decision_id : 'n/a',
  executor: 'qwen-write',
  execution_result: executionResult === 'no_change' && writes ? 'success' : executionResult,
  target_files: targetFiles.slice(),
  files_changed: filesChanged,
  notes,
  created_at: new Date().toISOString(),
  verification_attempted: verificationAttempted,
  verification_passed: verificationPassed,
  verification_notes: verificationNotes,
  verification_command: verificationCommand,
};

execLogs.push(logEntry);
fs.writeFileSync(path.resolve(__dirname, '..', 'runtime', 'execution-logs.v1.json'), JSON.stringify({ version: 'v1', logs: execLogs }, null, 2) + '\n', 'utf8');

console.log('Qwen write execution log recorded.');
console.log(`execution_id: ${executionId}`);
console.log(`review_id: ${logEntry.review_id}`);
console.log(`decision_id: ${logEntry.decision_id}`);
console.log(`target_file: ${targetFiles[0]}`);
console.log(`execution_result: ${executionResult}`);
console.log(`write performed: ${writes}`);
console.log(`Total execution logs stored: ${execLogs.length}`);
console.log(`file_write_attempted: ${fileWriteAttempted}`);
console.log(`file_write_succeeded: ${fileWriteSucceeded}`);
console.log(`file_created: ${fileCreated}`);
console.log(`file_modified: ${fileModified}`);
