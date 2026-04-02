#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const contextFileArgIndex = args.findIndex((arg) => arg.startsWith('--context-file='));
const contextJsonArgIndex = args.findIndex((arg) => arg.startsWith('--context-json='));

let contextSource;
if (contextFileArgIndex !== -1) {
  contextSource = { type: 'file', value: args[contextFileArgIndex].split('=')[1] };
} else if (contextJsonArgIndex !== -1) {
  contextSource = { type: 'json', value: args[contextJsonArgIndex].split('=')[1] };
}

if (!contextSource) {
  console.error('Error: specify --context-file=PATH or --context-json=JSON');
  process.exit(1);
}

const cleanedArgs = args.filter((_, idx) => idx !== contextFileArgIndex && idx !== contextJsonArgIndex);

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error parsing context JSON: ${err.message}`);
    process.exit(2);
  }
}

function loadContext() {
  if (contextSource.type === 'file') {
    try {
      return parseJson(fs.readFileSync(contextSource.value, 'utf-8'));
    } catch (err) {
      console.error(`Error reading context file: ${err.message}`);
      process.exit(3);
    }
  }
  return parseJson(contextSource.value);
}

const context = loadContext();
const contextSets = [];
Object.entries(context).forEach(([key, value]) => {
  if (value === undefined || value === null) {
    return;
  }
  contextSets.push('--set', `${key}=${String(value)}`);
});

const runnerArgs = [...contextSets, ...cleanedArgs];
const runner = spawnSync(process.execPath, [path.resolve(__dirname, 'build-closeout-prompt-v1.js'), ...runnerArgs], { stdio: 'inherit' });
process.exit(runner.status);
