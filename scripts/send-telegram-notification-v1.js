#!/usr/bin/env node

const dotenvx = require("@dotenvx/dotenvx");
const {
  sanitizeText,
  STATUS,
} = require("./reviews-approvals-workflow-v1");

dotenvx.config({ quiet: true });

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
