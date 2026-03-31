// Usage: node scripts/pull-notion-reviews-approvals-v1.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const fetch = globalThis.fetch;
if (!fetch) {
  console.error('Global fetch is unavailable. Run this script with Node 18+ or another runtime that provides fetch.');
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
const DATABASE_ID = process.env.NOTION_REVIEWS_DATABASE_ID;

if (!NOTION_KEY || !DATABASE_ID) {
  console.error('Missing Notion configuration. Make sure NOTION_API_KEY and NOTION_REVIEWS_DATABASE_ID are set.');
  process.exit(1);
}

const MIRROR_PATH = path.join(ROOT, 'mirror', 'reviews-approvals-source.v1.json');
const BUILD_SCRIPT = path.join(ROOT, 'scripts', 'build-reviews-approvals-mirror-v1.js');
const STATUS_SCRIPT = path.join(ROOT, 'scripts', 'sync-status-report-v1.js');

const API_BASE = 'https://api.notion.com/v1';
const HEADERS = {
  Authorization: `Bearer ${NOTION_KEY}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

const SECTION_MAP = {
  summary: 'summary',
  fullcontext: 'full_context',
  proposedaction: 'proposed_action',
  whythiswastriggered: 'why_this_was_triggered',
  riskassessment: 'risk_assessment',
  suggestedroute: 'suggested_route',
  affectedcomponents: 'affected_components',
  operatornotes: 'operator_notes',
  revisedinstructions: 'revised_instructions',
  finaloutcome: 'final_outcome',
};
const BODY_FIELDS = Object.values(SECTION_MAP);

function joinRichText(richTextArray = []) {
  return richTextArray.map((block) => block.plain_text).join('');
}

function textFromProperty(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title':
      return joinRichText(prop.title);
    case 'rich_text':
      return joinRichText(prop.rich_text);
    case 'url':
      return prop.url || '';
    case 'number':
      return prop.number != null ? String(prop.number) : '';
    case 'status':
      return prop.status ? prop.status.name : '';
    case 'date':
      return prop.date?.start || '';
    case 'people':
      return (prop.people || []).map((person) => person.name || '').join(', ');
    default:
      if (prop?.rich_text) {
        return joinRichText(prop.rich_text);
      }
      return '';
  }
}

function selectFromProperty(prop) {
  if (!prop) return null;
  if (prop.select) {
    return prop.select.name;
  }
  if (prop.multi_select && prop.multi_select.length) {
    return prop.multi_select.map((item) => item.name).join(', ');
  }
  if (prop.status) {
    return prop.status.name;
  }
  return null;
}

function boolFromProperty(prop) {
  if (!prop) return false;
  if (prop.type === 'checkbox') {
    return Boolean(prop.checkbox);
  }
  return Boolean(prop.checkbox ?? false);
}

function normalizeHeading(text) {
  if (!text) return '';
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function blockPlainText(block) {
  const content = block[block.type];
  if (!content) return '';
  const richText = content.rich_text || content.text || content.caption || [];
  const text = joinRichText(richText);
  if (!text) return '';
  if (block.type === 'bulleted_list_item') {
    return `- ${text}`;
  }
  if (block.type === 'numbered_list_item') {
    return `${text}`;
  }
  if (block.type === 'to_do') {
    return `${content.checked ? '[x]' : '[ ]'} ${text}`;
  }
  return text;
}

async function queryDatabase() {
  const results = [];
  let cursor = null;
  do {
    const payload = { page_size: 100 };
    if (cursor) payload.start_cursor = cursor;
    const response = await fetch(`${API_BASE}/databases/${DATABASE_ID}/query`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Notion database query failed: ${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    results.push(...(json.results || []));
    cursor = json.next_cursor;
  } while (cursor);
  return results;
}

async function fetchBlocks(pageId) {
  const blocks = [];
  let cursor = null;
  do {
    const url = new URL(`${API_BASE}/blocks/${pageId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: HEADERS,
    });
    if (!response.ok) {
      throw new Error(`Notion blocks fetch failed for ${pageId}: ${response.status}`);
    }
    const json = await response.json();
    blocks.push(...(json.results || []));
    cursor = json.has_more ? json.next_cursor : null;
  } while (cursor);
  return blocks;
}

function initializeBody() {
  const result = {};
  BODY_FIELDS.forEach((field) => {
    result[field] = '';
  });
  return result;
}

function appendToBody(body, section, text) {
  if (!text) return;
  if (body[section]) {
    body[section] = `${body[section]}\n${text}`;
  } else {
    body[section] = text;
  }
}

async function run() {
  console.log('Querying Notion Reviews / Approvals database...');
  const pages = await queryDatabase();
  const emptySections = new Map();
  const items = [];
  let skippedTemplates = 0;
  for (const page of pages) {
    const properties = page.properties || {};
    const blocks = await fetchBlocks(page.id);
    const body = initializeBody();
    let currentSection = null;
    for (const block of blocks) {
      if (block.type && block.type.startsWith('heading')) {
        const headingText = blockPlainText(block);
        const normalized = normalizeHeading(headingText);
        if (SECTION_MAP[normalized]) {
          currentSection = SECTION_MAP[normalized];
        } else {
          currentSection = null;
        }
        continue;
      }
      const text = blockPlainText(block);
      if (currentSection && text) {
        appendToBody(body, currentSection, text);
      }
    }
    BODY_FIELDS.forEach((field) => {
      if (!body[field].trim()) {
        emptySections.set(field, (emptySections.get(field) || 0) + 1);
      }
    });
    const syncStatus = selectFromProperty(properties['Sync Status']);
    if (syncStatus === 'Ignore') {
      skippedTemplates++;
      continue;
    }
    const item = {
      task_id: textFromProperty(properties['Task ID']),
      title: textFromProperty(properties.Title) || '',
      status: selectFromProperty(properties.Status),
      decision: selectFromProperty(properties.Decision),
      risk: selectFromProperty(properties.Risk),
      route_target: selectFromProperty(properties['Route Target']),
      needs_approval: boolFromProperty(properties['Needs Approval']),
      execution_allowed: boolFromProperty(properties['Execution Allowed']),
      trigger_reason: textFromProperty(properties['Trigger Reason']),
      operator_notes: textFromProperty(properties['Operator Notes']),
      revised_instructions: textFromProperty(properties['Revised Instructions']),
      sync_status: syncStatus,
      notion_page_id: page.id,
      notion_url: page.url,
      created_at: page.created_time,
      updated_at: page.last_edited_time,
      body,
    };
    items.push(item);
  }

  const payload = { version: 'v1', items };
  fs.writeFileSync(MIRROR_PATH, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${items.length} review item(s) to ${MIRROR_PATH}`);
  if (skippedTemplates) {
    console.log(`Skipped ${skippedTemplates} review item(s) marked with Sync Status "Ignore".`);
  }
  if (emptySections.size) {
    console.log('Sections without content (body fields defaulted empty):');
    emptySections.forEach((count, section) => {
      console.log(`  - ${section} (${count} item(s))`);
    });
  }

  const build = spawnSync('node', [BUILD_SCRIPT], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (build.status !== 0) {
    console.error('Mirror build failed.');
    process.exit(1);
  }
  const status = spawnSync('node', [STATUS_SCRIPT], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (status.status !== 0) {
    console.error('Mirror status check failed.');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Failed to pull Reviews / Approvals:', err.message);
  process.exit(1);
});
