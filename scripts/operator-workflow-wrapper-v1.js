#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const stageScripts = {
  preflight: [
    'check-prompt-template-mirror-v1',
    'validate-execution-candidate-anomalies-v1',
    'validate-all-review-lanes-state-v1',
    'validate-execution-candidate-coverage-buckets-v1',
    'validate-execution-candidate-view-coverage-v1',
    'validate-unreviewed-execution-state-v1'
  ],
  readiness: [
    'summarize-execution-candidate-coverage-buckets-v1',
    'summarize-execution-candidate-tooling-manifest-v1',
    'summarize-execution-candidate-tooling-inventory-v1',
    'summarize-execution-candidate-tooling-catalog-v1',
    'summarize-execution-candidate-health-report-v1',
    'summarize-execution-candidate-health-report-markdown-v1',
    'summarize-execution-candidate-handoff-brief-v1',
    'validate-execution-candidate-health-report-v1',
    'validate-execution-candidate-health-report-markdown-v1',
    'validate-execution-candidate-handoff-brief-v1',
    'validate-execution-candidate-handoff-output-alignment-v1'
  ],
  prep: [
    'summarize-execution-candidate-ops-status-v1',
    'validate-execution-candidate-ops-status-v1',
    'summarize-execution-candidate-validator-suite-status-v1',
    'summarize-execution-candidate-validator-suite-status-markdown-v1',
    'summarize-execution-candidate-validator-suite-status-json-v1',
    'validate-execution-candidate-validator-suite-status-markdown-v1',
    'validate-execution-candidate-validator-suite-status-json-v1',
    'validate-execution-candidate-validator-suite-status-output-alignment-v1'
  ],
  post: [
    'summarize-execution-candidate-health-report-v1',
    'summarize-execution-candidate-health-report-markdown-v1',
    'summarize-execution-candidate-handoff-brief-v1',
    'summarize-execution-candidate-meta-report-v1',
    'summarize-execution-candidate-meta-report-markdown-v1',
    'validate-execution-candidate-health-report-v1',
    'validate-execution-candidate-health-report-markdown-v1',
    'validate-execution-candidate-handoff-brief-v1',
    'validate-execution-candidate-health-report-output-alignment-v1',
    'validate-execution-candidate-meta-report-v1',
    'validate-execution-candidate-meta-report-markdown-v1',
    'validate-execution-candidate-meta-report-output-alignment-v1'
  ]
};

const args = process.argv.slice(2);
const stageNames = Object.keys(stageScripts);
let stage = 'all';
let executionId;
const stageArgIndex = args.findIndex((value) => value.startsWith('--stage='));
const executionIdArgIndex = args.findIndex((value) => value.startsWith('--execution-id='));
if (stageArgIndex >= 0) {
  stage = args[stageArgIndex].split('=')[1];
}
if (executionIdArgIndex >= 0) {
  executionId = args[executionIdArgIndex].split('=')[1];
}

function printUsage() {
  const stageList = stageNames.join(', ');
  console.log('Usage: node scripts/operator-workflow-wrapper-v1.js [--stage=<stage>] [--help]');
  console.log('Supported stages:', stageList);
  console.log('Example: node scripts/operator-workflow-wrapper-v1.js --stage=preflight');
  console.log('Use --stage to run only that phase; omit it to run all stages in order.');
}

if (args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

function runScript(name, scriptArgs = []) {
  const scriptPath = path.resolve(__dirname, `${name}.js`);
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], { encoding: 'utf8' });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  return { name, status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function logStageStart(stageName) {
  console.log(`Stage "${stageName}" starting...`);
}

function logStageComplete(stageName) {
  console.log(`Stage "${stageName}" completed successfully.`);
}

function logStageFailure(stageName, scriptName) {
  console.error(`Stage "${stageName}" stopped at "${scriptName}".`);
}

const guardTelemetryPath = path.resolve(__dirname, '../logs/prompt-template-guard.json');
const guardHistoryPath = path.resolve(__dirname, '../logs/prompt-template-guard-history.jsonl');

function ensureTelemetryDir() {
  const dir = path.dirname(guardTelemetryPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeGuardTelemetry(detail) {
  if (!detail) return;
  ensureTelemetryDir();
  fs.writeFileSync(guardTelemetryPath, JSON.stringify(detail));

  const record = {
    ...detail,
    recordedAt: new Date().toISOString()
  };
  fs.appendFileSync(guardHistoryPath, JSON.stringify(record) + '\n');
}

function parseGuardDetail(output) {
  const lines = output.trim().split(/\r?\n/);
  const jsonLine = lines.reverse().find((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith('{') && trimmed.endsWith('}');
  });
  if (!jsonLine) return null;
  try {
    return JSON.parse(jsonLine);
  } catch {
    return null;
  }
}

function runStage(stageName) {
  logStageStart(stageName);
  if (stageName === 'preflight') {
    if (executionId) {
      const readyResult = runScript('validate-local-write-readiness-v1', [`--execution-id=${executionId}`]);
      if (readyResult.status !== 0) {
        logStageFailure(stageName, 'validate-local-write-readiness-v1');
        return { stage: stageName, status: 'failed', script: 'validate-local-write-readiness-v1', detail: null };
      }
    } else {
      console.log('Skipping local write readiness check: no --execution-id provided.');
    }
  }
  for (const script of stageScripts[stageName]) {
    const result = runScript(script);
    if (result.status !== 0) {
      let detail = null;
      if (script === 'check-prompt-template-mirror-v1') {
        detail = parseGuardDetail(result.stdout + result.stderr);
        console.error(
          'Prompt-template mirror guard failed. Refresh `AI Prompt Templates.docx`, rerun `node scripts/sync-prompt-templates-v1.js`, then rerun this wrapper stage.'
        );
        writeGuardTelemetry(detail);
      }
      logStageFailure(stageName, script);
      return { stage: stageName, status: 'failed', script, detail };
    }
  }
  logStageComplete(stageName);
  return { stage: stageName, status: 'success' };
}

function logFinalSuccess(results) {
  const stageNames = results.map((item) => `"${item.stage}"`).join(', ');
  console.log(`Summary: stages completed - ${stageNames}.`);
  console.log('Operator workflow wrapper completed successfully.');
}

function logFinalFailure(failure) {
  let summary = failure.reason
    ? `Summary: ${failure.reason}`
    : `Summary: stage "${failure.stage}" failed while running "${failure.script}"`;
  if (failure.detail) {
    const details = [];
    if (failure.detail.reason) {
      details.push(`reason=${failure.detail.reason}`);
    }
    if (failure.detail.template) {
      details.push(`template=${failure.detail.template}`);
    }
    if (failure.detail.status) {
      details.push(`guard_status=${failure.detail.status}`);
    }
    if (details.length > 0) {
      summary += ` (${details.join(', ')})`;
    }
  }
  console.error(summary + '.');
  console.error('Operator workflow wrapper failed.');
}

if (stage !== 'all' && !stageNames.includes(stage)) {
  logFinalFailure({ reason: `Unknown stage '${stage}'. Valid stages: ${stageNames.join(', ')}, all.` });
  process.exit(1);
}

const results = [];
if (stage === 'all') {
  for (const stageName of stageNames) {
    const stageResult = runStage(stageName);
    results.push(stageResult);
    if (stageResult.status === 'failed') {
      logFinalFailure(stageResult);
      process.exit(1);
    }
  }
} else {
  const stageResult = runStage(stage);
  results.push(stageResult);
  if (stageResult.status === 'failed') {
    logFinalFailure(stageResult);
    process.exit(1);
  }
}

logFinalSuccess(results);
