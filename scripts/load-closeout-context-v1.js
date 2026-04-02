#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const helpArgIndex = args.findIndex((arg) => arg === '--help' || arg === '-h');
if (helpArgIndex !== -1) {
  console.log(`
Usage: node scripts/load-closeout-context-v1.js [options] [--set KEY=VALUE ...]

Options:
  --help, -h             Show this help text.
  --context-file=PATH    Read the closeout context from a JSON file. Takes precedence over other sources.
  --context-json=JSON    Read the closeout context from an inline JSON string.

If neither --context-file nor --context-json is supplied, the loader reads tmp/closeout-context/active-packet.json (local-only). Loaded context entries are forwarded as --set KEY=VALUE to build-closeout-prompt-v1.js; later CLI --set values override earlier ones.

Exit codes:
  0 - success / help out
  1 - missing context when no default local file exists
  2-6 - existing parse/schema validation errors
`);
  process.exit(0);
}

const contextFileArgIndex = args.findIndex((arg) => arg.startsWith('--context-file='));
const contextJsonArgIndex = args.findIndex((arg) => arg.startsWith('--context-json='));

const DEFAULT_PACKET_PATH = 'tmp/closeout-context/active-packet.json';

let contextSource;
if (contextFileArgIndex !== -1) {
  contextSource = { type: 'file', value: args[contextFileArgIndex].split('=')[1] };
} else if (contextJsonArgIndex !== -1) {
  contextSource = { type: 'json', value: args[contextJsonArgIndex].split('=')[1] };
} else {
  // fallback to default packet path if it exists
  if (fs.existsSync(DEFAULT_PACKET_PATH)) {
    contextSource = { type: 'file', value: DEFAULT_PACKET_PATH, auto: true };
  }
}

if (!contextSource) {
  console.error(`Error: no closeout context provided and default local context not found at ${DEFAULT_PACKET_PATH}. Specify --context-file=PATH or --context-json=JSON.`);
  process.exit(1);
}

const cleanedArgs = args.filter((_, idx) => idx !== contextFileArgIndex && idx !== contextJsonArgIndex && idx !== helpArgIndex);

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
      console.error(`Error reading context file: ${contextSource.auto ? 'default packet ' : ''}${err.message}`);
      process.exit(3);
    }
  }
  return parseJson(contextSource.value);
}

const supportedKeys = new Set(['SUBSYSTEM_NAME', 'CONFIRMED_CHANGE', 'CONTRACT_POINT']);
const context = loadContext();
const contextSets = [];
Object.entries(context).forEach(([key, value]) => {
  if (!supportedKeys.has(key)) {
    console.error(`Unsupported context key: ${key}`);
    process.exit(4);
  }
  if (value === undefined || value === null || value === '') {
    console.error(`Context key ${key} must have a non-empty value`);
    process.exit(5);
  }
  if (typeof value !== 'string') {
    console.error(`Context key ${key} must be a string`);
    process.exit(6);
  }
  contextSets.push('--set', `${key}=${value}`);
});

const runnerArgs = [...contextSets, ...cleanedArgs];
const runner = spawnSync(process.execPath, [path.resolve(__dirname, 'build-closeout-prompt-v1.js'), ...runnerArgs], { stdio: 'inherit' });
process.exit(runner.status);
