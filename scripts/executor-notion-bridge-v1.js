#!/usr/bin/env node

require("dotenv").config();
const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");
const {
  STATUS,
  STAGE,
  getSectionDefinitions,
  normalizeTask,
  sanitizeText,
  writeJsonFile,
  updateNotionSyncState,
} = require("./reviews-approvals-workflow-v1");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_DIR = path.join(ROOT, "runtime", "queue");
const COMPLETED_DIR = path.join(ROOT, "runtime", "completed");

const notion = new Client({ auth: process.env.NOTION_API_KEY, notionVersion: "2026-03-11" });

async function main() {
  const args = process.argv.slice(2);
  const taskId = readArg(args, "--task-id");
  const taskFileArg = readArg(args, "--task-file");
  const taskPath = resolveTaskPath({ taskId, taskFileArg });

  if (!taskPath) {
    console.error("Usage: node scripts/executor-notion-bridge-v1.js --task-id <id>");
    console.error("   or: node scripts/executor-notion-bridge-v1.js --task-file <path>");
    process.exit(1);
  }

  if (!process.env.NOTION_API_KEY) {
    throw new Error("NOTION_API_KEY is not set.");
  }

  if (!fs.existsSync(taskPath)) {
    throw new Error(`Task file not found: ${taskPath}`);
  }

  const task = normalizeTask(JSON.parse(fs.readFileSync(taskPath, "utf8")));
  await syncTaskToNotion(task);
  writeJsonFile(taskPath, task);

  if (isTerminalCompletion(task.status)) {
    fs.mkdirSync(COMPLETED_DIR, { recursive: true });
    const completedPath = path.join(COMPLETED_DIR, path.basename(taskPath));
    if (path.resolve(completedPath) !== path.resolve(taskPath)) {
      if (fs.existsSync(completedPath)) {
        fs.unlinkSync(completedPath);
      }
      fs.renameSync(taskPath, completedPath);
    }
  }
}

async function syncTaskToNotion(task) {
  const pageId = sanitizeText(task.notion_page_id).trim();
  if (!pageId) {
    return { skipped: true, reason: "missing notion_page_id" };
  }

  const page = await notion.pages.retrieve({ page_id: pageId });
  const properties = buildPropertiesPayload(task, page.properties || {});

  if (Object.keys(properties).length > 0) {
    await notion.pages.update({
      page_id: pageId,
      properties,
    });
  }

  if (shouldSyncPageBody(task)) {
    await replacePageBody(pageId, task);
  }
  const refreshed = await notion.pages.retrieve({ page_id: pageId });
  task.updated_at = refreshed.last_edited_time || task.updated_at;
  updateNotionSyncState(pageId, refreshed.last_edited_time);

  return { skipped: false, updated_at: task.updated_at };
}

function shouldSyncPageBody(task) {
  const status = sanitizeText(task.status).trim();
  const workflowStage = sanitizeText(task.workflow_stage).trim();

  if (
    [
      STATUS.DRAFT,
      STATUS.NEEDS_EDIT,
      STATUS.PENDING_REVIEW,
      STATUS.ESCALATED,
      STATUS.FAILED,
      STATUS.COMPLETED,
      STATUS.DENIED,
      STATUS.ARCHIVED,
    ].includes(status)
  ) {
    return true;
  }

  if (workflowStage === STAGE.ESCALATED_TO_OPERATOR) {
    return true;
  }

  return false;
}

function buildPropertiesPayload(task, properties) {
  const updates = {};
  const titlePropertyName = properties.Title ? "Title" : properties.Name ? "Name" : null;

  if (titlePropertyName) {
    updates[titlePropertyName] = {
      title: buildRichTextArray(task.title || task.task_id),
    };
  }

  assignProperty(updates, properties, "Status", task.status);
  assignProperty(updates, properties, "Decision", task.decision);
  assignProperty(updates, properties, "Route Target", task.route_target);
  assignProperty(updates, properties, "Risk", task.risk);
  assignProperty(updates, properties, "Sync Status", task.sync_status);
  assignProperty(updates, properties, "Task ID", task.task_id);
  assignProperty(updates, properties, "Trigger Reason", task.trigger_reason);
  assignProperty(updates, properties, "Operator Notes", task.operator_notes || task.body.operator_notes);
  assignProperty(updates, properties, "Revised Instructions", task.revised_instructions || task.body.revised_instructions);
  assignProperty(updates, properties, "Needs Approval", task.needs_approval);
  assignProperty(updates, properties, "Execution Allowed", task.execution_allowed);
  assignProperty(updates, properties, "Workflow Stage", task.workflow_stage);
  assignProperty(updates, properties, "Attempt Count", task.attempt_count);
  assignProperty(updates, properties, "Stage Retry Count", task.stage_retry_count);
  assignProperty(updates, properties, "Last Failure Stage", task.last_failure_stage);
  assignProperty(updates, properties, "Last Failure Actor", task.last_failure_actor);
  assignProperty(updates, properties, "Last Failure Code", task.last_failure_code);
  assignProperty(updates, properties, "Last Failure Summary", task.last_failure_summary);
  assignProperty(updates, properties, "Escalation Reason", task.escalation_reason);
  assignProperty(updates, properties, "Current Prompt Template", task.current_prompt_template);
  assignProperty(updates, properties, "Approval Gate", task.approval_gate);

  return updates;
}

