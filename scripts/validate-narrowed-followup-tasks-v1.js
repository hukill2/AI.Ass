#!/usr/bin/env node
// Usage: node scripts/validate-narrowed-followup-tasks-v1.js

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

if (typeof doc.version !== 'string') {
  console.error('version must be a string');
  process.exit(1);
}

if (!Array.isArray(doc.tasks)) {
  console.error('tasks must be an array');
  process.exit(1);
}

for (const task of doc.tasks) {
  const requiredStrings = ['followup_id','source_execution_id','source_review_id','source_decision_id','task_id','narrowed_task_summary','reason_for_narrowing','operator_notes','created_at'];
  for (const key of requiredStrings) {
    if (typeof task[key] !== 'string') {
      console.error(`task ${task.followup_id || '<unknown>'} invalid or missing ${key}`);
      process.exit(1);
    }
  }
  if (!Array.isArray(task.target_files)) {
    console.error(`task ${task.followup_id} target_files must be an array`);
    process.exit(1);
  }
}

console.log(`narrowed follow-up tasks appear valid (${doc.tasks.length} entries).`);
process.exit(0);
