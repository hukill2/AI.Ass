#!/usr/bin/env node
// Usage: node scripts/promote-followup-to-task-input-v1.js --followup-id <id>

const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const idx = args.indexOf('--followup-id');
const followupId = idx >= 0 ? args[idx + 1] : undefined;
if (!followupId) {
  console.error('--followup-id is required.');
  process.exit(1);
}
const followupPath = path.resolve(__dirname, '..', 'runtime', 'narrowed-followup-tasks.v1.json');
let followupDoc;
try {
  followupDoc = JSON.parse(fs.readFileSync(followupPath, 'utf8'));
} catch (err) {
  console.error(`Failed to read follow-up store: ${err.message}`);
  process.exit(1);
}
if (!Array.isArray(followupDoc.tasks)) {
  console.error('Follow-up store malformed.');
  process.exit(1);
}
const task = followupDoc.tasks.find((t) => t.followup_id === followupId);
if (!task) {
  console.error(`Follow-up ${followupId} not found.`);
  process.exit(1);
}
const payload = {
  task_id: task.task_id,
  task_summary: task.narrowed_task_summary,
  source_followup_id: task.followup_id,
  source_execution_id: task.source_execution_id,
};
const taskInputPath = path.resolve(__dirname, '..', 'runtime', 'task-input.v1.json');
fs.writeFileSync(taskInputPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log('Task input updated.');
console.log(`followup_id: ${followupId}`);
console.log(`task_id: ${payload.task_id}`);
console.log(`source_execution_id: ${payload.source_execution_id}`);
console.log('task-input.v1.json updated successfully.');
