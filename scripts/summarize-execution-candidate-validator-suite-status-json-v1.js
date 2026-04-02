#!/usr/bin/env node
const { execFileSync } = require('child_process');
const path = require('path');

const summaryScript = path.resolve(__dirname, 'summarize-execution-candidate-validator-suite-status-v1.js');

const output = execFileSync(process.execPath, [summaryScript], { encoding: 'utf8' });
const lines = output.split('\n').map((line) => line.trim()).filter(Boolean);

const results = {};
let overall = 'fail';

lines.forEach((line) => {
  if (line.startsWith('overall:')) {
    overall = line.split(':')[1].trim();
  } else if (line.includes(':')) {
    const [name, status] = line.split(':').map((part) => part.trim());
    if (name !== 'Execution candidate validator suite status') {
      results[name] = status;
    }
  }
});

const total = Object.keys(results).length;
const passed = Object.values(results).filter((status) => status === 'pass').length;
const failed = total - passed;

const summary = {
  overall,
  total_validators: total,
  passed,
  failed,
  validators: results
};

console.log(JSON.stringify(summary, null, 2));
