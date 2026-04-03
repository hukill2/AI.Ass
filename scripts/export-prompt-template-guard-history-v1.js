#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const historyPath = path.resolve(__dirname, '../logs/prompt-template-guard-history.jsonl');
const csvPath = path.resolve(__dirname, '../logs/prompt-template-guard-history.csv');

if (!fs.existsSync(historyPath)) {
  console.error(`No guard history found at ${historyPath}.`);
  process.exit(1);
}

const lines = fs.readFileSync(historyPath, 'utf8').split(/\r?\n/).filter(Boolean);
if (lines.length === 0) {
  console.error(`Guard history file ${historyPath} is empty.`);
  process.exit(1);
}

const rows = [];
for (const line of lines) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch (err) {
    console.error(`Malformed guard history line: ${err.message}`);
    process.exit(1);
  }
  rows.push({
    recordedAt: entry.recordedAt || '',
    status: entry.status || '',
    reason: entry.reason || '',
    template: entry.template || '',
    guard: entry.guard || ''
  });
}

const header = ['recordedAt', 'status', 'reason', 'template', 'guard'];
const csvLines = [header.join(',')];
for (const row of rows) {
  const values = header.map((field) =>
    `"${(row[field] || '').replace(/"/g, '""')}"`
  );
  csvLines.push(values.join(','));
}

fs.writeFileSync(csvPath, csvLines.join('\n'));
console.log(`Guard history exported to ${csvPath}.`);
