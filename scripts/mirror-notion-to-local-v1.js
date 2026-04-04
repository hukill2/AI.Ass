#!/usr/bin/env node

const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");
const dotenvx = require("@dotenvx/dotenvx");

dotenvx.config({ quiet: true });

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  notionVersion: "2022-06-28",
});
const QUEUE_DIR = path.join(__dirname, "..", "runtime", "queue");
const rawDbId =
  process.env.NOTION_REVIEWS_DATABASE_ID || process.env.REVIEWS_DATABASE_ID || "";
const REVIEWS_DB = rawDbId.trim().replace(/-/g, "");
const NOTION_QUERY_VERSION = "2022-06-28";

if (!REVIEWS_DB) {
  console.error("NOTION_REVIEWS_DATABASE_ID is required in .env.");
  process.exit(1);
}

async function main() {
  console.log("[MIRROR] Polling Notion reviews database...");
  console.log("[MIRROR] Using database ID:", JSON.stringify(REVIEWS_DB));
  let cursor;
  do {
    const response = await queryApprovedUnsyncedPages(cursor);

    for (const page of response.results) {
      const syncStatus = getPropValue(page.properties || {}, "Sync Status");
      if (syncStatus === "Synced" || syncStatus === "Ignore") {
        continue;
      }

      const task = mapNotionToTaskJson(page);
      if (!task.task_id) {
        console.warn("[MIRROR] Skipping page without task_id:", page.id);
        continue;
      }
      const filePath = path.join(
        QUEUE_DIR,
        `task-${sanitize(task.task_id)}.json`,
      );
      fs.mkdirSync(QUEUE_DIR, { recursive: true });
      fs.writeFileSync(filePath, `${JSON.stringify(task, null, 2)}\n`, "utf8");
      await notion.pages.update({
        page_id: page.id,
        properties: { "Sync Status": { select: { name: "Synced" } } },
      });
      console.log(`[MIRROR] Captured task: ${task.title} (${task.task_id})`);
    }

    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

  console.log("[MIRROR] Poll complete.");
}

function mapNotionToTaskJson(page) {
  const props = page.properties || {};
  return {
    task_id: getPropValue(props, "Task ID"),
    title: getPropValue(props, "Name") || getPropValue(props, "Title"),
    status: getPropValue(props, "Status"),
    route_target: getPropValue(props, "Route Target"),
    decision: getPropValue(props, "Decision"),
    risk: getPropValue(props, "Risk"),
    needs_approval: getPropCheckbox(props, "Needs Approval"),
    execution_allowed: getPropCheckbox(props, "Execution Allowed"),
    trigger_reason: getPropValue(props, "Trigger Reason"),
    operator_notes: getPropValue(props, "Operator Notes"),
    revised_instructions: getPropValue(props, "Revised Instructions"),
    priority: getPropValue(props, "Priority"),
    metadata: {
      page_id: page.id,
      project: getPropValue(props, "Project") || "OS-V1",
      owner: getPropValue(props, "Owner"),
    },
    body: {
      summary: getRichText(props, "Summary"),
      full_context: getRichText(props, "Full Context"),
      proposed_action: getRichText(props, "Proposed Action"),
      why_this_was_triggered: getRichText(props, "Why This Was Triggered"),
      risk_assessment: getRichText(props, "Risk Assessment"),
      suggested_route: getRichText(props, "Suggested Route"),
      affected_components: getRichText(props, "Affected Components"),
      operator_notes: getRichText(props, "Operator Notes"),
      revised_instructions: getRichText(props, "Revised Instructions"),
      final_outcome: getRichText(props, "Final Outcome"),
    },
    notion_page_id: page.id,
    notion_url: page.url,
    created_at: page.created_time,
    updated_at: page.last_edited_time,
  };
}

function getPropValue(props, name) {
  const prop = props[name];
  if (!prop) return "";
  if (prop.type === "title") {
    return (prop.title[0] && prop.title[0].plain_text) || "";
  }
  if (prop.type === "rich_text") {
    return (prop.rich_text[0] && prop.rich_text[0].plain_text) || "";
  }
  if (prop.type === "select" || prop.type === "status") {
    return prop.select ? prop.select.name : "";
  }
  if (prop.type === "multi_select") {
    return prop.multi_select.map((item) => item.name).join(", ");
  }
  return prop[prop.type] || "";
}

function getPropCheckbox(props, name) {
  const prop = props[name];
  return prop && prop.type === "checkbox" ? prop.checkbox : false;
}

function getRichText(props, name) {
  const prop = props[name];
  if (!prop) return "";
  if (prop.type === "rich_text") {
    return prop.rich_text.map((item) => item.plain_text).join("");
  }
  return "";
}

function sanitize(value) {
  return String(value || "")
    .replace(/[^\w-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function queryApprovedUnsyncedPages(cursor) {
  const response = await fetch(
    `https://api.notion.com/v1/databases/${REVIEWS_DB}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        "Notion-Version": NOTION_QUERY_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start_cursor: cursor,
        page_size: 50,
        filter: {
          and: [{ property: "Status", select: { equals: "Approved" } }],
        },
      }),
    },
  );

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Query failed (${response.status}): ${payload}`);
  }

  return response.json();
}

main().catch((error) => {
  console.error("[MIRROR] Failed to poll Notion:", error.message);
  process.exit(1);
});
