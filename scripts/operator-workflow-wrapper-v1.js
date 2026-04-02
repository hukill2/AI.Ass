#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const stageScripts = {
  preflight: [
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

const stages = Object.keys(stageScripts);
const args = process.argv.slice(2);
let stage = 'all';
const stageArgIndex = args.findIndex((value) => value.startsWith('--stage='));
if (stageArgIndex >= 0) {
  stage = args[stageArgIndex].split('=')[1];
}

function runScript(name) {
  const scriptPath = path.resolve(__dirname, `${name}.js`);
  const result = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(name);
  }
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

function runStage(stageName) {
  logStageStart(stageName);
  for (const script of stageScripts[stageName]) {
    try {
      runScript(script);
    } catch (err) {
      logStageFailure(stageName, err.message);
      return { stage: stageName, status: 'failed', script: err.message };
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
  if (failure.reason) {
    console.error(`Summary: ${failure.reason}`);
  } else {
    console.error(`Summary: stage "${failure.stage}" failed while running "${failure.script}".`);
  }
  console.error('Operator workflow wrapper failed.');
}

if (stage !== 'all' && !stages.includes(stage)) {
  logFinalFailure({ reason: `Unknown stage '${stage}'. Valid stages: ${stages.join(', ')}, all.` });
  process.exit(1);
}

const results = [];
if (stage === 'all') {
  for (const stageName of stages) {
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
