// Usage: node scripts/status-all-v1.js
const { spawnSync } = require('child_process');

const lanes = [
  { name: 'Reviews / Approvals', script: 'status:mirror' },
  { name: 'Learning Records', script: 'status:learning' },
  { name: 'Routing Decisions', script: 'status:routing' },
];
const npmRunner = 'npm';

const results = lanes.map((lane) => {
  const proc = spawnSync(npmRunner, ['run', lane.script], { stdio: 'inherit', shell: true });
  return { name: lane.name, passed: proc.status === 0 };
});

console.log('\n--- Summary ---');
let overallPass = true;
results.forEach((result) => {
  const status = result.passed ? 'PASS' : 'FAIL';
  console.log(`${result.name}: ${status}`);
  if (!result.passed) overallPass = false;
});
console.log(`Overall status: ${overallPass ? 'PASS' : 'FAIL'}`);

if (!overallPass) {
  process.exit(1);
}
