#!/usr/bin/env node
// Usage: node scripts/list-narrowed-followup-tasks-v1.js

const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'runtime', 'narrowed-followup-tasks.v1.json');
let doc;
try {
  doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (err) {
  console.error(`Failed to read narrowed follow-up tasks: ${err.message}`);
  process.exit(1);
}

const tasks = Array.isArray(doc.tasks) ? doc.tasks : [];
console.log('--- Narrowed Follow-Up Tasks ---');
console.log(`Total tasks: ${tasks.length}`);
for (const task of tasks) {
  console.log(`- followup_id: ${task.followup_id}`);
  console.log(`  source_execution_id: ${task.source_execution_id}`);
  console.log(`  source_review_id: ${task.source_review_id}`);
  console.log(`  source_decision_id: ${task.source_decision_id}`);
  console.log(`  task_id: ${task.task_id}`);
  console.log(`  narrowed_task_summary: ${task.narrowed_task_summary}`);
  console.log(`  target_files: ${JSON.stringify(task.target_files || [])}`);
}
process.exit(0);
