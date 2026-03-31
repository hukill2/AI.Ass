// Usage: node scripts/pull-notion-architecture-pages-v1.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const fetch = globalThis.fetch;
if (!fetch) {
  console.error('Global fetch is unavailable. Use Node 18+ or another runtime that provides fetch.');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');

function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      return;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    if (!key) {
      return;
    }
    if (process.env[key] == null) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

const NOTION_KEY = process.env.NOTION_API_KEY;
const ROOT_PAGE_ID = process.env.NOTION_AI_OS_PAGE_ID;

if (!NOTION_KEY || !ROOT_PAGE_ID) {
  console.error('Missing Notion configuration. Set NOTION_API_KEY and NOTION_AI_OS_PAGE_ID before running this script.');
  process.exit(1);
}

const MIRROR_PATH = path.join(ROOT, 'mirror', 'architecture-pages.v1.json');
const API_BASE = 'https://api.notion.com/v1';
const HEADERS = {
  Authorization: `Bearer ${NOTION_KEY}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

function joinRichText(richTextArray = []) {
  return richTextArray.map((block) => block.plain_text).join('');
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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchPage(pageId) {
  return fetchJson(`${API_BASE}/pages/${pageId}`, { method: 'GET', headers: HEADERS });
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
    const json = await fetchJson(url.toString(), { method: 'GET', headers: HEADERS });
    blocks.push(...(json.results || []));
    cursor = json.has_more ? json.next_cursor : null;
  } while (cursor);
  return blocks;
}

function blockText(block) {
  const type = block.type;
  const data = block[type] || {};
  const rich = data.rich_text || data.text || [];
  const text = joinRichText(rich);
  if (!text) {
    return '';
  }
  if (type === 'paragraph') {
    return text;
  }
  if (type.startsWith('heading')) {
    return text;
  }
  if (type === 'bulleted_list_item') {
    return `- ${text}`;
  }
  if (type === 'numbered_list_item') {
    return `1. ${text}`;
  }
  if (type === 'quote') {
    return `> ${text}`;
  }
  if (type === 'callout') {
    return `🔹 ${text}`;
  }
  return text;
}

function normalizeBlocks(blocks) {
  const lines = [];
  blocks.forEach((block) => {
    const text = blockText(block);
    if (text) {
      lines.push(text);
    }
  });
  return lines.join('\n');
}

function runNpm(script) {
  const result = spawnSync('npm', ['run', script], { cwd: ROOT, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`${script} failed.`);
    process.exit(1);
  }
}

async function run() {
  console.log('Pulling architecture pages from Notion...');
  const rootPage = await fetchPage(ROOT_PAGE_ID);
  const rootTitle = getPageTitle(rootPage) || 'AI Assistant Operating System';
  const childBlocks = await fetchBlocks(ROOT_PAGE_ID);
  const childPages = childBlocks.filter((block) => block.type === 'child_page');

  const pages = [];
  const skipped = [];
  for (const block of childPages) {
    const pageId = block.id;
    try {
      const childPage = await fetchPage(pageId);
      const title = getPageTitle(childPage).trim();
      if (!title) {
        skipped.push({ pageId, reason: 'missing title' });
        console.warn(`Skipping page ${pageId} (missing title).`);
        continue;
      }
      const meta = {
        page_id: pageId,
        page_url: childPage.url || '',
        title,
        parent_title: rootTitle,
        created_at: childPage.created_time || '',
        updated_at: childPage.last_edited_time || '',
      };
      const blocks = await fetchBlocks(pageId);
      const content = normalizeBlocks(blocks);
      pages.push({ ...meta, content });
    } catch (err) {
      skipped.push({ pageId, reason: err.message });
      console.warn(`Skipped child page ${pageId}: ${err.message}`);
    }
  }

  const payload = {
    version: 'v1',
    root_title: rootTitle,
    pages,
  };
  fs.writeFileSync(MIRROR_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${pages.length} architecture page(s) to ${MIRROR_PATH}.`);
  if (skipped.length) {
    console.log('Skipped pages:');
    skipped.forEach((info) => console.log(`  - ${info.pageId}: ${info.reason}`));
  }

  runNpm('validate:architecture');
  runNpm('status:architecture');
}

run().catch((err) => {
  console.error('Failed to pull architecture pages:', err.message);
  process.exit(1);
});
