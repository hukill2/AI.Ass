// Usage: node scripts/pull-notion-reviews-approvals-v1.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  createEmptyBody,
  getBodySectionKey,
  getPropValue,
  getPropCheckbox,
  normalizeRouteTarget,
} = require('./reviews-approvals-workflow-v1');

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

const BODY_FIELDS = Object.keys(createEmptyBody());
const REQUIRED_PROPERTY_KEYS = [
  'Task ID',
  'Title',
  'Status',
  'Decision',
  'Risk',
  'Route Target',
  'Needs Approval',
  'Execution Allowed',
  'Trigger Reason',
  'Operator Notes',
  'Revised Instructions',
  'Sync Status',
];

function findMissingProperties(properties = {}) {
  return REQUIRED_PROPERTY_KEYS.filter((key) => {
    if (key === 'Title') {
      return (
        !Object.prototype.hasOwnProperty.call(properties, 'Title') &&
        !Object.prototype.hasOwnProperty.call(properties, 'Name')
      );
    }
    return !Object.prototype.hasOwnProperty.call(properties, key);
  });
}

function findMissingPageMeta(page = {}) {
  const missing = [];
  if (!page.id) {
    missing.push('Page ID');
  }
  if (!page.url) {
    missing.push('Page URL');
  }
  if (!page.created_time) {
    missing.push('Created At');
  }
  if (!page.last_edited_time) {
    missing.push('Updated At');
  }
  return missing;
}

function joinRichText(richTextArray = []) {
  return richTextArray.map((block) => block.plain_text).join('');
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
  return createEmptyBody();
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
  let skippedIgnored = 0;
  let skippedIncomplete = 0;
  for (const page of pages) {
    const properties = page.properties || {};
    const blocks = await fetchBlocks(page.id);
    const body = initializeBody();
    let currentSection = null;
    for (const block of blocks) {
      if (block.type && block.type.startsWith('heading')) {
        const headingText = blockPlainText(block);
        const normalized = getBodySectionKey(headingText) || getBodySectionKey(normalizeHeading(headingText));
        if (normalized) {
          currentSection = normalized;
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
    const syncStatus = getPropValue(properties, 'Sync Status');
    if (syncStatus === 'Ignore') {
      skippedIgnored++;
      continue;
    }
    const missingProperties = findMissingProperties(properties);
    const missingPageMeta = findMissingPageMeta(page);
    if (missingProperties.length || missingPageMeta.length) {
      const reasons = [...missingProperties, ...missingPageMeta];
      const reference = page.id || page.url || 'unknown page';
      console.warn(
        `Skipping Reviews / Approvals page ${reference} because it's missing required data: ${reasons.join(', ')}`,
      );
      skippedIncomplete++;
      continue;
    }
    BODY_FIELDS.forEach((field) => {
      if (!body[field].trim()) {
        emptySections.set(field, (emptySections.get(field) || 0) + 1);
      }
    });
    const item = {
      task_id: getPropValue(properties, 'Task ID'),
      title: getPropValue(properties, 'Title') || getPropValue(properties, 'Name') || '',
      status: getPropValue(properties, 'Status'),
      decision: getPropValue(properties, 'Decision') || null,
      risk: getPropValue(properties, 'Risk'),
      route_target: normalizeRouteTarget(getPropValue(properties, 'Route Target')),
      needs_approval: getPropCheckbox(properties, 'Needs Approval'),
      execution_allowed: getPropCheckbox(properties, 'Execution Allowed'),
      trigger_reason: getPropValue(properties, 'Trigger Reason'),
      operator_notes: getPropValue(properties, 'Operator Notes'),
      revised_instructions: getPropValue(properties, 'Revised Instructions'),
      sync_status: syncStatus,
      notion_page_id: page.id,
      notion_url: page.url,
      created_at: page.created_time,
      updated_at: page.last_edited_time,
      workflow_stage: getPropValue(properties, 'Workflow Stage'),
      attempt_count: Number(getPropValue(properties, 'Attempt Count') || 1),
      stage_retry_count: Number(getPropValue(properties, 'Stage Retry Count') || 0),
      last_failure_stage: getPropValue(properties, 'Last Failure Stage'),
      last_failure_actor: getPropValue(properties, 'Last Failure Actor'),
      last_failure_code: getPropValue(properties, 'Last Failure Code'),
      last_failure_summary: getPropValue(properties, 'Last Failure Summary'),
      escalation_reason: getPropValue(properties, 'Escalation Reason'),
      current_prompt_template: getPropValue(properties, 'Current Prompt Template'),
      approval_gate: getPropValue(properties, 'Approval Gate') || null,
      artifacts: {},
      body,
    };
    items.push(item);
  }

  const payload = { version: 'v1', items };
  fs.writeFileSync(MIRROR_PATH, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${items.length} review item(s) to ${MIRROR_PATH}`);
  if (skippedIgnored) {
    console.log(`Skipped ${skippedIgnored} review item(s) marked with Sync Status "Ignore".`);
  }
  if (skippedIncomplete) {
    console.log(`Skipped ${skippedIncomplete} review item(s) due to missing required data.`);
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
