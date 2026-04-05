#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const dotenvx = require("@dotenvx/dotenvx");
const {
  getSectionDefinitions,
  sanitizeText,
  writeJsonFile,
} = require("./reviews-approvals-workflow-v1");
const {
  createIntakeSession,
  getCurrentField,
  applyAnswer,
  skipCurrentField,
  listMissingRequiredFields,
  buildTaskFromIntake,
  formatSessionStatus,
  formatSessionReview,
  resolveFieldKey,
  getFieldDefinition,
} = require("./project-intake-workflow-v1");

dotenvx.config({ quiet: true });

const ROOT = path.resolve(__dirname, "..");
const RUNTIME_DIR = path.join(ROOT, "runtime");
const STATE_PATH = path.join(RUNTIME_DIR, "telegram-project-intake-state.v1.json");
const POLL_MS = Number(process.env.TELEGRAM_POLL_MS || 3000);
const BOT_TOKEN = sanitizeText(
  process.env.AIASSBOT_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN,
).trim();
const ALLOWED_CHAT_ID = sanitizeText(
  process.env.AIASSBOT_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID,
).trim();
const REVIEWS_DB = sanitizeText(
  process.env.NOTION_REVIEWS_DATABASE_ID || process.env.REVIEWS_DATABASE_ID || "",
).trim();
const NOTION_API_KEY = sanitizeText(process.env.NOTION_API_KEY).trim();

if (!BOT_TOKEN) {
  console.error(
    "AIASSBOT_TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN is required.",
  );
  process.exit(1);
}

if (!NOTION_API_KEY || !REVIEWS_DB) {
  console.error("NOTION_API_KEY and NOTION_REVIEWS_DATABASE_ID are required.");
  process.exit(1);
}

main().catch((error) => {
  console.error(`[telegram-intake] ${sanitizeText(error.stack || error.message)}`);
  process.exit(1);
});

async function main() {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  log("Telegram project intake bot started.");

  while (true) {
    try {
      await pollOnce();
    } catch (error) {
      log(`Poll failed: ${sanitizeText(error.message)}`, "ERROR");
    }
    await wait(POLL_MS);
  }
}

async function pollOnce() {
  const state = readState();
  try {
    const updates = await telegramApi("getUpdates", {
      offset: state.offset,
      timeout: 1,
      allowed_updates: ["message"],
    });

    for (const update of updates.result || []) {
      state.offset = Math.max(Number(state.offset || 0), Number(update.update_id || 0) + 1);
      try {
        await handleUpdate(state, update);
      } catch (error) {
        log(`Update handling failed: ${sanitizeText(error.message)}`, "ERROR");
      }
    }
  } finally {
    writeState(state);
  }
}

