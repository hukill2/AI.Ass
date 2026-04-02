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

async function run() {
  console.log('Fetching architecture root page...');
  const page = await fetchPage(ROOT_PAGE_ID);
  const title = getPageTitle(page) || 'untitled';
  const payload = {
    status: 'success',
    root_page_id: ROOT_PAGE_ID,
    title,
    url: page.url || '',
  };
  console.log(JSON.stringify(payload, null, 2));
}

run().catch((err) => {
  console.error('Failed to fetch architecture root page:', err.message);
  process.exit(1);
});
