#!/usr/bin/env node

const { Client } = require("@notionhq/client");
const dotenvx = require("@dotenvx/dotenvx");

dotenvx.config({ quiet: true });
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  notionVersion: "2026-03-11",
});

const rootPageId = process.argv[2];
const maxDepth = Number(process.argv[3] || 3);

if (!rootPageId) {
  console.error("Usage: node scripts/list-notion-child-pages-v1.js <root-page-id> [max-depth]");
  process.exit(1);
}

async function fetchChildren(blockId) {
  const chunks = [];
  let cursor = undefined;
  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    chunks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return chunks;
}

async function walk(blockId, depth = 0) {
  if (depth > maxDepth) {
    return [];
  }

  const children = await fetchChildren(blockId);
  const discovered = [];

  for (const block of children) {
    const kind = block.type;
    if (kind === "child_page") {
      discovered.push({
        id: block.id,
        title: block.child_page.title,
        depth,
        type: "page",
      });
      discovered.push(...(await walk(block.id, depth + 1)));
    } else if (kind === "child_database") {
      discovered.push({
        id: block.id,
        title: block.child_database.title,
        depth,
        type: "database",
      });
    }
  }

  return discovered;
}

function formatEntry(entry) {
  const indent = " ".repeat(entry.depth * 2);
  return `${indent}- [${entry.type}] ${entry.title} (ID: ${entry.id})`;
}

async function main() {
  console.log(`Fetching children of ${rootPageId} ...`);
  const pages = await walk(rootPageId);
  if (!pages.length) {
    console.log("No child pages or databases found.");
    return;
  }
  console.log("Detected child nodes:");
  pages.forEach((entry) => console.log(formatEntry(entry)));
}

main().catch((error) => {
  console.error("Failed to list child blocks:", error.message);
  process.exit(1);
});
