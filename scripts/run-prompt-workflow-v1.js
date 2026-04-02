#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);

function printUsage(reason) {
  if (reason) {
    console.error(`Error: ${reason}`);
  }
  console.log('Usage: node scripts/run-prompt-workflow-v1.js --name="<template>" [--set KEY=VALUE ...]');
  console.log('This runs the freshness guard before assembling the prompt.');
  console.log('Examples:');
  console.log('  node scripts/run-prompt-workflow-v1.js --name="Closeout prompt" --set SUBSYSTEM_NAME="Prompt mirror" --set COMMIT_MESSAGE="Refresh mirror"');
}

if (args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

const nameArg = args.find((arg) => arg.startsWith('--name='));
if (!nameArg) {
  printUsage('missing template name');
  process.exit(1);
}

const guard = spawnSync(process.execPath, [path.resolve(__dirname, 'check-prompt-template-mirror-v1.js')], { stdio: 'inherit' });
if (guard.status !== 0) {
  process.exit(guard.status);
}

const assembler = spawnSync(process.execPath, [path.resolve(__dirname, 'build-prompt-from-template-v1.js'), ...args], {
  stdio: 'inherit',
});
process.exit(assembler.status);
