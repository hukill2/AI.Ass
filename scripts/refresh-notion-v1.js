// Usage: node scripts/refresh-notion-v1.js
const { spawnSync } = require('child_process');

const LANES = [
  { name: 'Reviews / Approvals', script: 'refresh:reviews' },
  { name: 'Architecture Pages', script: 'refresh:architecture' },
];

function runCommand(script) {
  return spawnSync('npm', ['run', script], { shell: true, encoding: 'utf8' });
}

function extractOverallStatus(output = '', fallback) {
  const lines = (output || '').split(/\r?\n/).reverse();
  const match = lines.find((line) => line.startsWith('Overall status:'));
  if (!match) {
    return fallback;
  }
  const status = match.split('Overall status:')[1].trim();
  if (!status) {
    return fallback;
  }
  return status;
}

function printBuffers(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function main() {
  const results = [];

  for (const lane of LANES) {
    const res = runCommand(lane.script);
    printBuffers(res);
    const fallback = res.status === 0 ? 'PASS' : 'FAIL';
    const status = extractOverallStatus(res.stdout, fallback);
    results.push({ name: lane.name, status });
  }

  console.log('--- Notion Refresh Summary ---');
  results.forEach((entry) => {
    console.log(`${entry.name}: ${entry.status}`);
  });
  const overall = results.some((entry) => entry.status === 'FAIL')
    ? 'FAIL'
    : results.some((entry) => entry.status === 'WARN')
    ? 'WARN'
    : 'PASS';
  console.log(`Overall Notion refresh: ${overall}`);
  if (overall === 'FAIL') {
    process.exit(1);
  }
}

main();
