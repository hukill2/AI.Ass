#!/usr/bin/env node
// Usage: node scripts/prepare-executor-invocation-preview-v1.js --handoff-id <id>

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
const handoffIndex = args.findIndex((value) => value === '--handoff-id');
const handoffId = handoffIndex >= 0 ? args[handoffIndex + 1] : undefined;
if (!handoffId) {
  console.error('Missing --handoff-id.');
  process.exit(1);
}

const packetsDoc = loadJson('runtime/executor-handoff-packets.v1.json');
const previewsPath = path.resolve(__dirname, '..', 'runtime', 'executor-invocation-previews.v1.json');
let previewsDoc;
try {
  previewsDoc = JSON.parse(fs.readFileSync(previewsPath, 'utf8'));
} catch (err) {
  console.error(`Failed to read previews: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(packetsDoc.packets) || !Array.isArray(previewsDoc.previews)) {
  console.error('executor packet or preview store malformed.');
  process.exit(1);
}

const packet = packetsDoc.packets.find((p) => p.handoff_id === handoffId);
if (!packet) {
  console.error(`executor handoff packet ${handoffId} not found.`);
  process.exit(1);
}

if (typeof packet.recommended_next_step !== 'string' || !packet.recommended_next_step.trim()) {
  console.error(`Packet ${handoffId} missing recommended_next_step.`);
  process.exit(1);
}

if (previewsDoc.previews.some((preview) => preview.handoff_id === handoffId)) {
  console.log(`Preview for ${handoffId} already exists.`);
  console.log(`Total previews stored: ${previewsDoc.previews.length}`);
  process.exit(0);
}

const prompt = `Follow the local AI.Ass instructions and execute: ${packet.recommended_next_step}`;
const preview = {
  preview_id: `preview-${Date.now()}`,
  handoff_id: packet.handoff_id,
  payload_id: packet.payload_id,
  execution_id: packet.execution_id,
  decision_id: packet.decision_id,
  task_id: packet.task_id,
  executor_target: packet.executor_target,
  prompt_text: prompt,
  files_to_create_or_update: Array.isArray(packet.files_to_create_or_update) ? packet.files_to_create_or_update.slice() : [],
  risks_or_guardrails: Array.isArray(packet.risks_or_guardrails) ? packet.risks_or_guardrails.slice() : [],
  operator_notes: packet.operator_notes || '',
  prepared_at: new Date().toISOString(),
};

previewsDoc.previews.push(preview);
fs.writeFileSync(previewsPath, JSON.stringify(previewsDoc, null, 2) + '\n', 'utf8');

console.log('executor invocation preview prepared.');
console.log(`handoff_id: ${preview.handoff_id}`);
console.log(`execution_id: ${preview.execution_id}`);
console.log(`decision_id: ${preview.decision_id}`);
console.log(`prompt_text: ${preview.prompt_text}`);
console.log(`Total previews stored: ${previewsDoc.previews.length}`);
process.exit(0);
