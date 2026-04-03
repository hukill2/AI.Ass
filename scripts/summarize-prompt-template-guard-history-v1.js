#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const historyPath = path.resolve(__dirname, '../logs/prompt-template-guard-history.jsonl');

if (!fs.existsSync(historyPath)) {
  console.error(`No guard history found at ${historyPath}.`);
  process.exit(1);
}

const data = fs.readFileSync(historyPath, 'utf8').split(/\r?\n/).filter(Boolean);
if (data.length === 0) {
  console.error(`Guard history file ${historyPath} is empty.`);
  process.exit(1);
}

let total = 0;
const byReason = {};
const byStatus = {};
const byTemplate = {};
let latest = null;

for (const line of data) {
  total += 1;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch (err) {
    console.error(`Malformed guard history line: ${err.message}`);
    process.exit(1);
  }
  if (entry.reason) {
    byReason[entry.reason] = (byReason[entry.reason] || 0) + 1;
  }
  if (entry.status) {
    byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
  }
  if (entry.template) {
    byTemplate[entry.template] = (byTemplate[entry.template] || 0) + 1;
  }
  if (entry.recordedAt) {
    const ts = new Date(entry.recordedAt);
    if (!Number.isNaN(ts) && (!latest || ts > latest)) {
      latest = ts;
    }
  }
}

console.log(`Guard history entries: ${total}`);
console.log('Statuses:', Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(', ') || 'none');
console.log('Reasons:', Object.entries(byReason).map(([k, v]) => `${k}=${v}`).join(', ') || 'none');
if (Object.keys(byTemplate).length > 0) {
  console.log('Templates:', Object.entries(byTemplate).map(([k, v]) => `${k}=${v}`).join(', '));
}
if (latest) {
  console.log(`Latest recorded guard detail: ${latest.toISOString()}.`);
}
