#!/usr/bin/env node

const dotenvx = require("@dotenvx/dotenvx");
const fs = require("fs");
const path = require("path");
const {
  sanitizeText,
  STATUS,
} = require("./reviews-approvals-workflow-v1");

dotenvx.config({ quiet: true });

const ROOT = path.resolve(__dirname, "..");
const TELEGRAM_NOTIFY_STATE_PATH = path.join(
  ROOT,
  "runtime",
  "logs",
  "telegram-notify-state.v1.json",
);
const NOTIFY_THROTTLE_MS = 5 * 60 * 1000;

async function sendTelegramNotification(task, reasonOverride = "") {
  const token = sanitizeText(
    process.env.TELEGRAM_BOT_TOKEN || process.env.AIASSBOT_TELEGRAM_BOT_TOKEN,
  ).trim();
  const chatId = sanitizeText(
    process.env.TELEGRAM_CHAT_ID || process.env.AIASSBOT_TELEGRAM_CHAT_ID,
  ).trim();

  if (!token || !chatId) {
    return {
      sent: false,
      skipped: true,
      reason:
        "Missing TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID or AIASSBOT_TELEGRAM_BOT_TOKEN/AIASSBOT_TELEGRAM_CHAT_ID.",
    };
  }

  const reason =
    sanitizeText(reasonOverride).trim() ||
    sanitizeText(task.last_failure_summary).trim() ||
    defaultReasonForTask(task);
  const notificationKey = buildNotificationKey(task, reason);

  if (shouldThrottleNotification(notificationKey)) {
    return { sent: false, skipped: true, reason: "Notification throttled." };
  }

  const message = [
    `Task: ${sanitizeText(task.title || task.task_id)}`,
    `Task ID: ${sanitizeText(task.task_id)}`,
    `Stage: ${sanitizeText(task.workflow_stage)}`,
    task.last_failure_actor
      ? `Failing actor: ${sanitizeText(task.last_failure_actor)}`
      : null,
    `Reason: ${reason}`,
    task.notion_url ? `Review: ${sanitizeText(task.notion_url)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram notification failed: ${response.status} ${errorText}`);
  }

  recordNotification(notificationKey);

  return { sent: true, skipped: false, reason };
}

function defaultReasonForTask(task) {
  if (task.status === STATUS.PENDING_REVIEW) {
    return "Operator approval required.";
  }
  if (task.status === STATUS.ESCALATED || task.status === STATUS.FAILED) {
    return "Operator attention required.";
  }
  return "Workflow update requires attention.";
}

function buildNotificationKey(task, reason) {
  return [
    sanitizeText(task.task_id),
    sanitizeText(task.status),
    sanitizeText(task.workflow_stage),
    sanitizeText(reason),
  ].join("|");
}

function shouldThrottleNotification(key) {
  const state = readNotifyState();
  const entry = state[key];
  if (!entry || !entry.sent_at) {
    return false;
  }
  return Date.now() - new Date(entry.sent_at).getTime() < NOTIFY_THROTTLE_MS;
}

function recordNotification(key) {
  const state = readNotifyState();
  state[key] = { sent_at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(TELEGRAM_NOTIFY_STATE_PATH), { recursive: true });
  fs.writeFileSync(TELEGRAM_NOTIFY_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function readNotifyState() {
  if (!fs.existsSync(TELEGRAM_NOTIFY_STATE_PATH)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(TELEGRAM_NOTIFY_STATE_PATH, "utf8"));
  } catch (_error) {
    return {};
  }
}

async function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error("Usage: node scripts/send-telegram-notification-v1.js '<task-json>'");
    process.exit(1);
  }

  const task = JSON.parse(raw);
  const result = await sendTelegramNotification(task);
  if (result.skipped) {
    console.log(`[TELEGRAM] Skipped: ${result.reason}`);
    return;
  }
  console.log(`[TELEGRAM] Sent: ${result.reason}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[TELEGRAM] ${sanitizeText(error.message)}`);
    process.exit(1);
  });
}

module.exports = { sendTelegramNotification };
