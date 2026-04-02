#!/usr/bin/env node
const { execFileSync } = require('child_process');
const path = require('path');

const validators = [
  'validate-all-review-lanes-state-v1',
  'validate-review-lane-summary-alignment-v1',
  'validate-execution-candidate-anomalies-v1',
  'validate-unreviewed-execution-state-v1',
  'validate-execution-candidate-coverage-buckets-v1',
  'validate-execution-candidate-view-coverage-v1',
  'validate-execution-candidate-tooling-inventory-v1',
  'validate-execution-candidate-tooling-manifest-v1',
  'validate-execution-candidate-ops-status-v1',
  'validate-execution-candidate-status-markdown-v1',
  'validate-execution-candidate-status-json-v1',
  'validate-execution-candidate-status-output-alignment-v1',
  'validate-execution-candidate-tooling-catalog-v1'
];

function runValidator(name) {
  const script = path.resolve(__dirname, `${name}.js`);
  try {
    execFileSync(process.execPath, [script], { stdio: 'ignore' });
    return 'pass';
  } catch {
    return 'fail';
  }
}

function runCommand(scriptName) {
  return execFileSync(process.execPath, [
    path.resolve(__dirname, scriptName)
  ], { encoding: 'utf8' });
}

function parseTextStatus(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const status = {};
  let overall = 'fail';
  lines.forEach((line) => {
    if (line.startsWith('overall:')) {
      overall = line.split(':')[1].trim();
    } else if (line.includes(':')) {
      const [name, value] = line.split(':').map((part) => part.trim());
      if (name !== 'Execution candidate validator suite status') {
        status[name] = value;
      }
    }
  });
  return { status, overall };
}

function parseMarkdown(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line && line.startsWith('|'));
  const status = {};
  let overall = 'fail';
  lines.forEach((line) => {
    const match = line.match(/^\|\s*(.+?)\s*\|\s*(pass|fail)\s*\|$/i);
    if (match) {
      const name = match[1].trim();
      const value = match[2].toLowerCase();
      if (name === 'overall suite') {
        overall = value;
      } else {
        status[name] = value;
      }
    }
  });
  return { status, overall };
}

function parseJson(text) {
  const data = JSON.parse(text);
  return {
    status: data.validators || {},
    overall: data.overall
  };
}

const actual = {};
validators.forEach((name) => {
  actual[name] = runValidator(name);
});

const textStatus = parseTextStatus(runCommand('summarize-execution-candidate-validator-suite-status-v1.js'));
const markdownStatus = parseMarkdown(runCommand('summarize-execution-candidate-validator-suite-status-markdown-v1.js'));
const jsonStatus = parseJson(runCommand('summarize-execution-candidate-validator-suite-status-json-v1.js'));

const statuses = [
  { label: 'text', data: textStatus },
  { label: 'markdown', data: markdownStatus },
  { label: 'json', data: jsonStatus }
];

const errors = [];
const actualOverall = Object.values(actual).every((val) => val === 'pass') ? 'pass' : 'fail';

statuses.forEach(({ label, data }) => {
  if (data.overall !== actualOverall) {
    errors.push(`${label} overall ${data.overall} != actual ${actualOverall}`);
  }
  validators.forEach((name) => {
    const reported = data.status[name] || data.status[name.replace(/-/g, '-')] || data.status[name];
    if (!reported) {
      errors.push(`${label} missing entry for ${name}`);
    } else if (reported !== actual[name]) {
      errors.push(`${label} ${name} ${reported} != actual ${actual[name]}`);
    }
  });
});

if (errors.length > 0) {
  console.error('Validator suite output alignment failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('Validator suite outputs are aligned.');
process.exit(0);
