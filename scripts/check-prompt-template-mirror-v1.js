#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const mirrorPath = path.resolve(__dirname, '../docs/prompt-templates.md');

function exitWith(status, message, structured = null) {
  if (status === 0) {
    console.log(message);
  } else {
    console.error(message);
  }
  if (structured) {
    console.log(JSON.stringify(structured));
  }
  process.exit(status);
}

if (!fs.existsSync(mirrorPath)) {
  exitWith(
    1,
    `Missing mirror file at ${mirrorPath}.`,
    {
      guard: 'check-prompt-template-mirror-v1',
      status: 'error',
      reason: 'missing_mirror',
      path: mirrorPath
    }
  );
}

const content = fs.readFileSync(mirrorPath, 'utf-8');
const lines = content.split(/\r?\n/);
const metadataLine = lines.find((line) => line.toLowerCase().includes('last refreshed:'));
if (!metadataLine) {
  exitWith(
    1,
    'Missing last refreshed metadata in prompt mirror.',
    {
      guard: 'check-prompt-template-mirror-v1',
      status: 'error',
      reason: 'missing_metadata'
    }
  );
}

const dateText = metadataLine.replace(/> \\*\\*last refreshed:\\*\\*/i, '').trim();
const parsed = Date.parse(dateText);
if (Number.isNaN(parsed)) {
  exitWith(
    1,
    `Unparseable last refreshed date: "${dateText}".`,
    {
      guard: 'check-prompt-template-mirror-v1',
      status: 'error',
      reason: 'invalid_date',
      value: dateText
    }
  );
}

let currentName = null;
let inCodeBlock = false;
let codeLines = [];
const templates = [];

lines.forEach((line) => {
  if (line.startsWith('### ')) {
    currentName = line.slice(4).trim();
    return;
  }

  if (line.trim() === '```') {
    if (inCodeBlock) {
      inCodeBlock = false;
      if (currentName) {
        templates.push({ name: currentName, body: [...codeLines] });
      }
      codeLines = [];
    } else {
      inCodeBlock = true;
    }
    return;
  }

  if (inCodeBlock) {
    codeLines.push(line);
  }
});

const placeholderOnly = templates.find((template) => {
  const significant = template.body
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return significant.length === 1 && /^<[^>\\s]+>$/.test(significant[0]);
});

if (placeholderOnly) {
  exitWith(
    1,
    `Template "${placeholderOnly.name}" contains only placeholder text; update or remove it before rerunning the guard.`,
    {
      guard: 'check-prompt-template-mirror-v1',
      status: 'error',
      reason: 'placeholder_only',
      template: placeholderOnly.name
    }
  );
}

exitWith(
  0,
  `Prompt mirror last refreshed on ${new Date(parsed).toISOString().split('T')[0]} (raw: ${dateText}).`,
  {
    guard: 'check-prompt-template-mirror-v1',
    status: 'success',
    lastRefreshed: new Date(parsed).toISOString().split('T')[0],
    rawTimestamp: dateText
  }
);
