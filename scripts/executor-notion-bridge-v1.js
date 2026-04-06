#!/usr/bin/env node

require("dotenv").config();
const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");
const {
  STATUS,
  STAGE,
  getTaskArtifactDir,
  normalizeTask,
  sanitizeText,
  writeJsonFile,
  updateNotionSyncState,
} = require("./reviews-approvals-workflow-v1");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_DIR = path.join(ROOT, "runtime", "queue");
const COMPLETED_DIR = path.join(ROOT, "runtime", "completed");
const EXECUTOR_LOG_PATH = path.join(ROOT, "runtime", "logs", "executor-manager-v1.log");

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
  const snapshot = buildOperatorSnapshot(task);
  const pointers = buildArtifactPointers(task);

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
  assignProperty(updates, properties, "Current State", snapshot.currentState);
  assignProperty(updates, properties, "Operator Snapshot", snapshot.operatorSnapshot);
  assignProperty(updates, properties, "Latest Log Path", pointers.latestLogPath);
  assignProperty(updates, properties, "Latest Artifact Dir", pointers.latestArtifactDir);
  assignProperty(updates, properties, "Latest Verification Report", pointers.latestVerificationReport);
  assignProperty(updates, properties, "Latest Failure Report", pointers.latestFailureReport);
  assignProperty(updates, properties, "Project Root", pointers.projectRoot);
  assignProperty(updates, properties, "Completion Summary", snapshot.completionSummary);
  assignProperty(updates, properties, "Current Executor", snapshot.currentExecutor);

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
      target[name] = clean ? { select: { name: clean } } : { select: null };
      return;
    case "status":
      target[name] = clean ? { status: { name: clean } } : { status: null };
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

