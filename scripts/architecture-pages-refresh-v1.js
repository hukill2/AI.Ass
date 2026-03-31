// Usage: node scripts/architecture-pages-refresh-v1.js
const { spawnSync } = require('child_process');

const STEPS = [
  { name: 'pull:architecture', label: 'pull' },
  { name: 'status:architecture', label: 'architecture status' },
];
const QUALITY_SCRIPT = 'quality:architecture';
const QUALITY_MARKER = 'Pages with warnings:';

function runScript(name) {
  return spawnSync('npm', ['run', name], { shell: true, encoding: 'utf8' });
}

function replayOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function parseQualityWarnings(output = '') {
  const line = (output || '').split(/\r?\n/).find((l) => l.startsWith(QUALITY_MARKER));
  if (!line) return 0;
  const count = Number(line.replace(QUALITY_MARKER, '').trim());
  return Number.isNaN(count) ? 0 : count;
}

function main() {
  let overallFail = false;
  const summary = [];

  for (const step of STEPS) {
    const result = runScript(step.name);
    replayOutput(result);
    const success = result.status === 0;
    summary.push({ description: step.label, status: success ? 'PASS' : 'FAIL' });
    if (!success) overallFail = true;
  }

  const qualityResult = runScript(QUALITY_SCRIPT);
  replayOutput(qualityResult);
  const qualityWarnings = parseQualityWarnings(qualityResult.stdout);
  let qualityStatus = qualityResult.status === 0 ? 'PASS' : 'FAIL';
  if (qualityStatus === 'PASS' && qualityWarnings > 0) {
    qualityStatus = 'WARN';
  }
  if (qualityStatus === 'FAIL') {
    overallFail = true;
  }
  summary.push({ description: 'quality report', status: qualityStatus });

  console.log('--- Architecture Pages Refresh Summary ---');
  summary.forEach((entry) => {
    console.log(`${entry.description}: ${entry.status}`);
  });
  const overall = overallFail ? 'FAIL' : qualityStatus === 'WARN' ? 'WARN' : 'PASS';
  console.log(`Overall status: ${overall}`);

  if (overallFail) {
    process.exit(1);
  }
}

main();
