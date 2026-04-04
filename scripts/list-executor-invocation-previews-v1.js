#!/usr/bin/env node
// Usage: node scripts/list-executor-invocation-previews-v1.js

const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'runtime', 'executor-invocation-previews.v1.json');
let doc;
try {
  doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (err) {
  console.error(`Failed to read executor invocation previews: ${err.message}`);
  process.exit(1);
}

const previews = Array.isArray(doc.previews) ? doc.previews : [];
console.log('--- executor Invocation Previews ---');
console.log(`Total previews: ${previews.length}`);
for (const preview of previews) {
  console.log(`- preview_id: ${preview.preview_id}`);
  console.log(`  handoff_id: ${preview.handoff_id}`);
  console.log(`  execution_id: ${preview.execution_id}`);
  console.log(`  decision_id: ${preview.decision_id}`);
  console.log(`  task_id: ${preview.task_id}`);
  console.log(`  executor_target: ${preview.executor_target}`);
}
process.exit(0);
