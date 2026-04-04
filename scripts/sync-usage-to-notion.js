#!/usr/bin/env node

const { Client } = require("@notionhq/client");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const dotenvx = require("@dotenvx/dotenvx");

dotenvx.config({ quiet: true });

const notionToken = process.env.NOTION_API_KEY || process.env.NOTION_ACCESS_TOKEN;

if (!notionToken) {
  console.error("[ACCOUNTANT] Critical Error: No Notion token found in environment.");
  process.exit(1);
}

const notion = new Client({
  auth: notionToken,
  notionVersion: "2026-03-11",
});

const PAGE_ID = "3380f0280c2b807b9fd5d5d0dab1fb0b";
const LEDGER_PATH = path.join(__dirname, "..", "runtime", "logs", "api-usage.ndjson");
const STATE_PATH = path.join(__dirname, "..", "runtime", "logs", "api-usage-sync-state.json");

async function syncUsage() {
  if (!fs.existsSync(LEDGER_PATH)) {
    return;
  }

  const ledgerRaw = fs.readFileSync(LEDGER_PATH, "utf8");
  const ledgerHash = crypto.createHash("sha1").update(ledgerRaw).digest("hex");
  const previousState = readSyncState();
  if (
    previousState.ledger_hash === ledgerHash &&
    previousState.status_block_id &&
    previousState.cost_block_id
  ) {
    return;
  }

  const lines = ledgerRaw.split("\n").filter(Boolean);
  let totalCost = 0;
  let last5Hrs = 0;
  const fiveHrsAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);

  for (const line of lines) {
    const entry = JSON.parse(line);
    totalCost += entry.cost_usd || 0;
    if (new Date(entry.timestamp) > fiveHrsAgo) {
      last5Hrs += entry.cost_usd || 0;
    }
  }

  const status = totalCost >= 20 ? "CAPPED" : totalCost >= 10 ? "ECONOMY" : "HEALTHY";
  const statusEmoji =
    status === "CAPPED" ? "\u{1F534}" : status === "ECONOMY" ? "\u{1F7E1}" : "\u{1F7E2}";
  const statusText = `${statusEmoji} Status: ${status}`;
  const costText = `Total Burn: $${totalCost.toFixed(4)} | Last 5h: $${last5Hrs.toFixed(4)}`;

  const blockIds = await ensureDashboardBlocks(previousState, statusText, costText);

  writeSyncState({
    ...previousState,
    ledger_hash: ledgerHash,
    synced_at: new Date().toISOString(),
    total_cost: Number(totalCost.toFixed(4)),
    last_5hrs_cost: Number(last5Hrs.toFixed(4)),
    status,
    status_block_id: blockIds.status_block_id,
    cost_block_id: blockIds.cost_block_id,
    divider_block_id: blockIds.divider_block_id,
  });

  console.log(`Notion Usage Dashboard Updated: ${status}`);
}

function readSyncState() {
  try {
    if (!fs.existsSync(STATE_PATH)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeSyncState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function ensureDashboardBlocks(previousState, statusText, costText) {
  if (previousState.status_block_id && previousState.cost_block_id) {
    try {
      await notion.blocks.update({
        block_id: previousState.status_block_id,
        heading_1: {
          rich_text: [{ text: { content: statusText } }],
        },
      });
      await notion.blocks.update({
        block_id: previousState.cost_block_id,
        paragraph: {
          rich_text: [{ text: { content: costText } }],
        },
      });
      return {
        status_block_id: previousState.status_block_id,
        cost_block_id: previousState.cost_block_id,
        divider_block_id: previousState.divider_block_id || "",
      };
    } catch (error) {
      // Recreate the dashboard blocks if they were deleted or changed out-of-band.
    }
  }

  const response = await notion.blocks.children.append({
    block_id: PAGE_ID,
    position: { type: "start" },
    children: [
      {
        object: "block",
        type: "heading_1",
        heading_1: {
          rich_text: [{ text: { content: statusText } }],
        },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ text: { content: costText } }],
        },
      },
      { object: "block", type: "divider", divider: {} },
    ],
  });

  const results = response.results || [];
  return {
    status_block_id: results[0] ? results[0].id : "",
    cost_block_id: results[1] ? results[1].id : "",
    divider_block_id: results[2] ? results[2].id : "",
  };
}

syncUsage().catch((error) => {
  console.error("[ACCOUNTANT] Failed to sync usage to Notion:", error.message);
  process.exit(1);
});
