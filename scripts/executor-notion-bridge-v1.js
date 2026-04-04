#!/usr/bin/env node

require('dotenv').config();
const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const QUEUE_DIR = path.join(ROOT, 'runtime', 'queue');
const COMPLETED_DIR = path.join(ROOT, 'runtime', 'completed');

const notion = new Client({ auth: process.env.NOTION_API_KEY });

main().catch((error) => {
  console.error(`[COURIER] Fatal error: ${sanitizeText(error.message)}`);
  process.exit(1);
});

async function main() {
  const args = process.argv.slice(2);
  const taskId = readArg(args, '--task-id');
  const taskFileArg = readArg(args, '--task-file');
  const taskPath = resolveTaskPath({ taskId, taskFileArg });

  if (!taskPath) {
    console.error('Usage: node scripts/executor-notion-bridge-v1.js --task-id <id>');
    console.error('   or: node scripts/executor-notion-bridge-v1.js --task-file <path>');
    process.exit(1);
  }

  if (!process.env.NOTION_API_KEY) {
    throw new Error('NOTION_API_KEY is not set.');
  }

  if (!fs.existsSync(taskPath)) {
    throw new Error(`Task file not found: ${taskPath}`);
  }

  const taskData = parseJsonFile(taskPath);
  const safeTaskId = sanitizeText(taskData.task_id || taskId || path.basename(taskPath, '.json'));
  const pageId = sanitizeText(taskData.notion_page_id || '');
  const finalOutcome = sanitizeText(
    (taskData.body && taskData.body.final_outcome) || 'No outcome recorded.',
  );

  if (!pageId) {
    throw new Error(`Task ${safeTaskId} is missing notion_page_id.`);
  }

  console.log(`[COURIER] Delivering results for task ${safeTaskId} to Notion...`);

  await notion.pages.update({
    page_id: pageId,
    properties: {
      Status: {
        select: { name: 'Completed' },
      },
      'Sync Status': {
        select: { name: 'Synced' },
      },
    },
  });

  await notion.blocks.children.append({
    block_id: pageId,
    children: [
      {
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{ type: 'text', text: { content: 'Final Outcome' } }],
        },
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: finalOutcome,
              },
            },
          ],
        },
      },
    ],
  });

  taskData.status = 'Completed';
  taskData.sync_status = 'Synced';
  taskData.updated_at = new Date().toISOString();
  taskData.body = {
    ...(taskData.body || {}),
    final_outcome: finalOutcome,
  };

  fs.mkdirSync(COMPLETED_DIR, { recursive: true });
  writeJsonFile(taskPath, taskData);

  const completedPath = path.join(COMPLETED_DIR, path.basename(taskPath));
  if (path.resolve(taskPath) !== path.resolve(completedPath)) {
    if (fs.existsSync(completedPath)) {
      fs.unlinkSync(completedPath);
    }
    fs.renameSync(taskPath, completedPath);
  }

  console.log(
    `[COURIER] Success. Task ${safeTaskId} marked Completed in Notion and moved to runtime/completed.`,
  );
}

function resolveTaskPath({ taskId, taskFileArg }) {
  if (taskFileArg) {
    return path.resolve(ROOT, sanitizeText(taskFileArg));
  }
  if (taskId) {
    return path.join(QUEUE_DIR, `task-${sanitizeText(taskId)}.json`);
  }
  return null;
}

function readArg(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return '';
  }
  return args[index + 1] || '';
}

function parseJsonFile(filePath) {
  const text = readCleanText(filePath);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${filePath}: ${sanitizeText(error.message)}`);
  }
}

function readCleanText(filePath) {
  return sanitizeText(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, value) {
  const sanitized = sanitizeValue(value);
  fs.writeFileSync(filePath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
}

function sanitizeValue(value) {
  if (typeof value === 'string') {
    return sanitizeText(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)]),
    );
  }
  return value;
}

function sanitizeText(value) {
  return String(value ?? '')
    .replace(/\uFEFF/g, '')
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(
      /[\u001B\u009B][[\]()#;?]*(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~])/g,
      '',
    );
}
