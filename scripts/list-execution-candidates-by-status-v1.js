// Usage: node scripts/list-execution-candidates-by-status-v1.js
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'runtime', 'execution-candidates.v1.json');
const STATUSES = ['awaiting_execution', 'execution_blocked', 'execution_prepared', 'executed'];

function loadJson() {
  if (!fs.existsSync(FILE_PATH)) throw new Error(`Missing file: ${FILE_PATH}`);
  return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
}

function main() {
  let data;
  try {
    data = loadJson();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  console.log(`Total execution candidates: ${candidates.length}`);
  const grouped = STATUSES.reduce((acc, status) => {
    acc[status] = [];
    return acc;
  }, {});
  candidates.forEach((candidate) => {
    const status = candidate.execution_status || 'execution_blocked';
    if (!grouped[status]) grouped[status] = [];
    grouped[status].push(candidate);
  });
  STATUSES.forEach((status) => {
    const entries = grouped[status] || [];
    console.log(`\n${status} (${entries.length})`);
    if (!entries.length) {
      console.log('  (none)');
      return;
    }
    entries.forEach((entry) => {
      console.log(
        `  - ${entry.execution_id} review=${entry.review_id} decision=${entry.decision_id} task=${entry.task_id} status=${entry.execution_status} step=${entry.recommended_next_step}`
      );
    });
  });
}

main();
