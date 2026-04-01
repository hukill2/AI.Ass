// Usage: node scripts/refresh-decision-reviews-v1.js
const { spawnSync } = require('child_process');

const STEPS = [
  { name: 'validate:decision-reviews', label: 'validation' },
  { name: 'status:decision-reviews', label: 'status' },
];

function runCommand(name) {
  return spawnSync('npm', ['run', name], { shell: true, encoding: 'utf8' });
}

function printOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function main() {
  let overallFail = false;
  const summary = [];
  for (const step of STEPS) {
    const result = runCommand(step.name);
    printOutput(result);
    const status = result.status === 0 ? 'PASS' : 'FAIL';
    summary.push({ label: step.label, status });
    if (status === 'FAIL') overallFail = true;
  }
  console.log('--- Decision Reviews Lane Refresh ---');
  summary.forEach((entry) => console.log(`${entry.label}: ${entry.status}`));
  const overall = overallFail ? 'FAIL' : 'PASS';
  console.log(`Overall result: ${overall}`);
  if (overallFail) process.exit(1);
}

main();