async function handleUpdate(state, update) {
  const message = update && update.message;
  const text = sanitizeText(message && message.text).trim();
  const chatId = String(message && message.chat && message.chat.id || "");
  if (!text || !chatId) {
    return;
  }

  if (ALLOWED_CHAT_ID && chatId !== ALLOWED_CHAT_ID) {
    return;
  }

  const session = state.sessions[chatId] || null;

  if (text === "/help" || text === "/start" || text === "/commands") {
    await sendMessage(chatId, buildHelpMessage());
    return;
  }

  if (text === "/cancel") {
    delete state.sessions[chatId];
    await sendMessage(chatId, "Project intake cancelled.");
    return;
  }

  if (text === "/status") {
    if (!session) {
      await sendMessage(chatId, "No active project intake. Send a new brief to start.");
      return;
    }
    await sendMessage(chatId, formatSessionStatus(session));
    return;
  }

  if (text === "/review") {
    if (!session) {
      await sendMessage(chatId, "No active project intake. Send a new brief to start.");
      return;
    }
    await sendMessage(chatId, formatSessionReview(session));
    return;
  }

  if (!session) {
    const nextSession = createIntakeSession(text, chatId);
    state.sessions[chatId] = nextSession;
    const field = getCurrentField(nextSession);
    await sendMessage(
      chatId,
      [
        "Project intake started.",
        "I will gather the planning brief, then file it into Reviews / Approvals.",
        "Use /skip for optional fields, /done when the required fields are complete, or /cancel to stop.",
        "",
        `Initial brief captured: ${text}`,
        "",
        field ? field.prompt : "No fields remaining.",
      ].join("\n"),
    );
    return;
  }

  if (text === "/skip") {
    const field = getCurrentField(session);
    if (!field) {
      await finalizeSession(state, chatId);
      return;
    }
    if (field.required) {
      await sendMessage(chatId, `Cannot skip required field: ${field.label}`);
      return;
    }
    skipCurrentField(session);
    const nextField = getCurrentField(session);
    await sendMessage(chatId, nextField ? nextField.prompt : "All fields collected. Send /done to file the intake.");
    return;
  }

  if (text.startsWith("/edit ")) {
    const rawField = text.slice(6).trim();
    const fieldKey = resolveFieldKey(rawField);
    const field = getFieldDefinition(fieldKey);
    if (!field) {
      await sendMessage(chatId, `Unknown field: ${rawField}`);
      return;
    }
    session.editing_field = field.key;
    session.updated_at = new Date().toISOString();
    await sendMessage(
      chatId,
      [`Editing field: ${field.label}`, field.prompt].join("\n"),
    );
    return;
  }

  if (text.startsWith("/set ")) {
    const payload = text.slice(5).trim();
    const separatorIndex = payload.indexOf(":");
    if (separatorIndex === -1) {
      await sendMessage(chatId, "Use /set <field>: <value>");
      return;
    }
    const rawField = payload.slice(0, separatorIndex).trim();
    const value = payload.slice(separatorIndex + 1).trim();
    const fieldKey = resolveFieldKey(rawField);
    const field = getFieldDefinition(fieldKey);
    if (!field) {
      await sendMessage(chatId, `Unknown field: ${rawField}`);
      return;
    }
    session.answers[field.key] = sanitizeText(value).trim();
    session.editing_field = "";
    session.updated_at = new Date().toISOString();
    await sendMessage(chatId, `${field.label} updated.`);
    return;
  }

  if (text === "/done") {
    await finalizeSession(state, chatId);
    return;
  }

  if (text.startsWith("/")) {
    await sendMessage(
      chatId,
      [`Unknown command: ${text}`, "", buildHelpMessage()].join("\n"),
    );
    return;
  }

  applyAnswer(session, text);
  const nextField = getCurrentField(session);
  if (nextField) {
    await sendMessage(chatId, nextField.prompt);
    return;
  }

  await sendMessage(
    chatId,
    "All fields collected. Send /done to file this intake into Reviews / Approvals, or /status to inspect progress.",
  );
}

async function finalizeSession(state, chatId) {
  const session = state.sessions[chatId];
  if (!session) {
    await sendMessage(chatId, "No active project intake.");
    return;
  }

  const missing = listMissingRequiredFields(session);
  if (missing.length > 0) {
    await sendMessage(
      chatId,
      `Required fields still missing: ${missing.join(", ")}\n\n${getCurrentField(session).prompt}`,
    );
    return;
  }

  const task = buildTaskFromIntake(session);
  let page;
  try {
    page = await createReviewTaskPage(task);
  } catch (error) {
    await sendMessage(
      chatId,
      `Failed to file intake into Reviews / Approvals: ${sanitizeText(error.message)}`,
    );
    return;
  }
  delete state.sessions[chatId];

  await sendMessage(
    chatId,
    [
      "Project intake filed into Reviews / Approvals.",
      `Task: ${task.title}`,
      `Task ID: ${task.task_id}`,
      `Status: ${task.status}`,
      `Workflow Stage: ${task.workflow_stage}`,
      `Review: ${page.url}`,
    ].join("\n"),
  );
}

async function createReviewTaskPage(task) {
  const dbSchema = await notionGet(`databases/${REVIEWS_DB}`);
  const payload = {
    parent: { database_id: REVIEWS_DB },
    properties: buildCreatePropertiesPayload(task, dbSchema.properties || {}),
    children: buildInitialPageBlocks(task),
  };

  const response = await notionApi("pages", payload);
  task.notion_page_id = response.id;
  task.notion_url = response.url;
  return response;
}

function buildInitialPageBlocks(task) {
  const sections = getSectionDefinitions();
  const children = [];
  for (const section of sections) {
    const content = sanitizeText(task.body[section.key]).trim();
    if (!content) {
      continue;
    }
    children.push(headingBlock(section.heading));
    for (const paragraph of splitParagraphs(content)) {
      children.push(paragraphBlock(paragraph));
    }
  }
  return children;
}

