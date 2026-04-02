#!/usr/bin/env node
// Usage: node scripts/summarize-execution-candidate-validator-suite-status-markdown-v1.js

const { execFileSync } = require('child_process');
const path = require('path');

const summaryPath = path.resolve(__dirname, 'summarize-execution-candidate-validator-suite-status-v1.js');

const output = execFileSync(process.execPath, [summaryPath], { encoding: 'utf8' });
const lines = output.split('\n').map((line) => line.trim()).filter(Boolean);

console.log('## Execution Candidate Validator Suite Status');
console.log();
console.log('| validator | result |');
console.log('| --- | --- |');
lines.forEach((line) => {
  if (line.startsWith('overall:')) {
    const status = line.split(':')[1].trim();
    console.log(`| overall suite | ${status} |`);
  } else if (line.includes(':')) {
    const [name, status] = line.split(':').map((part) => part.trim());
    if (name !== 'Execution candidate validator suite status') {
      console.log(`| ${name} | ${status} |`);
    }
  }
});
