// Usage: node scripts/assistant-decisions-refresh-v1.js
const { spawnSync } = require('child_process');

const STEPS = [
  { name: 'validate:assistant-decisions', label: 'validation' },
  { name: 'status:assistant-decisions', label: 'status' },
  { name: 'quality:assistant-decisions', label: 'quality report' },
];

function runNpm(name) {
  return spawnSync('npm', ['run', name], { shell: true, encoding: 'utf8' });
}

function printOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function parseQualityWarnings(output = '') {
  const line = output.split(/\r?\n/).find((row) => row.startsWith('Decisions with warnings:'));
  if (!line) return 0;
  const count = Number(line.replace('Decisions with warnings:', '').trim());
  return Number.isNaN(count) ? 0 : count;
}

function main() {
  let overallFail = false;
  const summary = [];
  let qualityWarningsCount = 0;

  for (const step of STEPS) {
    const result = runNpm(step.name);
    printOutput(result);
    let status = result.status === 0 ? 'PASS' : 'FAIL';
    if (step.name === 'quality:assistant-decisions' && result.status === 0) {
      qualityWarningsCount = parseQualityWarnings(result.stdout);
      if (qualityWarningsCount > 0) {
        status = 'WARN';
      }
    }
    summary.push({ label: step.label, status });
    if (status === 'FAIL') {
      overallFail = true;
    }
  }

  console.log('--- Assistant Decisions Refresh Summary ---');
  summary.forEach((entry) => console.log(`${entry.label}: ${entry.status}`));
  const overall = overallFail
    ? 'FAIL'
    : summary.some((entry) => entry.label === 'quality report' && entry.status === 'WARN')
    ? 'WARN'
    : 'PASS';
  console.log(`Overall result: ${overall}`);
  if (overallFail) process.exit(1);
}

main();
