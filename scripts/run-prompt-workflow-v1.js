#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);

const presetMap = {
  new_subsystem: 'New subsystem thread opener',
  closeout: 'Closeout prompt',
  alignment_review: 'Alignment review / planning prompt',
};

function printUsage(reason) {
  if (reason) {
    console.error(`Error: ${reason}`);
  }
  console.log('Usage: node scripts/run-prompt-workflow-v1.js --name="<template>" [--set KEY=VALUE ...]');
  console.log('This runs the freshness guard before assembling the prompt.');
  console.log('Examples:');
  console.log('  node scripts/run-prompt-workflow-v1.js --name="Closeout prompt" --set SUBSYSTEM_NAME="Prompt mirror" --set COMMIT_MESSAGE="Refresh mirror"');
  console.log('  node scripts/run-prompt-workflow-v1.js --preset=closeout --set SUBSYSTEM_NAME="Prompt mirror"');
  console.log('Presets: new_subsystem, closeout, alignment_review');
}

const presetArg = args.find((arg) => arg.startsWith('--preset='));
if (args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

const nameArg = args.find((arg) => arg.startsWith('--name='));
let effectiveArgs = [...args];
if (!nameArg) {
  if (!presetArg) {
    printUsage('missing template name');
    process.exit(1);
  }
  const presetKey = presetArg.split('=')[1];
  const templateName = presetMap[presetKey];
  if (!templateName) {
    printUsage(`unknown preset "${presetKey}"`);
    process.exit(2);
  }
  effectiveArgs = [...args, `--name=${templateName}`];
} else if (presetArg) {
  const presetTemplate = presetMap[presetArg.split('=')[1]];
  if (presetTemplate) {
    console.warn('Preset provided alongside --name; using explicit name.');
  }
}
const guard = spawnSync(process.execPath, [path.resolve(__dirname, 'check-prompt-template-mirror-v1.js')], { stdio: 'inherit' });
if (guard.status !== 0) {
  process.exit(guard.status);
}

const assembler = spawnSync(process.execPath, [path.resolve(__dirname, 'build-prompt-from-template-v1.js'), ...effectiveArgs], {
  stdio: 'inherit',
});
process.exit(assembler.status);
