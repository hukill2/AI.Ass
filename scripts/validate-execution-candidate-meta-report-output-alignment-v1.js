#!/usr/bin/env node
const { execFileSync } = require('child_process');
const path = require('path');

function execScript(script) {
  return execFileSync(process.execPath, [path.resolve(__dirname, script)], { encoding: 'utf8' });
}

function parseJson() {
  return JSON.parse(execScript('summarize-execution-candidate-meta-report-v1.js'));
}

function parseMarkdown() {
  const lines = execScript('summarize-execution-candidate-meta-report-markdown-v1.js')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line.startsWith('|'));

  const coverage = {};
  const tooling = {};
  const suite = {};
  let stage = null;

  lines.forEach((line) => {
    if (line.startsWith('| bucket |')) stage = 'coverage';
    else if (line.startsWith('| tooling status |')) stage = 'tooling';
    else if (line.startsWith('| validator suite status |')) stage = 'suite';
    else if (line.startsWith('| health alignment |')) stage = 'alignment';
    else {
      const match = line.match(/^\|\s*(.+?)\s*\|\s*(\d+|pass|fail)\s*\|$/i);
      if (!match) return;
      const key = match[1].trim().toLowerCase().replace(/ /g, '_');
      const value = match[2].trim();
      if (stage === 'coverage') coverage[key] = parseInt(value, 10);
      else if (stage === 'tooling') tooling[key] = parseInt(value, 10);
      else suite[key] = isNaN(Number(value)) ? value : parseInt(value, 10);
    }
  });

  return { coverage, tooling, suite };
}

const jsonReport = parseJson();
const markdownReport = parseMarkdown();

const errors = [];

['approved', 'pending', 'rejected', 'unreviewed', 'anomalies', 'total_candidates'].forEach((key) => {
  const jsonVal = jsonReport.coverage[key];
  const mdVal = markdownReport.coverage[key];
  if (jsonVal !== mdVal) errors.push(`coverage.${key} mismatch (${jsonVal} vs ${mdVal})`);
});

if (jsonReport.tooling.present !== markdownReport.tooling.present) {
  errors.push(`tooling.present mismatch (${jsonReport.tooling.present} vs ${markdownReport.tooling.present})`);
}
if (jsonReport.tooling.missing !== markdownReport.tooling.missing) {
  errors.push(`tooling.missing mismatch`);
}

['overall', 'total_validators', 'passed', 'failed'].forEach((key) => {
  const jsonVal = key === 'total_validators' ? jsonReport.validator_suite.total_validators : jsonReport.validator_suite[key];
  const mdVal = markdownReport.suite[key === 'total_validators' ? 'total_validators' : key];
  if (String(jsonVal) !== String(mdVal)) {
    errors.push(`validator_suite.${key} mismatch (${jsonVal} vs ${mdVal})`);
  }
});

if (jsonReport.health_alignment !== markdownReport.suite['overall_alignment']) {
  errors.push(`health_alignment mismatch (${jsonReport.health_alignment} vs ${markdownReport.suite['overall_alignment']})`);
}

if (errors.length > 0) {
  console.error('Meta report outputs alignment failed:');
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('Meta report outputs are aligned.');
process.exit(0);