function assignProperty(target, properties, name, value) {
  const prop = properties[name];
  if (!prop) {
    return;
  }
  const clean = sanitizeText(value);
  switch (prop.type) {
    case "title":
      target[name] = { title: buildRichTextArray(clean) };
      return;
    case "rich_text":
      target[name] = { rich_text: buildRichTextArray(clean) };
      return;
    case "select":
      if (clean) {
        target[name] = { select: { name: clean } };
      }
      return;
    case "status":
      if (clean) {
        target[name] = { status: { name: clean } };
      }
      return;
    case "checkbox":
      target[name] = { checkbox: Boolean(value) };
      return;
    case "number":
      if (Number.isFinite(Number(value))) {
        target[name] = { number: Number(value) };
      }
      return;
    case "url":
      target[name] = { url: clean || null };
      return;
    default:
      return;
  }
}

function buildRichTextArray(text) {
  if (!text) {
    return [];
  }
  return splitText(text, 1800).map((chunk) => ({
    type: "text",
    text: { content: chunk },
  }));
}

async function replacePageBody(pageId, task) {
  const existingBlocks = await listBlocks(pageId);
  for (const block of existingBlocks) {
    await notion.blocks.delete({ block_id: block.id });
  }

  const blocks = buildPageBlocks(task);
  for (const batch of chunkArray(blocks, 80)) {
    await notion.blocks.children.append({
      block_id: pageId,
      children: batch,
    });
  }
}

async function listBlocks(blockId) {
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

function buildPageBlocks(task) {
  const blocks = [];
  for (const section of getRenderableSections(task)) {
    const content = sanitizeText(task.body[section.key]).trim();
    if (!content) {
      continue;
    }
    blocks.push(headingBlock(section.heading));
    const renderedBlocks = renderSectionContent(section.key, content);
    blocks.push(...renderedBlocks);
  }
  return blocks;
}

function getRenderableSections(task) {
  const sections = getSectionDefinitions();
  if (!isCompletedPlanningTask(task)) {
    return sections;
  }

  const hidden = new Set([
    "machine_task_json",
    "prompt_template_selection",
    "prompt_package_for_approval",
    "librarian_validation_notes",
    "qwen_action_plan_for_approval",
  ]);

  return sections.filter((section) => !hidden.has(section.key));
}

function isCompletedPlanningTask(task) {
  return (
    sanitizeText(task.status).trim() === STATUS.COMPLETED &&
    (
      task.planning_only === true ||
      sanitizeText(task.current_prompt_template).trim() === "Project intake / planning prompt"
    )
  );
}

function renderSectionContent(sectionKey, content) {
  if (["machine_task_json", "failure_report"].includes(sectionKey)) {
    return buildCodeBlocks(content, sectionKey === "machine_task_json" ? "json" : "plain text");
  }
  if (
    ["prompt_package_for_approval", "gpt_plan", "qwen_action_plan_for_approval", "attempt_history", "librarian_validation_notes", "constraints_guardrails", "escalation_notes"].includes(
      sectionKey,
    )
  ) {
    return buildParagraphBlocks(content);
  }
  return buildParagraphBlocks(content);
}

function buildParagraphBlocks(content) {
  return splitStructuredText(content);
}

function splitStructuredText(content) {
  const lines = sanitizeText(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const blocks = [];
  for (const line of lines) {
    if (/^- /.test(line)) {
      blocks.push(bulletedListItemBlock(line.replace(/^- /, "")));
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      blocks.push(numberedListItemBlock(line.replace(/^\d+[.)]\s+/, "")));
      continue;
    }
    blocks.push(paragraphBlock(line));
  }
  return blocks;
}

function buildCodeBlocks(content, language) {
  return splitText(content, 1800).map((chunk) => ({
    object: "block",
    type: "code",
    code: {
      language,
      rich_text: [
        {
          type: "text",
          text: { content: chunk },
        },
      ],
    },
  }));
}

function headingBlock(text) {
  return {
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [
        {
          type: "text",
          text: { content: sanitizeText(text) },
        },
      ],
    },
  };
}

function paragraphBlock(text) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [
        {
          type: "text",
          text: { content: sanitizeText(text) },
        },
      ],
    },
  };
}

function bulletedListItemBlock(text) {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [
        {
          type: "text",
          text: { content: sanitizeText(text) },
        },
      ],
    },
  };
}

function numberedListItemBlock(text) {
  return {
    object: "block",
    type: "numbered_list_item",
    numbered_list_item: {
      rich_text: [
        {
          type: "text",
          text: { content: sanitizeText(text) },
        },
      ],
    },
  };
}

function splitTextByParagraph(text) {
  const paragraphs = sanitizeText(text)
    .split(/\r?\n\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) {
    return ["No content yet."];
  }
  return paragraphs.flatMap((paragraph) => splitText(paragraph, 1800));
}

function splitText(text, maxLength) {
  const value = sanitizeText(text);
  if (!value) {
    return [];
  }
  const chunks = [];
  let cursor = 0;
  while (cursor < value.length) {
    chunks.push(value.slice(cursor, cursor + maxLength));
    cursor += maxLength;
  }
  return chunks;
}

function chunkArray(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function isTerminalCompletion(status) {
  return [STATUS.COMPLETED, STATUS.DENIED, STATUS.ARCHIVED].includes(status);
}

function resolveTaskPath({ taskId, taskFileArg }) {
  if (taskFileArg) {
    return path.resolve(ROOT, sanitizeText(taskFileArg));
  }
  if (taskId) {
    return path.join(QUEUE_DIR, `task-${sanitizeText(taskId)}.json`);
  }
  return null;
}

function readArg(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return "";
  }
  return args[index + 1] || "";
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[COURIER] Fatal error: ${sanitizeText(error.message)}`);
    process.exit(1);
  });
}

module.exports = { syncTaskToNotion, shouldSyncPageBody };
