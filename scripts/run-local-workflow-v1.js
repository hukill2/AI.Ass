// Usage: node scripts/run-local-workflow-v1.js
const { spawnSync } = require('child_process');

const STEPS = [
  { name: 'refresh:notion', label: 'Notion refresh', warnable: true },
  { name: 'build-task-context', label: 'Task context build', type: 'node', path: 'scripts/build-task-context-v1.js' },
  { name: 'validate:task-context', label: 'Task context validation' },
  { name: 'run:qwen', label: 'Local assistant run (Qwen)' },
];

function runCommand(cmd, args) {
  return spawnSync(cmd, args, { shell: true, encoding: 'utf8' });
}

function runNpm(name) {
  return runCommand('npm', ['run', name]);
}

function parseOverallStatus(output = '', fallback) {
  const lines = output.split(/\r?\n/).reverse();
  const line = lines.find((l) => l.startsWith('Overall status:'));
  if (!line) return fallback;
  const status = line.split('Overall status:')[1].trim();
  return status || fallback;
}

function logOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function executeStep(step) {
  let result;
  if (step.name === 'build-task-context') {
    result = runCommand('node', [step.path]);
  } else {
    result = runNpm(step.name);
  }
  logOutput(result);
  return result;
}

function summarize() {
  console.log('--- Local Workflow Summary ---');
}

function main() {
  const summary = [];
  let overallFail = false;

  for (const step of STEPS) {
    const result = executeStep(step);
    let status = result.status === 0 ? 'PASS' : 'FAIL';
    if (step.warnable && result.status === 0) {
      const parsed = parseOverallStatus(result.stdout || '', 'PASS');
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

  summarize();
  summary.forEach((entry) => console.log(`${entry.label}: ${entry.status}`));
  const overall = overallFail ? 'FAIL' : summary.some((s) => s.status === 'WARN') ? 'WARN' : 'PASS';
  console.log(`Overall workflow status: ${overall}`);
  if (overallFail) process.exit(1);
}

main();
