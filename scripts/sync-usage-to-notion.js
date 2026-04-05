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
const CONTENT_VERSION = 2;

const WINDOW_DEFS = [
  { key: "last_5h", label: "Last 5h", ms: 5 * 60 * 60 * 1000 },
  { key: "last_24h", label: "Last 24h", ms: 24 * 60 * 60 * 1000 },
  { key: "last_7d", label: "Last 7d", ms: 7 * 24 * 60 * 60 * 1000 },
];

const OPENAI_PRICING = {
  "gpt-5": { input: 1.25, output: 10.0, cached_input: 0.125 },
};

const PROVIDER_REFERENCE = {
  openai: {
    title: "OpenAI API",
    bullets: [
      "Observed in this OS: Architect/GPT planning traffic on gpt-5.",
      "Current active model pricing (gpt-5): $1.25 / 1M input tokens, $0.125 / 1M cached input tokens, $10.00 / 1M output tokens.",
      "Official API limits are tier-based RPM / TPM / batch-queue limits. They are not fixed 5-hour or weekly quota windows.",
      "GPT-5 rate-limit reference: Tier 1 500 RPM / 500k TPM; Tier 2 5k RPM / 1M TPM; Tier 3 5k RPM / 2M TPM; Tier 4 10k RPM / 4M TPM; Tier 5 15k RPM / 40M TPM.",
      "Operator windows used on this page: 5h, 24h, and 7d for human tracking only.",
      "Sources: https://developers.openai.com/api/docs/models/gpt-5 and https://openai.com/api/pricing/",
    ],
  },
  gemini: {
    title: "Gemini Developer API",
    bullets: [
      "No live Gemini API spend is currently recorded in this OS usage ledger.",
      "Official limits are model- and tier-specific across RPM, TPM, and RPD. RPD resets at midnight Pacific time.",
      "Gemini 3.1 Flash-Lite paid standard reference: $0.25 / 1M input tokens, $1.50 / 1M output tokens.",
      "Gemini 3.1 Pro Preview paid standard reference: $2.00 / 1M input tokens and $12.00 / 1M output tokens for prompts up to 200k tokens.",
      "Source: https://ai.google.dev/gemini-api/docs/rate-limits and https://ai.google.dev/gemini-api/docs/pricing",
    ],
  },
  local: {
    title: "Local Models / Unmetered Agents",
    bullets: [
      "Qwen local execution is not billed through this API ledger.",
      "Librarian validation is currently local workflow logic, not a tracked external API spend source.",
      "Claude is not currently emitting usage entries into this ledger.",
    ],
  },
};

async function syncUsage() {
  if (!fs.existsSync(LEDGER_PATH)) {
    return { updated: false, reason: "Ledger file does not exist." };
  }

  const ledgerRaw = fs.readFileSync(LEDGER_PATH, "utf8");
  const ledgerHash = crypto.createHash("sha1").update(ledgerRaw).digest("hex");
  const previousState = readSyncState();
  if (
    previousState.ledger_hash === ledgerHash &&
    Number(previousState.content_version || 0) === CONTENT_VERSION
  ) {
    return { updated: false, reason: "Ledger unchanged." };
  }

  const entries = parseLedgerEntries(ledgerRaw);
  const dashboard = buildDashboard(entries);
  const blocks = buildDashboardBlocks(dashboard);
  await replacePageContent(PAGE_ID, blocks);

  writeSyncState({
    ledger_hash: ledgerHash,
    synced_at: new Date().toISOString(),
    content_version: CONTENT_VERSION,
    totals: dashboard.totals,
    provider_totals: dashboard.providerTotals,
  });

  console.log(`[ACCOUNTANT] Notion Usage Dashboard Updated: ${dashboard.status}`);
  return { updated: true, status: dashboard.status };
}

function parseLedgerEntries(ledgerRaw) {
  return ledgerRaw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .map((entry) => normalizeEntry(entry))
    .filter((entry) => entry.timestampMs);
}

function normalizeEntry(entry) {
  const model = String(entry.model || "").trim();
  const timestampMs = Date.parse(entry.timestamp || "");
  const promptTokens = Number(entry.prompt_tokens || 0);
  const completionTokens = Number(entry.completion_tokens || 0);
  const totalTokens = Number(entry.total_tokens || promptTokens + completionTokens);
  const costUsd =
    entry.cost_usd != null ? Number(entry.cost_usd || 0) : estimateCostUsd(model, promptTokens, completionTokens);

  return {
    timestamp: entry.timestamp || "",
    timestampMs: Number.isFinite(timestampMs) ? timestampMs : 0,
    taskId: String(entry.taskId || "").trim(),
    model,
    provider: inferProvider(model),
    agent: inferAgent(entry, model),
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
  };
}

