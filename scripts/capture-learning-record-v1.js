#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const runtimeDir = path.join(__dirname, '..', 'runtime');
const candidatesPath = path.join(runtimeDir, 'execution-candidates.v1.json');
const logsPath = path.join(runtimeDir, 'execution-logs.v1.json');
const taskContextPath = path.join(runtimeDir, 'task-context.v1.json');
const taskInputPath = path.join(runtimeDir, 'task-input.v1.json');
const learningStorePath = path.join(runtimeDir, 'learning-records.v1.json');
const mirrorDir = path.join(__dirname, '..', 'mirror');
const mirrorStorePath = path.join(mirrorDir, 'learning-records.v1.json');

function displayUsage() {
  console.log('Usage: node scripts/capture-learning-record-v1.js [--execution-id=ID]');
  process.exit(1);
}

const opts = {};
process.argv.slice(2).forEach(arg => {
  if (arg === '--help' || arg === '-h') {
    displayUsage();
  }
  if (arg.startsWith('--execution-id=')) {
    opts.executionId = arg.split('=')[1];
  }
});

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to read ${filePath}: ${err.message}`);
  }
}

if (!fs.existsSync(candidatesPath)) {
  throw new Error(`Missing execution candidates: ${candidatesPath}`);
}
if (!fs.existsSync(logsPath)) {
  throw new Error(`Missing execution logs: ${logsPath}`);
}

const candidatesDoc = readJson(candidatesPath);
const logsDoc = readJson(logsPath);
const candidates = candidatesDoc.candidates || [];
const logs = logsDoc.logs || [];

let executionId = opts.executionId;
if (!executionId) {
  if (!logs.length) {
    throw new Error('No execution logs available to infer execution_id.');
  }
  const latest = logs.reduce((best, next) => {
    if (!best) return next;
    return new Date(next.created_at) > new Date(best.created_at) ? next : best;
  }, null);
  executionId = latest?.execution_id;
}

if (!executionId) {
  throw new Error('Unable to determine execution_id to capture.');
}

const candidate = candidates.find(entry => entry.execution_id === executionId);
if (!candidate) {
  throw new Error(`No execution candidate found for ${executionId}`);
}

const logsForCandidate = logs.filter(entry => entry.execution_id === executionId);
if (!logsForCandidate.length) {
  throw new Error(`No execution logs found for ${executionId}`);
}

const finalLog = logsForCandidate.reduce((best, next) => {
  if (!best) return next;
  return new Date(next.created_at) > new Date(best.created_at) ? next : best;
}, null);

const title = (() => {
  if (fs.existsSync(taskContextPath)) {
    const ctx = readJson(taskContextPath);
    if (ctx.task_id === candidate.task_id && ctx.task_summary) {
      return ctx.task_summary;
    }
  }
  if (fs.existsSync(taskInputPath)) {
    const input = readJson(taskInputPath);
    if (input.task_id === candidate.task_id && input.task_summary) {
      return input.task_summary;
    }
  }
  return candidate.task_id;
})();

const attemptedLocallyFirst = logsForCandidate.some(entry => {
  const executor = (entry.executor || '').toLowerCase();
  return executor.includes('readonly') || executor.includes('local') || executor.includes('dryrun');
});

const routeUsed = (() => {
  const executor = (finalLog.executor || '').toLowerCase();
  if (executor.includes('codex')) return 'Codex';
  if (executor.includes('qwen') || executor.includes('local')) return 'Local';
  if (executor.includes('write')) return 'Write';
  return finalLog.executor || 'Unknown';
})();

const qualityMap = {
  success: 'high',
  no_change: 'medium',
  blocked: 'low',
  failed: 'low',
  warning: 'medium'
};

const resultQuality = qualityMap[finalLog.execution_result] || 'medium';
const approvalOutcome = finalLog.execution_result === 'blocked' ? 'blocked' : 'approved';
const finalOutcome = finalLog.notes || finalLog.execution_result;
const worked = candidate.reasoning || finalLog.notes || '';
const failed = finalLog.execution_result === 'success' ? '' : finalLog.notes || finalLog.execution_result;
const risk = (candidate.risks_or_guardrails && candidate.risks_or_guardrails[0] && candidate.risks_or_guardrails[0].risk) || 'Unknown';
const lessonLearned = candidate.reasoning || finalLog.notes || '';
const followUp = candidate.recommended_next_step || '';

const record = {
  record_id: `learning-${executionId}-${Date.now()}`,
  task_id: candidate.task_id,
  title,
  task_type: 'implementation',
  risk,
  route_used: routeUsed,
  attempted_locally_first: attemptedLocallyFirst,
  required_approval: Boolean(candidate.review_id),
  approval_outcome: approvalOutcome,
  final_outcome: finalOutcome,
  result_quality: resultQuality,
  worked: worked.substring(0, 400),
  failed: failed.substring(0, 400),
  lesson_learned: lessonLearned.substring(0, 400),
  follow_up_recommendation: followUp.substring(0, 400),
  created_at: finalLog.created_at || new Date().toISOString()
};

let learningDoc;
if (fs.existsSync(learningStorePath)) {
  learningDoc = readJson(learningStorePath);
} else {
  learningDoc = { version: 'v1', records: [] };
}

if (!Array.isArray(learningDoc.records)) {
  learningDoc.records = [];
}

if (learningDoc.records.some(item => item.record_id === record.record_id)) {
  console.log(`Learning record ${record.record_id} already captured.`);
} else {
  learningDoc.records.push(record);
  fs.writeFileSync(learningStorePath, JSON.stringify(learningDoc, null, 2) + '\n', 'utf8');
  // Keep the documented mirror lane in sync with the runtime store
  fs.mkdirSync(mirrorDir, { recursive: true });
  fs.copyFileSync(learningStorePath, mirrorStorePath);
  console.log(`Captured learning record ${record.record_id} for ${executionId}.`);
}
