#!/usr/bin/env node
// Usage: node scripts/prepare-codex-handoff-dry-run-v1.js --payload-id <id>

const fs = require('fs');
const path = require('path');

function loadJson(relPath) {
  const full = path.resolve(__dirname, '..', relPath);
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    console.error(`Failed to load ${relPath}: ${err.message}`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const payloadArgIndex = args.findIndex((value) => value === '--payload-id');
const payloadId = payloadArgIndex >= 0 ? args[payloadArgIndex + 1] : undefined;
if (!payloadId) {
  console.error('Missing --payload-id.');
  process.exit(1);
}

const payloadsDoc = loadJson('runtime/executor-payloads.v1.json');
const handoffPath = path.resolve(__dirname, '..', 'runtime', 'codex-handoff-packets.v1.json');
let handoffDoc;
try {
  handoffDoc = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
} catch (err) {
  console.error(`Failed to read handoff packets: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(payloadsDoc.payloads) || !Array.isArray(handoffDoc.packets)) {
  console.error('Payload or packet document malformed.');
  process.exit(1);
}

const payload = payloadsDoc.payloads.find((p) => p.payload_id === payloadId);
if (!payload) {
  console.error(`Payload ${payloadId} not found.`);
  process.exit(1);
}

const requiredStrings = ['execution_id','review_id','decision_id','task_id','recommended_next_step','prepared_at'];
for (const field of requiredStrings) {
  if (typeof payload[field] !== 'string' || !payload[field].trim()) {
    console.error(`Payload ${payloadId} missing ${field}.`);
    process.exit(1);
  }
}

if (handoffDoc.packets.some((packet) => packet.payload_id === payloadId)) {
  console.log(`Handoff packet for ${payloadId} already exists.`);
  console.log(`Total packets stored: ${handoffDoc.packets.length}`);
  process.exit(0);
}

const packet = {
  handoff_id: `handoff-${Date.now()}`,
  payload_id: payload.payload_id,
  execution_id: payload.execution_id,
  review_id: payload.review_id,
  decision_id: payload.decision_id,
  task_id: payload.task_id,
  executor_target: 'codex',
  recommended_next_step: payload.recommended_next_step,
  files_to_create_or_update: Array.isArray(payload.files_to_create_or_update) ? payload.files_to_create_or_update.slice() : [],
  reasoning: payload.reasoning || '',
  risks_or_guardrails: Array.isArray(payload.risks_or_guardrails) ? payload.risks_or_guardrails.slice() : [],
  operator_notes: payload.operator_notes || '',
  prepared_at: payload.prepared_at,
};

handoffDoc.packets.push(packet);
fs.writeFileSync(handoffPath, JSON.stringify(handoffDoc, null, 2) + '\n', 'utf8');

console.log('Codex handoff packet prepared.');
console.log(`payload_id: ${packet.payload_id}`);
console.log(`execution_id: ${packet.execution_id}`);
console.log(`decision_id: ${packet.decision_id}`);
console.log(`handoff_id: ${packet.handoff_id}`);
console.log(`Total packets stored: ${handoffDoc.packets.length}`);
process.exit(0);
