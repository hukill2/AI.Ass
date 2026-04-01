#!/usr/bin/env node
// Usage: node scripts/list-execution-prepared-v1.js

const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'runtime', 'execution-candidates.v1.json');
let doc;
try {
  doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (err) {
  console.error(`Failed to read execution candidates: ${err.message}`);
  process.exit(1);
}

const candidates = Array.isArray(doc.candidates) ? doc.candidates : [];
const prepared = candidates.filter((c) => c.execution_status === 'execution_prepared');
console.log('--- Execution Candidates Prepared for Real Executor ---');
if (!prepared.length) {
  console.log('No execution candidates are currently marked execution_prepared.');
  process.exit(0);
}
console.log(`Total prepared candidates: ${prepared.length}`);
for (const c of prepared) {
  console.log(`- execution_id: ${c.execution_id}`);
  console.log(`  review_id: ${c.review_id}`);
  console.log(`  decision_id: ${c.decision_id}`);
  console.log(`  task_id: ${c.task_id}`);
  console.log(`  execution_status: ${c.execution_status}`);
  console.log(`  recommended_next_step: ${c.recommended_next_step || '<none>'}`);
}


