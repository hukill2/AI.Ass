#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const mirrorPath = path.resolve(__dirname, '../docs/prompt-templates.md');

if (!fs.existsSync(mirrorPath)) {
  console.error(`Mirror file missing at ${mirrorPath}.`);
  process.exit(1);
}

const raw = fs.readFileSync(mirrorPath, 'utf-8');
const lines = raw.split(/\r?\n/);

const templates = [];
let current = null;
let inBlock = false;

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  if (line.startsWith('### ')) {
    if (current) {
      templates.push(current);
    }
    current = { name: line.substring(4).trim(), body: '' };
    inBlock = false;
    continue;
  }
  if (!current) {
    continue;
  }
  if (line.trim() === '```') {
    if (!inBlock) {
      inBlock = true;
      current.body = '';
    } else {
      inBlock = false;
    }
    continue;
  }
  if (inBlock) {
    current.body += `${line}\n`;
  }
}

if (current) {
  templates.push(current);
}

function getTemplateByName(name) {
  return templates.find((item) => item.name.toLowerCase() === String(name || '').toLowerCase()) || null;
}

function printUsage() {
  console.log('Usage: node scripts/get-prompt-template-v1.js [--list | --name="<template name>"]');
  console.log('Options:');
  console.log('  --list           list available prompt template names');
  console.log('  --name="<name>"  print the matching template body');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printUsage('missing args');
    process.exit(2);
  }

  if (args.includes('--list')) {
    templates.forEach((template) => {
      console.log(template.name);
    });
    process.exit(0);
  }

  const nameArg = args.find((arg) => arg.startsWith('--name='));
  if (!nameArg || args.length > 1) {
    printUsage('invalid args');
    process.exit(2);
  }

  const name = nameArg.split('=')[1].replace(/^"|"$/g, '').trim();
  if (!name) {
    console.error('Template name is empty.');
    process.exit(3);
  }

  const template = getTemplateByName(name);
  if (!template) {
    console.error(`Template not found: ${name}`);
    process.exit(4);
  }

  process.stdout.write(template.body);
}

if (require.main === module) {
  main();
}

module.exports = { getTemplateByName, templates };
