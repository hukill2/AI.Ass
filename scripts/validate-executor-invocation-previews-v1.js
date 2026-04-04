#!/usr/bin/env node
// Usage: node scripts/validate-executor-invocation-previews-v1.js

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

if (typeof doc.version !== 'string') {
  console.error('version must be a string');
  process.exit(1);
}

if (!Array.isArray(doc.previews)) {
  console.error('previews must be an array');
  process.exit(1);
}

for (const preview of doc.previews) {
  const required = ['preview_id','handoff_id','payload_id','execution_id','decision_id','task_id','executor_target','prompt_text','operator_notes','prepared_at'];
  for (const key of required) {
    if (typeof preview[key] !== 'string') {
      console.error(`preview ${preview.preview_id || '<unknown>'} missing or invalid string field: ${key}`);
      process.exit(1);
    }
  }
  if (!Array.isArray(preview.files_to_create_or_update)) {
    console.error(`preview ${preview.preview_id} files_to_create_or_update must be an array`);
    process.exit(1);
  }
  if (!Array.isArray(preview.risks_or_guardrails)) {
    console.error(`preview ${preview.preview_id} risks_or_guardrails must be an array`);
    process.exit(1);
  }
}

console.log(`executor invocation previews appear valid (${doc.previews.length} entries).`);
process.exit(0);
