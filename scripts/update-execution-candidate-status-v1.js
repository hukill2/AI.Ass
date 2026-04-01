#!/usr/bin/env node
// Usage: node scripts/update-execution-candidate-status-v1.js --execution-id <id> --status <status>

const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const idIndex = args.indexOf('--execution-id');
const statusIndex = args.indexOf('--status');
const executionId = idIndex >= 0 ? args[idIndex + 1] : undefined;
const newStatus = statusIndex >= 0 ? args[statusIndex + 1] : undefined;
if (!executionId || !newStatus) {
  console.error('execution-id and status are required.');
  process.exit(1);
}
const allowedStatuses = ['awaiting_execution','execution_blocked','execution_prepared','executed'];
if (!allowedStatuses.includes(newStatus)) {
  console.error(`status must be one of ${allowedStatuses.join(', ')}`);
  process.exit(1);
}
const filePath = path.resolve(__dirname, '..', 'runtime', 'execution-candidates.v1.json');
const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
if (!Array.isArray(doc.candidates)) {
  console.error('execution candidates malformed.');
  process.exit(1);
}
const candidate = doc.candidates.find((c) => c.execution_id === executionId);
if (!candidate) {
  console.error(`Execution candidate ${executionId} not found.`);
  process.exit(1);
}
const oldStatus = candidate.execution_status;
const validTransitions = {
  awaiting_execution: ['execution_prepared','execution_blocked'],
  execution_prepared: ['awaiting_execution','execution_blocked'],
};
if (newStatus === 'executed' || newStatus === oldStatus) {
  console.error('executed is not supported yet or status is unchanged.');
  process.exit(1);
}
if (!validTransitions[oldStatus] || !validTransitions[oldStatus].includes(newStatus)) {
  console.error(`Invalid transition ${oldStatus} -> ${newStatus}.`);
  process.exit(1);
}
candidate.execution_status = newStatus;
candidate.updated_at = new Date().toISOString();
fs.writeFileSync(filePath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log('Execution candidate updated.');
console.log(`execution_id: ${executionId}`);
console.log(`old status: ${oldStatus}`);
console.log(`new status: ${newStatus}`);