function estimateCostUsd(model, promptTokens, completionTokens) {
  const pricing = OPENAI_PRICING[String(model || "").trim()];
  if (!pricing) {
    return 0;
  }
  return (
    (promptTokens / 1_000_000) * pricing.input +
    (completionTokens / 1_000_000) * pricing.output
  );
}

function inferProvider(model) {
  const normalized = String(model || "").toLowerCase();
  if (normalized.startsWith("gpt-") || normalized.startsWith("o") || normalized.includes("openai")) {
    return "openai";
  }
  if (normalized.includes("gemini")) {
    return "gemini";
  }
  if (normalized.includes("claude")) {
    return "claude";
  }
  if (normalized.includes("qwen")) {
    return "local";
  }
  return "other";
}

function inferAgent(entry, model) {
  const normalizedModel = String(model || "").toLowerCase();
  const taskId = String(entry.taskId || "").toLowerCase();
  if (normalizedModel.startsWith("gpt-")) {
    return "Architect/GPT";
  }
  if (normalizedModel.includes("gemini") || taskId.includes("gemini")) {
    return "Gemini";
  }
  if (normalizedModel.includes("claude") || taskId.includes("claude")) {
    return "Claude";
  }
  if (normalizedModel.includes("qwen") || taskId.includes("qwen")) {
    return "Qwen (local)";
  }
  return "Unknown";
}

function buildDashboard(entries) {
  const totals = createWindowSummary(entries);
  const status = totals.total.costUsd >= 20 ? "CAPPED" : totals.total.costUsd >= 10 ? "ECONOMY" : "HEALTHY";

  const byAgent = new Map();
  const byProvider = new Map();

  for (const entry of entries) {
    const agentKey = `${entry.agent}__${entry.provider}__${entry.model}`;
    if (!byAgent.has(agentKey)) {
      byAgent.set(agentKey, {
        agent: entry.agent,
        provider: entry.provider,
        model: entry.model,
        summary: createWindowSummary([]),
      });
    }
    applyEntryToSummary(byAgent.get(agentKey).summary, entry);

    if (!byProvider.has(entry.provider)) {
      byProvider.set(entry.provider, createWindowSummary([]));
    }
    applyEntryToSummary(byProvider.get(entry.provider), entry);
  }

  const agentSummaries = Array.from(byAgent.values()).sort((a, b) => b.summary.total.costUsd - a.summary.total.costUsd);
  const providerTotals = {};
  for (const [provider, summary] of byProvider.entries()) {
    providerTotals[provider] = summary;
  }

  return {
    generatedAt: new Date().toISOString(),
    status,
    totals,
    agentSummaries,
    providerTotals,
  };
}

function createWindowSummary(entries) {
  const summary = {
    total: emptyMetricBucket(),
    windows: Object.fromEntries(WINDOW_DEFS.map((def) => [def.key, emptyMetricBucket()])),
  };
  for (const entry of entries) {
    applyEntryToSummary(summary, entry);
  }
  return summary;
}

function applyEntryToSummary(summary, entry) {
  const now = Date.now();
  incrementBucket(summary.total, entry);
  for (const def of WINDOW_DEFS) {
    if (entry.timestampMs >= now - def.ms) {
      incrementBucket(summary.windows[def.key], entry);
    }
  }
}

function emptyMetricBucket() {
  return {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  };
}

function incrementBucket(bucket, entry) {
  bucket.requests += 1;
  bucket.promptTokens += entry.promptTokens;
  bucket.completionTokens += entry.completionTokens;
  bucket.totalTokens += entry.totalTokens;
  bucket.costUsd += entry.costUsd || 0;
}

