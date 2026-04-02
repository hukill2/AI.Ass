#!/usr/bin/env node
// Usage: node scripts/validate-executor-payloads-helper-v1.js

const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'runtime', 'executor-payloads.v1.json');
let doc;
try {
  doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (err) {
  console.error(`Failed to read executor payloads: ${err.message}`);
  process.exit(1);
}

if (typeof doc.version !== 'string') {
  console.error('executor payloads must declare a string version');
  process.exit(1);
}

if (!Array.isArray(doc.payloads)) {
  console.error('executor payloads must include a payloads array');
  process.exit(1);
}

const implementationKeywords = /\b(create|add|build|implement|modify|update|write|edit)\b/i;
const timelineError = (payloadId, field) => {
  console.error(`payload ${payloadId || '<unknown>'} invalid ${field}`);
};

const summary = {
  checked: doc.payloads.length,
  flagged: 0,
};

for (const payload of doc.payloads) {
  const payloadId = typeof payload.payload_id === 'string' ? payload.payload_id : '<unknown>';
  const requiredStrings = [
    'payload_id',
    'execution_id',
    'review_id',
    'decision_id',
    'task_id',
    'recommended_next_step',
    'reasoning',
    'operator_notes',
    'prepared_at',
  ];

  for (const key of requiredStrings) {
    if (typeof payload[key] !== 'string' || !payload[key].trim()) {
      timelineError(payloadId, key);
      process.exit(1);
    }
  }

  if (!Array.isArray(payload.files_to_create_or_update)) {
    console.error(`payload ${payloadId} files_to_create_or_update must be an array`);
    process.exit(1);
  }

  if (payload.files_to_create_or_update.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    console.error(`payload ${payloadId} contains invalid file entries`);
    process.exit(1);
  }

  if (!Array.isArray(payload.risks_or_guardrails)) {
    console.error(`payload ${payloadId} risks_or_guardrails must be an array`);
    process.exit(1);
  }

  for (const entry of payload.risks_or_guardrails) {
    if (typeof entry === 'string') {
      if (!entry.trim()) {
        console.error(`payload ${payloadId} has empty guardrail string`);
        process.exit(1);
      }
      continue;
    }
    if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.risk === 'string' &&
      entry.risk.trim() &&
      typeof entry.guardrail === 'string' &&
      entry.guardrail.trim()
    ) {
      continue;
    }
    console.error(`payload ${payloadId} has invalid risks_or_guardrails entry`);
    process.exit(1);
  }

  if (Number.isNaN(Date.parse(payload.prepared_at))) {
    console.error(`payload ${payloadId} prepared_at must be an ISO timestamp`);
    process.exit(1);
  }

  const nextStep = payload.recommended_next_step.trim();
  if (!nextStep) {
    timelineError(payloadId, 'recommended_next_step');
    process.exit(1);
  }

  if (implementationKeywords.test(nextStep) && payload.files_to_create_or_update.length === 0) {
    console.error(`payload ${payloadId} implementation step requires file targets`);
    process.exit(1);
  }

  if (payload.files_to_create_or_update.length === 0) {
    console.warn(`payload ${payloadId} has no files_to_create_or_update`);
    summary.flagged += 1;
  }
}

console.log(`executor payload helper verified ${summary.checked} entries (${summary.flagged} flagged for no files).`);
process.exit(0);
