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

function runStage(stageName) {
  console.log(`Running stage ${stageName} scripts...`);
  for (const script of stageScripts[stageName]) {
    try {
      runScript(script);
    } catch (err) {
      console.error(`Stage ${stageName} failed at ${err.message}`);
      process.exit(1);
    }
  }
  console.log(`Stage ${stageName} completed.`);
}

if (stage !== 'all' && !stages.includes(stage)) {
  console.error(`Unknown stage '${stage}'. Valid stages: ${stages.join(', ')}, all.`);
  process.exit(1);
}

if (stage === 'all') {
  for (const stageName of stages) {
    runStage(stageName);
  }
} else {
  runStage(stage);
}

console.log('Operator workflow wrapper completed successfully.');
