#!/usr/bin/env node

const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");
const dotenvx = require("@dotenvx/dotenvx");
const {
  createEmptyBody,
  getBodySectionKey,
  normalizeTask,
  readNotionSyncState,
  updateNotionSyncState,
  shouldQueueNotionPage,
  getPropValue,
  getPropCheckbox,
  sanitizeText,
} = require("./reviews-approvals-workflow-v1");

dotenvx.config({ quiet: true });

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  notionVersion: "2026-03-11",
});

const ROOT = path.resolve(__dirname, "..");
const QUEUE_DIR = path.join(ROOT, "runtime", "queue");
const COMPLETED_DIR = path.join(ROOT, "runtime", "completed");
const rawDbId =
  process.env.NOTION_REVIEWS_DATABASE_ID || process.env.REVIEWS_DATABASE_ID || "";
const REVIEWS_DB = sanitizeText(rawDbId).trim().replace(/-/g, "");

if (!REVIEWS_DB) {
  console.error("NOTION_REVIEWS_DATABASE_ID is required in .env.");
  process.exit(1);
}

async function main() {
  console.log("[MIRROR] Polling Notion reviews database...");
  const syncState = readNotionSyncState();
  let cursor = undefined;
  let captured = 0;

  do {
    const response = await queryReviewsDatabase(cursor);

    for (const page of response.results || []) {
      if (!shouldQueueNotionPage(page)) {
        continue;
      }
      const lastEdited = sanitizeText(page.last_edited_time);
      const fingerprint = buildPageFingerprint(page);
      const previous = syncState.pages && syncState.pages[page.id];
      if (
        previous &&
        previous.last_edited_time === lastEdited &&
        sanitizeText(previous.fingerprint) === fingerprint
      ) {
        continue;
      }

      const task = await mapNotionToTaskJson(page);
      if (!task.task_id) {
        console.warn("[MIRROR] Skipping page without task_id:", page.id);
        updateNotionSyncState(page.id, lastEdited, fingerprint);
        continue;
      }

      const filePath = path.join(QUEUE_DIR, `task-${sanitizeFileName(task.task_id)}.json`);
      const existingTask = readExistingTask(filePath, task.task_id);
      const mergedTask = mergeWithLocalCanonicalState(existingTask, task);
      fs.mkdirSync(QUEUE_DIR, { recursive: true });
      fs.writeFileSync(filePath, `${JSON.stringify(mergedTask, null, 2)}\n`, "utf8");
      updateNotionSyncState(page.id, lastEdited, fingerprint);
      captured += 1;
      console.log(
        `[MIRROR] Captured task: ${sanitizeText(mergedTask.title)} (${sanitizeText(mergedTask.task_id)})`,
      );
    }

    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  console.log(`[MIRROR] Poll complete. Captured ${captured} updated task(s).`);
}

async function queryReviewsDatabase(cursor) {
  const response = await fetch(
    `https://api.notion.com/v1/databases/${REVIEWS_DB}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        start_cursor: cursor,
        page_size: 50,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Query failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

async function mapNotionToTaskJson(page) {
  const props = page.properties || {};
  const blocks = await fetchBlocks(page.id);
  const body = createEmptyBody();
  let currentSection = null;

  for (const block of blocks) {
    if (block.type && block.type.startsWith("heading")) {
      const heading = extractBlockText(block);
      currentSection = getBodySectionKey(heading);
      continue;
    }
    if (!currentSection) {
      continue;
    }
    const text = extractBlockText(block);
    if (!text) {
      continue;
    }
    body[currentSection] = body[currentSection]
      ? `${body[currentSection]}\n${text}`
      : text;
  }

  return normalizeTask({
    task_id: getPropValue(props, "Task ID"),
    title: getPropValue(props, "Title") || getPropValue(props, "Name"),
    status: getPropValue(props, "Status"),
    route_target: getPropValue(props, "Route Target"),
    decision: getPropValue(props, "Decision") || null,
    risk: getPropValue(props, "Risk"),
    needs_approval: getPropCheckbox(props, "Needs Approval"),
    execution_allowed: getPropCheckbox(props, "Execution Allowed"),
    trigger_reason: getPropValue(props, "Trigger Reason"),
    operator_notes: getPropValue(props, "Operator Notes"),
    revised_instructions: getPropValue(props, "Revised Instructions"),
    sync_status: getPropValue(props, "Sync Status"),
    workflow_stage: getPropValue(props, "Workflow Stage"),
    attempt_count: Number(getPropValue(props, "Attempt Count") || 1),
    stage_retry_count: Number(getPropValue(props, "Stage Retry Count") || 0),
    last_failure_stage: getPropValue(props, "Last Failure Stage"),
    last_failure_actor: getPropValue(props, "Last Failure Actor"),
    last_failure_code: getPropValue(props, "Last Failure Code"),
    last_failure_summary: getPropValue(props, "Last Failure Summary"),
    escalation_reason: getPropValue(props, "Escalation Reason"),
    current_prompt_template: getPropValue(props, "Current Prompt Template"),
    approval_gate: getPropValue(props, "Approval Gate") || null,
    artifacts: {},
    metadata: {
      page_id: page.id,
      project: getPropValue(props, "Project") || process.env.DEFAULT_PROJECT_ID || "OS-V1",
      owner: getPropValue(props, "Owner"),
    },
    body,
    notion_page_id: page.id,
    notion_url: page.url,
    created_at: page.created_time,
    updated_at: page.last_edited_time,
  });
}

async function fetchBlocks(blockId) {
  const blocks = [];
  let cursor = undefined;
  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...(response.results || []));
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

function extractBlockText(block) {
  const content = block && block[block.type];
  if (!content) {
    return "";
  }
  const richText =
    content.rich_text || content.text || content.caption || [];
  const text = richText.map((entry) => entry.plain_text || "").join("");
  if (!text) {
    return "";
  }
  if (block.type === "bulleted_list_item") {
    return `- ${text}`;
  }
  if (block.type === "to_do") {
    return `${content.checked ? "[x]" : "[ ]"} ${text}`;
  }
  return text;
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildPageFingerprint(page) {
  const props = (page && page.properties) || {};
  const fields = [
    page && page.id,
    page && page.last_edited_time,
    getPropValue(props, "Task ID"),
    getPropValue(props, "Title") || getPropValue(props, "Name"),
    getPropValue(props, "Status"),
    getPropValue(props, "Decision"),
    getPropValue(props, "Sync Status"),
    getPropValue(props, "Workflow Stage"),
    getPropValue(props, "Approval Gate"),
    getPropValue(props, "Current Prompt Template"),
    getPropValue(props, "Operator Notes"),
    getPropValue(props, "Revised Instructions"),
    getPropValue(props, "Updated At"),
  ];
  return fields.map((value) => sanitizeText(value)).join("|");
}

function readExistingTask(queuePath, taskId) {
  const candidates = [
    queuePath,
    path.join(COMPLETED_DIR, `task-${sanitizeFileName(taskId)}.json`),
  ];

  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) {
      continue;
    }
    try {
      return normalizeTask(JSON.parse(fs.readFileSync(candidate, "utf8")));
    } catch (error) {
      console.warn("[MIRROR] Failed to read existing task state:", sanitizeText(error.message));
    }
  }

  return null;
}

function mergeWithLocalCanonicalState(existingTask, incomingTask) {
  if (!existingTask) {
    return incomingTask;
  }

  const merged = normalizeTask({
    ...existingTask,
    ...incomingTask,
    metadata: {
      ...(existingTask.metadata || {}),
      ...(incomingTask.metadata || {}),
    },
  });

  const mirrorBodyFromNotion = shouldMirrorBodyFromNotion(existingTask, incomingTask);
  merged.body = mirrorBodyFromNotion
    ? { ...(existingTask.body || createEmptyBody()), ...(incomingTask.body || {}) }
    : { ...(existingTask.body || createEmptyBody()) };

  if (
    !incomingTask.artifacts ||
    Object.keys(incomingTask.artifacts).length === 0
  ) {
    merged.artifacts = { ...(existingTask.artifacts || {}) };
  }

  if (!mirrorBodyFromNotion && sanitizeText(existingTask.body && existingTask.body.final_outcome).trim()) {
    merged.body.final_outcome = sanitizeText(existingTask.body.final_outcome);
  }

  merged.operator_notes = incomingTask.operator_notes || existingTask.operator_notes || "";
  merged.revised_instructions =
    incomingTask.revised_instructions || existingTask.revised_instructions || "";
  merged.body.operator_notes = merged.operator_notes;
  merged.body.revised_instructions = merged.revised_instructions;

  return normalizeTask(merged);
}

function shouldMirrorBodyFromNotion(existingTask, incomingTask) {
  if (isExecutionTask(existingTask) || isExecutionTask(incomingTask)) {
    return false;
  }

  return hasMeaningfulWorkflowBody(incomingTask.body);
}

function hasMeaningfulWorkflowBody(body) {
  if (!body || typeof body !== "object") {
    return false;
  }

  const workflowKeys = [
    "summary",
    "full_context",
    "proposed_action",
    "constraints_guardrails",
    "machine_task_json",
    "prompt_template_selection",
    "prompt_package_for_approval",
    "librarian_validation_notes",
    "gpt_plan",
    "qwen_action_plan_for_approval",
    "failure_report",
    "attempt_history",
    "escalation_notes",
    "final_outcome",
  ];

  return workflowKeys.some((key) => sanitizeText(body[key]).trim());
}

function isExecutionTask(task) {
  if (!task) {
    return false;
  }

  if (task.planning_only === true) {
    return false;
  }

  const template = sanitizeText(task.current_prompt_template).trim();
  if (template === "Project intake / planning prompt") {
    return false;
  }

  const trigger = sanitizeText(task.trigger_reason).toLowerCase();
  const taskId = sanitizeText(task.task_id).toLowerCase();
  return (
    sanitizeText(task.approval_gate).trim() === "action_plan" ||
    taskId.includes("-exec-") ||
    trigger.includes("approved planning backlog item")
  );
}

main().catch((error) => {
  console.error("[MIRROR] Failed to poll Notion:", sanitizeText(error.message));
  process.exit(1);
});
