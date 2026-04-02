#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);

function printUsage(reason) {
  if (reason) {
    console.error(`Error: ${reason}`);
  }
  console.log('Usage: node scripts/build-prompt-from-template-v1.js --name="<template>" [--set KEY=VALUE ...]');
  console.log('Example: node scripts/build-prompt-from-template-v1.js --name="Closeout prompt" --set SUBSYSTEM_NAME="Prompt mirror" --set COMMIT_MESSAGE="Update mirror"');
}

const nameArg = args.find((arg) => arg.startsWith('--name='));
if (!nameArg) {
  printUsage('missing --name argument');
  process.exit(1);
}

const templateName = nameArg.split('=')[1].replace(/^"|"$/g, '').trim();
if (!templateName) {
  printUsage('template name is empty');
  process.exit(1);
}

const setArgs = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--set') {
    if (i + 1 >= args.length) {
      printUsage('malformed --set argument');
      process.exit(1);
    }
    setArgs.push(args[i + 1]);
    i += 1;
  } else if (args[i].startsWith('--set=')) {
    setArgs.push(args[i].substring(6));
  }
}
const replacements = {};
for (const setArg of setArgs) {
  const [key, ...valueParts] = setArg.split('=');
  if (!key || valueParts.length === 0) {
    printUsage('malformed --set argument');
    process.exit(1);
  }
  const value = valueParts.join('=');
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    printUsage('empty replacement key');
    process.exit(1);
  }
  replacements[normalizedKey] = value;
}

const result = spawnSync(process.execPath, [path.resolve(__dirname, 'get-prompt-template-v1.js'), `--name=${templateName}`], {
  encoding: 'utf-8',
});

if (result.status !== 0) {
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.status);
}

let prompt = result.stdout;

Object.entries(replacements).forEach(([key, value]) => {
  const placeholder = `<${key}>`;
  const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  prompt = prompt.replace(regex, value);
});

console.log(prompt.trim());
