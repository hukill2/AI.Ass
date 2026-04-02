#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const mirrorPath = path.resolve(__dirname, '../docs/prompt-templates.md');

function exitWith(status, message) {
  if (status === 0) {
    console.log(message);
  } else {
    console.error(message);
  }
  process.exit(status);
}

if (!fs.existsSync(mirrorPath)) {
  exitWith(1, `Missing mirror file at ${mirrorPath}.`);
}

const content = fs.readFileSync(mirrorPath, 'utf-8');
const lines = content.split(/\r?\n/);
const metadataLine = lines.find((line) => line.toLowerCase().includes('last refreshed:'));
if (!metadataLine) {
  exitWith(1, 'Missing last refreshed metadata in prompt mirror.');
}

const dateText = metadataLine.replace(/> \\*\\*last refreshed:\\*\\*/i, '').trim();
const parsed = Date.parse(dateText);
if (Number.isNaN(parsed)) {
  exitWith(1, `Unparseable last refreshed date: "${dateText}".`);
}

exitWith(
  0,
  `Prompt mirror last refreshed on ${new Date(parsed).toISOString().split('T')[0]} (raw: ${dateText}).`
);
