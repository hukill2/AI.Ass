#!/usr/bin/env node
const { execFileSync } = require('child_process');
const path = require('path');

function execScript(script) {
  return execFileSync(process.execPath, [path.resolve(__dirname, script)], { encoding: 'utf8' });
}

function parseCoverageMarkdown(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('|'));
  const coverage = {};
  const tooling = {};
  const suite = {};
  let stage = null;
  lines.forEach((line) => {
    if (line.startsWith('| bucket ')) stage = 'coverage';
    else if (line.startsWith('| tooling status ')) stage = 'tooling';
    else if (line.startsWith('| validator suite ')) stage = 'suite';
    else {
      const match = line.match(/^\|\s*(.+?)\s*\|\s*(\d+|pass|fail)\s*\|$/i);
      if (!match) return;
      const key = match[1].trim().toLowerCase().replace(/ /g, '_');
      const value = match[2].trim();
      if (stage === 'coverage') coverage[key] = parseInt(value, 10);
      else if (stage === 'tooling') tooling[key] = parseInt(value, 10);
      else if (stage === 'suite') suite[key] = isNaN(Number(value)) ? value : parseInt(value, 10);
    }
  });
  return { coverage, tooling, suite };
}

function parseBrief(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const coverage = {};
  const tooling = {};
  const suite = {};
  lines.forEach((line) => {
    if (line.startsWith('Coverage:')) {
      line
        .replace('Coverage:', '')
        .split(',')
        .map((part) => part.trim())
        .forEach((part) => {
          let [key, val] = part.split('=').map((item) => item.trim());
          if (key === 'total') key = 'total_candidates';
          coverage[key] = parseInt(val, 10);
        });
    } else if (line.startsWith('Tooling:')) {
      line
        .replace('Tooling:', '')
        .split(',')
        .map((part) => part.trim())
        .forEach((part) => {
          const [key, val] = part.split('=').map((item) => item.trim());
          tooling[key] = parseInt(val, 10);
        });
    } else if (line.startsWith('Validator suite:')) {
      line
        .replace('Validator suite:', '')
        .split(',')
        .map((part) => part.trim())
        .forEach((part) => {
          let [key, val] = part.split('=').map((item) => item.trim());
          if (key === 'total') key = 'total_validators';
          suite[key.replace(/ /g, '_')] = isNaN(Number(val)) ? val : parseInt(val, 10);
        });
    }
  });
  return { coverage, tooling, suite };
}

const jsonReport = JSON.parse(execScript('summarize-execution-candidate-health-report-v1.js'));
const markdownReport = parseCoverageMarkdown(execScript('summarize-execution-candidate-health-report-markdown-v1.js'));
const briefReport = parseBrief(execScript('summarize-execution-candidate-handoff-brief-v1.js'));

const errors = [];

const keys = ['approved', 'pending', 'rejected', 'unreviewed', 'anomalies', 'total_candidates'];
keys.forEach((key) => {
  const jsonVal = jsonReport.coverage[key];
  const mdVal = markdownReport.coverage[key];
  const briefVal = briefReport.coverage[key];
  if (jsonVal !== mdVal || jsonVal !== briefVal) {
    errors.push(`coverage ${key} mismatch (json=${jsonVal}, markdown=${mdVal}, brief=${briefVal})`);
  }
});

if (jsonReport.tooling.present !== markdownReport.tooling.present || jsonReport.tooling.present !== briefReport.tooling.present) {
  errors.push(`tooling.present mismatch (json=${jsonReport.tooling.present}, markdown=${markdownReport.tooling.present}, brief=${briefReport.tooling.present})`);
}
if (jsonReport.tooling.missing !== markdownReport.tooling.missing || jsonReport.tooling.missing !== briefReport.tooling.missing) {
  errors.push(`tooling.missing mismatch (json=${jsonReport.tooling.missing}, markdown=${markdownReport.tooling.missing}, brief=${briefReport.tooling.missing})`);
}

const suiteKeys = ['overall', 'total_validators', 'passed', 'failed'];
suiteKeys.forEach((key) => {
  const jsonVal = key === 'total_validators' ? jsonReport.validator_suite.total_validators : jsonReport.validator_suite[key];
  const mdVal = markdownReport.suite[key === 'total_validators' ? 'total_validators' : key];
  const briefVal = briefReport.suite[key];
  if (jsonVal !== mdVal || jsonVal !== briefVal) {
    errors.push(`suite ${key} mismatch (json=${jsonVal}, markdown=${mdVal}, brief=${briefVal})`);
  }
});

if (errors.length > 0) {
  console.error('Health outputs alignment failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('Health report outputs are aligned.');
process.exit(0);
