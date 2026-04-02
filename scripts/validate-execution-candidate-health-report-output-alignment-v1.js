#!/usr/bin/env node
const { execFileSync } = require('child_process');
const path = require('path');

function parseJson() {
  const output = execFileSync(process.execPath, [
    path.resolve(__dirname, 'summarize-execution-candidate-health-report-v1.js')
  ], { encoding: 'utf8' });
  return JSON.parse(output);
}

function parseMarkdown() {
  const output = execFileSync(process.execPath, [
    path.resolve(__dirname, 'summarize-execution-candidate-health-report-markdown-v1.js')
  ], { encoding: 'utf8' });
  const lines = output.split('\n').map((line) => line.trim()).filter((line) => line && line.startsWith('|'));
  const coverage = {};
  const tooling = {};
  const suite = {};
  let stage = 'coverage';

  lines.forEach((line) => {
    if (line.startsWith('| bucket |')) stage = 'coverage';
    else if (line.startsWith('| tooling status |')) stage = 'tooling';
    else if (line.startsWith('| validator suite |')) stage = 'suite';
    else {
      const match = line.match(/^\|\s*(.+?)\s*\|\s*(\d+|pass|fail)\s*\|$/i);
      if (!match) return;
      const key = match[1].trim().toLowerCase().replace(/ /g, '_');
      const value = match[2].trim();
      if (stage === 'coverage') coverage[key] = parseInt(value, 10);
      else if (stage === 'tooling') tooling[key] = parseInt(value, 10);
      else suite[key] = value;
    }
  });
  return { coverage, tooling, suite };
}

const jsonReport = parseJson();
const markdownReport = parseMarkdown();

const errors = [];

Object.keys(jsonReport.coverage).forEach((key) => {
  if (markdownReport.coverage[key] !== jsonReport.coverage[key]) {
    errors.push(`coverage.${key} mismatch (${markdownReport.coverage[key]} vs ${jsonReport.coverage[key]})`);
  }
});

if (markdownReport.tooling.present !== jsonReport.tooling.present) {
  errors.push(`tooling.present mismatch (${markdownReport.tooling.present} vs ${jsonReport.tooling.present})`);
}
if (markdownReport.tooling.missing !== jsonReport.tooling.missing) {
  errors.push(`tooling.missing mismatch (${markdownReport.tooling.missing} vs ${jsonReport.tooling.missing})`);
}

const suiteKeys = ['overall', 'total_validators', 'passed', 'failed'];
suiteKeys.forEach((key) => {
  if (markdownReport.suite[key] !== String(jsonReport.validator_suite[key])) {
    errors.push(`suite.${key} mismatch (${markdownReport.suite[key]} vs ${jsonReport.validator_suite[key]})`);
  }
});

if (errors.length > 0) {
  console.error('Health report output alignment failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('Health report outputs are aligned.');
process.exit(0);