async function replacePageBody(pageId, task) {
  const existingBlocks = await listBlocks(pageId);
  for (const block of existingBlocks) {
    if (block.archived || block.in_trash) {
      continue;
    }
    try {
      await notion.blocks.delete({ block_id: block.id });
    } catch (error) {
      const message = sanitizeText(error && error.message);
      if (/archived/i.test(message) || /can't edit block that is archived/i.test(message)) {
        continue;
      }
      throw error;
    }
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
  for (const section of buildCompactPageSections(task)) {
    const content = sanitizeText(section.content).trim();
    if (!content) {
      continue;
    }
    blocks.push(headingBlock(section.heading));
    const renderedBlocks = buildParagraphBlocks(content);
    blocks.push(...renderedBlocks);
  }
  return blocks;
}

function buildParagraphBlocks(content) {
  return splitStructuredText(content);
}

function buildCompactPageSections(task) {
  const snapshot = buildOperatorSnapshot(task);
  const pointers = buildArtifactPointers(task);
  const sections = [
    { heading: "Current State", content: snapshot.currentState },
    { heading: "What Changed", content: snapshot.whatChanged },
    { heading: "What Failed", content: snapshot.whatFailed },
    { heading: "What Happens Next", content: snapshot.whatHappensNext },
    { heading: "What I Need From You", content: snapshot.whatINeedFromYou },
  ];
  const artifactIndex = [
    pointers.projectRoot ? `- Project Root: ${pointers.projectRoot}` : "",
    pointers.latestLogPath ? `- Latest Log Path: ${pointers.latestLogPath}` : "",
    pointers.latestArtifactDir ? `- Latest Artifact Dir: ${pointers.latestArtifactDir}` : "",
    pointers.latestVerificationReport
      ? `- Latest Verification Report: ${pointers.latestVerificationReport}`
      : "",
    pointers.latestFailureReport ? `- Latest Failure Report: ${pointers.latestFailureReport}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (artifactIndex) {
    sections.push({ heading: "Artifact Index", content: artifactIndex });
  }

  return sections.filter((section) => sanitizeText(section.content).trim());
}

function buildOperatorSnapshot(task) {
  const currentState = trimForNotion(buildCurrentState(task), 500);
  const whatChanged = trimForNotion(buildWhatChanged(task), 700);
  const whatFailed = trimForNotion(buildWhatFailed(task), 500);
  const whatHappensNext = trimForNotion(buildWhatHappensNext(task), 500);
  const whatINeedFromYou = trimForNotion(buildWhatINeedFromYou(task), 500);
  const completionSummary =
    sanitizeText(task.status).trim() === STATUS.COMPLETED
      ? trimForNotion(sanitizeText(task.body.final_outcome).trim(), 500)
      : "";
  const currentExecutor = trimForNotion(getCurrentExecutor(task), 120);
  const operatorSnapshot = trimForNotion(
    [currentState, whatFailed, whatHappensNext, whatINeedFromYou].filter(Boolean).join("\n"),
    600,
  );

  return {
    currentState,
    whatChanged,
    whatFailed,
    whatHappensNext,
    whatINeedFromYou,
    operatorSnapshot,
    completionSummary,
    currentExecutor,
  };
}

function buildCurrentState(task) {
  const status = sanitizeText(task.status).trim() || STATUS.DRAFT;
  const stage = sanitizeText(task.workflow_stage).trim() || STAGE.TASK_INTAKE;
  const actor = getCurrentExecutor(task);
  const actorPart = actor ? ` Executor: ${actor}.` : "";
  if (status === STATUS.COMPLETED) {
    const outcome = sanitizeText(task.body.final_outcome).trim();
    return `${status} / ${stage}.${actorPart}${outcome ? ` ${outcome}` : ""}`.trim();
  }
  if ([STATUS.ESCALATED, STATUS.FAILED].includes(status)) {
    return `${status} / ${stage}.${actorPart} ${sanitizeText(task.last_failure_summary).trim() || "Operator review is required."}`.trim();
  }
  if ([STATUS.PENDING_REVIEW, STATUS.APPROVED, STATUS.PROCESSING, STATUS.RETRYING].includes(status)) {
    return `${status} / ${stage}.${actorPart}`.trim();
  }
  return `${status} / ${stage}.${actorPart}`.trim();
}

function buildWhatChanged(task) {
  const history = extractAttemptHistoryLines(task);
  if (history.length === 0) {
    const decision = sanitizeText(task.decision).trim();
    if (decision) {
      return `Latest operator decision: ${decision}.`;
    }
    return "No execution updates recorded yet.";
  }
  return history.slice(-3).map((line) => `- ${line}`).join("\n");
}

function buildWhatFailed(task) {
  const code = sanitizeText(task.last_failure_code).trim();
  const summary = sanitizeText(task.last_failure_summary).trim();
  const escalation = sanitizeText(task.escalation_reason).trim();
  if (!code && !summary && !escalation) {
    return sanitizeText(task.status).trim() === STATUS.COMPLETED
      ? "No active failure."
      : "No active failure recorded.";
  }
  return [code ? `Code: ${code}` : "", summary, escalation && escalation !== summary ? escalation : ""]
    .filter(Boolean)
    .join("\n");
}

function buildWhatHappensNext(task) {
  const status = sanitizeText(task.status).trim();
  const stage = sanitizeText(task.workflow_stage).trim();
  if (status === STATUS.PENDING_REVIEW) {
    return "Waiting for the current review gate to move forward.";
  }
  if (status === STATUS.ESCALATED || stage === STAGE.ESCALATED_TO_OPERATOR) {
    return "The manager is paused until operator review resumes the task.";
  }
  if (status === STATUS.PROCESSING || status === STATUS.RETRYING) {
    return "The manager continues the current stage and will either verify success or record the next concrete blocker.";
  }
  if (status === STATUS.COMPLETED) {
    return "No further action is scheduled for this task unless it is reset or a downstream task is generated.";
  }
  if (status === STATUS.DRAFT || stage === STAGE.TASK_INTAKE) {
    return "The manager will assemble the next prompt package when the task is picked up.";
  }
  return "The manager will resume from the current workflow stage on the next cycle.";
}

function buildWhatINeedFromYou(task) {
  const status = sanitizeText(task.status).trim();
  const stage = sanitizeText(task.workflow_stage).trim();
  if (status === STATUS.PENDING_REVIEW) {
    return "Review the task and set the Decision field.";
  }
  if (status === STATUS.ESCALATED || stage === STAGE.ESCALATED_TO_OPERATOR) {
    return "Review the failure summary, then approve, modify, or deny the task.";
  }
  if (status === STATUS.COMPLETED) {
    return "Nothing unless you want to reopen the task or inspect the artifacts.";
  }
  if (status === STATUS.DRAFT) {
    return "Nothing unless the task needs edits before the manager assembles the prompt package.";
  }
  return "Nothing unless the task stalls or the failure summary changes.";
}

function buildArtifactPointers(task) {
  const artifactDir = getTaskArtifactDir(task);
  const latestArtifactDir = fs.existsSync(artifactDir) ? artifactDir : "";
  const latestVerificationReport = resolveArtifactPath(task, "verification-report.json");
  const latestFailureReport =
    resolveArtifactPath(task, "failure-report.json") || resolveArtifactPath(task, "local-write-verification.stderr.txt");
  return {
    latestLogPath: EXECUTOR_LOG_PATH,
    latestArtifactDir,
    latestVerificationReport,
    latestFailureReport,
    projectRoot: inferProjectRoot(task),
  };
}

function resolveArtifactPath(task, fileName) {
  if (task.artifacts && task.artifacts[fileName] && fs.existsSync(task.artifacts[fileName])) {
    return task.artifacts[fileName];
  }
  const candidate = path.join(getTaskArtifactDir(task), fileName);
  return fs.existsSync(candidate) ? candidate : "";
}

function inferProjectRoot(task) {
  const candidates = [
    sanitizeText(task.project_root).trim(),
    sanitizeText(task.metadata && task.metadata.project_root).trim(),
    sanitizeText(task.body.final_outcome).trim(),
    sanitizeText(task.operator_notes || task.body.operator_notes).trim(),
    sanitizeText(task.trigger_reason).trim(),
  ]
    .flatMap(extractWindowsPaths)
    .filter(Boolean);

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (path.resolve(candidate).startsWith(ROOT)) {
      continue;
    }
    return candidate;
  }

  return "";
}

function extractWindowsPaths(text) {
  return (sanitizeText(text).match(/[A-Za-z]:\\[^\n\r"]+/g) || []).map((entry) => entry.trim());
}

function getCurrentExecutor(task) {
  const provider = sanitizeText(task.metadata && task.metadata.execution_provider).trim();
  if (provider) {
    return provider;
  }
  const actor = sanitizeText(task.last_failure_actor).trim();
  if (actor) {
    return actor;
  }
  return "";
}

function extractAttemptHistoryLines(task) {
  return sanitizeText(task.body.attempt_history)
    .split(/\r?\n/)
    .map((line) => line.replace(/^- \[[^\]]+\]\s*/, "").trim())
    .filter(Boolean);
}

function trimForNotion(text, maxLength) {
  const clean = sanitizeText(text).trim();
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
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
      rich_text: buildRichTextArray(text),
    },
  };
}

function bulletedListItemBlock(text) {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: buildRichTextArray(text),
    },
  };
}

function numberedListItemBlock(text) {
  return {
    object: "block",
    type: "numbered_list_item",
    numbered_list_item: {
      rich_text: buildRichTextArray(text),
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

function buildRichTextArray(text) {
  if (!text) {
    return [];
  }
  return splitText(text, 1800).map((chunk) => ({
    type: "text",
    text: { content: chunk },
  }));
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
