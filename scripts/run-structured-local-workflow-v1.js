// Usage: node scripts/run-structured-local-workflow-v1.js
const { spawnSync } = require('child_process');

const STEPS = [
  { type: 'npm', name: 'refresh:notion', label: 'Notion refresh', warnable: true },
  { type: 'node', path: 'scripts/build-task-context-v1.js', label: 'Task context build' },
  { type: 'npm', name: 'validate:task-context', label: 'Task context validation' },
  { type: 'npm', name: 'run:qwen:v2', label: 'Structured local assistant run (Qwen v2)' },
  { type: 'npm', name: 'refresh:assistant-decisions', label: 'Assistant decisions refresh', warnable: true },
  { type: 'node', path: 'scripts/classify-assistant-decision-v1.js', label: 'Decision classification' },
  { type: 'npm', name: 'refresh:decision-reviews', label: 'Decision reviews refresh' },
];

function runCommand(cmd, args) {
  return spawnSync(cmd, args, { shell: true, encoding: 'utf8' });
}

function runStep(step) {
  if (step.type === 'npm') {
    return runCommand('npm', ['run', step.name]);
  }
  return runCommand('node', [step.path]);
}

function printBuffers(res) {
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
}

function parseOverallStatus(output = '', fallback) {
  const lines = (output || '').split(/\r?\n/).reverse();
  const line = lines.find((l) => l.startsWith('Overall status:'));
  if (!line) return fallback;
  const status = line.split('Overall status:')[1].trim();
  return status || fallback;
}

function main() {
  let overallFail = false;
  const summary = [];

  for (const step of STEPS) {
    const result = runStep(step);
    printBuffers(result);
    let status = result.status === 0 ? 'PASS' : 'FAIL';
    if (step.warnable && result.status === 0) {
      const parsed = parseOverallStatus(result.stdout, 'PASS');
      if (parsed === 'WARN' || parsed === 'FAIL') {
        status = parsed;
      }
    }
    summary.push({ label: step.label, status });
    if (status === 'FAIL') {
      overallFail = true;
      break;
    }
  }

  console.log('--- Structured Local Workflow Summary ---');
  summary.forEach((entry) => console.log(`${entry.label}: ${entry.status}`));
  const overall =
    overallFail || summary.some((entry) => entry.status === 'FAIL')
      ? 'FAIL'
      : summary.some((entry) => entry.status === 'WARN')
      ? 'WARN'
      : 'PASS';
  console.log(`Overall workflow status: ${overall}`);
  if (overallFail) {
    process.exit(1);
  }
}

main();
