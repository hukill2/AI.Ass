#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '..');

function loadEnv() {
  const envPath = path.join(BASE_DIR, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1);
    if (!key) continue;
    if (process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

loadEnv();

const NOTION_KEY = process.env.NOTION_API_KEY;
const ROOT_PAGE_ID = process.env.NOTION_AI_OS_PAGE_ID;

if (!NOTION_KEY || !ROOT_PAGE_ID) {
  console.error('Missing Notion configuration. Set NOTION_API_KEY and NOTION_AI_OS_PAGE_ID before running this script.');
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${NOTION_KEY}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};
const API_BASE = 'https://api.notion.com/v1';

const fetchFn = globalThis.fetch;
if (!fetchFn) {
  console.error('Global fetch is unavailable. Use Node 18+ or a runtime that exposes fetch.');
  process.exit(1);
}

function joinRichText(richText = []) {
  return richText.map((item) => item.plain_text || '').join('');
}

function getPageTitle(page) {
  const props = page.properties || {};
  for (const prop of Object.values(props)) {
    if (prop.type === 'title') {
      return joinRichText(prop.title);
    }
  }
  return '';
}

async function fetchPage(pageId) {
  const response = await fetchFn(`${API_BASE}/pages/${pageId}`, {
    method: 'GET',
    headers: HEADERS,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchBlocks(pageId) {
  const blocks = [];
  let cursor = null;
  do {
    const url = new URL(`${API_BASE}/blocks/${pageId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) {
      url.searchParams.set('start_cursor', cursor);
    }
    const response = await fetchFn(url.toString(), {
      method: 'GET',
      headers: HEADERS,
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    blocks.push(...(json.results || []));
    cursor = json.has_more ? json.next_cursor : null;
  } while (cursor);
  return blocks;
}

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--output=')) {
      args.output = arg.slice('--output='.length);
    } else if (arg === '-o') {
      if (i + 1 >= argv.length) {
        throw new Error('Missing value for -o');
      }
      args.output = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function collectChildren(parentId, parentLevel, maxLevel, parentEntryId, visited, result) {
  if (parentLevel >= maxLevel) {
    return;
  }
  const blocks = await fetchBlocks(parentId);
  const childPageBlocks = blocks.filter((block) => block.type === 'child_page');
  for (const block of childPageBlocks) {
    const childId = block.id;
    if (visited.has(childId)) {
      continue;
    }
    visited.add(childId);
    try {
      const childPage = await fetchPage(childId);
      const entry = {
        page_id: childId,
        title: getPageTitle(childPage) || '',
        url: childPage.url || '',
        status: 'fetched',
        level: parentLevel + 1,
        parent_id: parentEntryId,
      };
      result.push(entry);
      await collectChildren(childId, parentLevel + 1, maxLevel, childId, visited, result);
    } catch (err) {
      console.warn(`Failed to fetch child page ${childId}: ${err.message}`);
      result.push({
        page_id: childId,
        status: 'failed',
        error: err.message,
        level: parentLevel + 1,
        parent_id: parentEntryId,
      });
    }
  }
}

async function run() {
  console.log('Fetching architecture root page...');
  const page = await fetchPage(ROOT_PAGE_ID);
  const title = getPageTitle(page) || 'untitled';

  console.log('Enumerating child pages up to depth 2...');
  const childPages = [];
  const visited = new Set([ROOT_PAGE_ID]);
  await collectChildren(ROOT_PAGE_ID, 0, 2, ROOT_PAGE_ID, visited, childPages);

  const payload = {
    status: 'success',
    root_page_id: ROOT_PAGE_ID,
    title,
    url: page.url || '',
    child_count: childPages.length,
    child_pages: childPages,
    child_failures: childPages.filter((entry) => entry.status === 'failed'),
  };

  if (childPages.length === 0) {
    console.log('No architecture child pages were discovered.');
  }

  const payloadText = JSON.stringify(payload, null, 2);
  console.log(payloadText);

  if (args.output) {
    try {
      fs.writeFileSync(path.join(BASE_DIR, args.output), payloadText, 'utf8');
      console.log(`Wrote architecture snapshot to ${args.output}`);
    } catch (err) {
      console.error(`Failed to write snapshot to ${args.output}: ${err.message}`);
      process.exit(1);
    }
  }
}
const args = parseArgs();
run().catch((err) => {
  console.error('Failed to fetch architecture root page:', err.message);
  process.exit(1);
});