function buildDashboardBlocks(dashboard) {
  const blocks = [];

  blocks.push(heading1("API Costs"));
  blocks.push(paragraph(`Last updated: ${formatTimestamp(dashboard.generatedAt)}`));
  blocks.push(callout(statusEmoji(dashboard.status), [
    `Overall status: ${dashboard.status}`,
    `Total burn: ${formatUsd(dashboard.totals.total.costUsd)}`,
    `${WINDOW_DEFS[0].label}: ${formatUsd(dashboard.totals.windows.last_5h.costUsd)} | ${WINDOW_DEFS[1].label}: ${formatUsd(dashboard.totals.windows.last_24h.costUsd)} | ${WINDOW_DEFS[2].label}: ${formatUsd(dashboard.totals.windows.last_7d.costUsd)}`,
  ]));

  blocks.push(heading2("Observed Spend"));
  blocks.push(...buildMetricBullets(dashboard.totals, "Overall"));

  blocks.push(heading2("Observed Usage By Agent"));
  if (dashboard.agentSummaries.length === 0) {
    blocks.push(paragraph("No billed API usage has been recorded yet."));
  } else {
    for (const agent of dashboard.agentSummaries) {
      blocks.push(heading3(`${agent.agent} (${renderProviderLabel(agent.provider)}${agent.model ? ` · ${agent.model}` : ""})`));
      blocks.push(...buildMetricBullets(agent.summary));
    }
  }

  blocks.push(heading2("Provider Window Reference"));
  blocks.push(paragraph("These are the provider-enforced window mechanics or price references. The 5h / 24h / 7d windows above are internal operator windows for easier tracking."));
  for (const providerKey of ["openai", "gemini", "local"]) {
    const reference = PROVIDER_REFERENCE[providerKey];
    blocks.push(heading3(reference.title));
    for (const bullet of reference.bullets) {
      blocks.push(bulletItem(bullet));
    }
  }

  blocks.push(heading2("Reading Guide"));
  blocks.push(bulletItem("OpenAI API: think in RPM / TPM / batch queue by usage tier, not fixed 5-hour or weekly quotas."));
  blocks.push(bulletItem("Gemini Developer API: think in RPM / TPM / RPD, with daily resets at midnight Pacific."));
  blocks.push(bulletItem("Local agents such as Qwen do not show up as billed API spend unless a new ledger source is added."));

  return blocks;
}

function buildMetricBullets(summary, labelOverride = "") {
  const blocks = [];
  const totalLabel = labelOverride ? `${labelOverride} total` : "Total observed";
  blocks.push(bulletItem(`${totalLabel}: ${formatUsd(summary.total.costUsd)} across ${summary.total.requests} request(s) and ${formatTokens(summary.total.totalTokens)} total tokens.`));
  for (const def of WINDOW_DEFS) {
    const bucket = summary.windows[def.key];
    blocks.push(
      bulletItem(
        `${def.label}: ${formatUsd(bucket.costUsd)} | ${bucket.requests} request(s) | ${formatTokens(bucket.totalTokens)} total tokens (${formatTokens(bucket.promptTokens)} prompt / ${formatTokens(bucket.completionTokens)} completion).`,
      ),
    );
  }
  return blocks;
}

async function replacePageContent(pageId, blocks) {
  const existing = await listTopLevelBlocks(pageId);
  for (const block of existing) {
    await notion.blocks.delete({ block_id: block.id });
  }

  const chunks = chunk(blocks, 100);
  for (const children of chunks) {
    await notion.blocks.children.append({
      block_id: pageId,
      children,
    });
  }
}

async function listTopLevelBlocks(blockId) {
  const results = [];
  let cursor = undefined;
  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...(response.results || []));
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  return results;
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

function chunk(array, size) {
  const chunks = [];
  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }
  return chunks;
}

function heading1(text) {
  return {
    object: "block",
    type: "heading_1",
    heading_1: {
      rich_text: [{ type: "text", text: { content: text } }],
    },
  };
}

function heading2(text) {
  return {
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [{ type: "text", text: { content: text } }],
    },
  };
}

function heading3(text) {
  return {
    object: "block",
    type: "heading_3",
    heading_3: {
      rich_text: [{ type: "text", text: { content: text } }],
    },
  };
}

function paragraph(text) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: text } }],
    },
  };
}

function bulletItem(text) {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [{ type: "text", text: { content: text } }],
    },
  };
}

function callout(icon, lines) {
  return {
    object: "block",
    type: "callout",
    callout: {
      icon: { type: "emoji", emoji: icon },
      rich_text: [{ type: "text", text: { content: lines.join("\n") } }],
    },
  };
}

function formatUsd(value) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function formatTokens(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatTimestamp(value) {
  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusEmoji(status) {
  if (status === "CAPPED") {
    return "🔴";
  }
  if (status === "ECONOMY") {
    return "🟡";
  }
  return "🟢";
}

function renderProviderLabel(provider) {
  if (provider === "openai") {
    return "OpenAI";
  }
  if (provider === "gemini") {
    return "Gemini";
  }
  if (provider === "claude") {
    return "Claude";
  }
  if (provider === "local") {
    return "Local";
  }
  return "Other";
}

async function main() {
  await syncUsage();
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[ACCOUNTANT] Failed to sync usage to Notion:", error.message);
    process.exit(1);
  });
}

module.exports = {
  syncUsage,
  normalizeEntry,
  estimateCostUsd,
  buildDashboard,
};