function headingBlock(text) {
  return {
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: buildRichText(sanitizeText(text)),
    },
  };
}

function paragraphBlock(text) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: buildRichText(sanitizeText(text)),
    },
  };
}

function splitParagraphs(content) {
  return sanitizeText(content)
    .split(/\r?\n\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function richText(text) {
  return buildRichText(text);
}

function buildRichText(text) {
  const clean = sanitizeText(text).trim();
  if (!clean) {
    return [];
  }
  return splitText(clean, 1800).map((chunk) => ({
    type: "text",
    text: { content: chunk },
  }));
}

async function telegramApi(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function sendMessage(chatId, text) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text: sanitizeText(text),
    disable_web_page_preview: false,
  });
}

async function notionApi(pathname, body) {
  const response = await fetch(`https://api.notion.com/v1/${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Notion ${pathname} failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function notionGet(pathname) {
  const response = await fetch(`https://api.notion.com/v1/${pathname}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Notion ${pathname} failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

function buildCreatePropertiesPayload(task, properties) {
  const updates = {};
  const titlePropertyName = properties.Title ? "Title" : properties.Name ? "Name" : null;

  if (titlePropertyName) {
    updates[titlePropertyName] = {
      title: richText(task.title || task.task_id),
    };
  }

  assignCreateProperty(updates, properties, "Task ID", task.task_id);
  assignCreateProperty(updates, properties, "Status", task.status);
  assignCreateProperty(updates, properties, "Route Target", task.route_target);
  assignCreateProperty(updates, properties, "Risk", task.risk);
  assignCreateProperty(updates, properties, "Needs Approval", task.needs_approval);
  assignCreateProperty(updates, properties, "Execution Allowed", task.execution_allowed);
  assignCreateProperty(updates, properties, "Trigger Reason", task.trigger_reason);
  assignCreateProperty(updates, properties, "Operator Notes", task.operator_notes);
  assignCreateProperty(updates, properties, "Revised Instructions", task.revised_instructions);
  assignCreateProperty(updates, properties, "Sync Status", task.sync_status);
  assignCreateProperty(updates, properties, "Workflow Stage", task.workflow_stage);
  assignCreateProperty(updates, properties, "Attempt Count", task.attempt_count);
  assignCreateProperty(updates, properties, "Stage Retry Count", task.stage_retry_count);
  assignCreateProperty(updates, properties, "Current Prompt Template", task.current_prompt_template);
  assignCreateProperty(updates, properties, "Approval Gate", task.approval_gate);

  return updates;
}

function assignCreateProperty(target, properties, name, value) {
  const prop = properties[name];
  if (!prop) {
    return;
  }
  const clean = sanitizeText(value).trim();
  switch (prop.type) {
    case "title":
      target[name] = { title: richText(clean) };
      return;
    case "rich_text":
      target[name] = { rich_text: richText(clean) };
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

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch (error) {
    return { version: "v1", offset: 0, sessions: {} };
  }
}

function writeState(state) {
  writeJsonFile(STATE_PATH, state);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitText(text, maxLength) {
  const value = sanitizeText(text);
  if (value.length <= maxLength) {
    return [value];
  }

  const chunks = [];
  let current = value;
  while (current.length > maxLength) {
    let cut = current.lastIndexOf("\n", maxLength);
    if (cut < maxLength * 0.6) {
      cut = current.lastIndexOf(" ", maxLength);
    }
    if (cut < maxLength * 0.4) {
      cut = maxLength;
    }
    chunks.push(current.slice(0, cut).trim());
    current = current.slice(cut).trim();
  }
  if (current) {
    chunks.push(current);
  }
  return chunks.filter(Boolean);
}

function log(message, level = "INFO") {
  console.log(`[telegram-intake] [${level}] ${message}`);
}

function buildHelpMessage() {
  return [
    "Project intake bot ready.",
    "Send a plain-language project or task brief to start.",
    "Commands:",
    "/help - show this command list",
    "/commands - show this command list",
    "/status - show current intake progress",
    "/review - show all current intake fields and values",
    "/edit <field> - reopen a field and answer it next",
    "/set <field>: <value> - overwrite a field directly",
    "/skip - skip the current optional field",
    "/done - file the intake into Reviews / Approvals if required fields are complete",
    "/cancel - discard the current intake",
  ].join("\n");
}
