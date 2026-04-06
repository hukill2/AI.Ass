#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const dotenvx = require("@dotenvx/dotenvx");
const { sanitizeText, writeJsonFile } = require("./reviews-approvals-workflow-v1");
const {
  ACTION_LOG_PATH,
  ROOT,
  getAllowedRoots,
  listFiles,
  readFileSegment,
  tailFile,
  executeCommand,
  queueWriteFile,
  queueReplaceInFile,
  queueRunCommand,
  queueGitCommit,
  describePendingPlan,
  executePendingPlan,
} = require("./telegram-codex-broker-v1");

dotenvx.config({ quiet: true });

const RUNTIME_DIR = path.join(ROOT, "runtime");
const STATE_PATH = path.join(RUNTIME_DIR, "telegram-codex-terminal-state.v1.json");
const LOG_DIR = path.join(RUNTIME_DIR, "logs");
const BOT_LOG_PATH = path.join(LOG_DIR, "telegram-codex-terminal.v1.log");
const POLL_MS = Number(process.env.TELEGRAM_POLL_MS || 3000);
const BOT_TOKEN = sanitizeText(process.env.CODEX_TERMINAL_TELEGRAM_BOT_TOKEN).trim();
const ALLOWED_CHAT_ID = sanitizeText(process.env.CODEX_TERMINAL_TELEGRAM_CHAT_ID).trim();
const OPENAI_API_KEY = sanitizeText(process.env.OPENAI_API_KEY).trim();
const MODEL = sanitizeText(process.env.CODEX_MODEL_ID || "gpt-5").trim();
const HISTORY_LIMIT = 16;
const TELEGRAM_MESSAGE_LIMIT = 3900;
const TOOL_LOOP_LIMIT = 10;
const REPEATED_TOOL_CALL_LIMIT = 3;

if (!BOT_TOKEN) {
  console.error("CODEX_TERMINAL_TELEGRAM_BOT_TOKEN is required.");
  process.exit(1);
}

if (!ALLOWED_CHAT_ID) {
  console.error("CODEX_TERMINAL_TELEGRAM_CHAT_ID is required.");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required for the Telegram Codex terminal bot.");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

main().catch((error) => {
  console.error(`[telegram-codex-terminal] ${sanitizeText(error.stack || error.message)}`);
  process.exit(1);
});

async function main() {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  log(`Telegram Codex terminal bot started with model ${MODEL}.`);
  log(`Approved roots: ${getAllowedRoots().join(", ")}`);
  log(`Audit log: ${ACTION_LOG_PATH}`);

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
  const chatId = String((message && message.chat && message.chat.id) || "");
  if (!text || !chatId) {
    return;
  }

  if (chatId !== ALLOWED_CHAT_ID) {
    await sendMessage(chatId, "This bot is locked to a different approved chat id.");
    return;
  }

  const session = getSession(state, chatId);

  if (text === "/start" || text === "/help" || text === "/commands") {
    await sendMessage(chatId, buildHelpMessage(session));
    return;
  }

  if (text === "/reset") {
    session.history = [];
    session.pending_plan = null;
    session.updated_at = new Date().toISOString();
    await sendMessage(chatId, "Conversation history and pending approval state cleared for this chat.");
    return;
  }

  if (text === "/status") {
    await sendMessage(
      chatId,
      [
        "Telegram Codex terminal status",
        `Model: ${MODEL}`,
        `Stored turns: ${Math.floor(session.history.length / 2)}`,
        `Pending plan: ${session.pending_plan ? session.pending_plan.id : "none"}`,
        `Chat ID: ${chatId}`,
        `Approved roots: ${getAllowedRoots().join(", ")}`,
      ].join("\n"),
    );
    return;
  }

  if (text === "/pending") {
    await sendMessage(chatId, describePendingPlan(session.pending_plan));
    return;
  }

  if (text === "/approve") {
    const outcome = executePendingPlan(session, {
      chatId,
      approvedBy: chatId,
    });
    session.updated_at = new Date().toISOString();
    for (const chunk of splitText(outcome.message, TELEGRAM_MESSAGE_LIMIT)) {
      await sendMessage(chatId, chunk);
    }
    return;
  }

  if (text === "/reject") {
    if (!session.pending_plan) {
      await sendMessage(chatId, "No pending actions to reject.");
      return;
    }
    const rejected = session.pending_plan.id;
    session.pending_plan = null;
    session.updated_at = new Date().toISOString();
    await sendMessage(chatId, `Cleared pending plan ${rejected}.`);
    return;
  }

  const userMessage = {
    role: "user",
    content: text,
  };

  const assistantReply = await generateReply(session, userMessage);
  session.history.push(userMessage, { role: "assistant", content: assistantReply });
  session.history = session.history.slice(-HISTORY_LIMIT * 2);
  session.updated_at = new Date().toISOString();

  for (const chunk of splitText(assistantReply, TELEGRAM_MESSAGE_LIMIT)) {
    await sendMessage(chatId, chunk);
  }
}

function getSession(state, chatId) {
  if (!state.sessions[chatId]) {
    state.sessions[chatId] = {
      history: [],
      pending_plan: null,
      updated_at: new Date().toISOString(),
    };
  }
  if (!Object.prototype.hasOwnProperty.call(state.sessions[chatId], "pending_plan")) {
    state.sessions[chatId].pending_plan = null;
  }
  return state.sessions[chatId];
}

async function generateReply(session, userMessage) {
  const messages = [
    { role: "system", content: buildSystemPrompt(session) },
    ...session.history,
    userMessage,
  ];
  const toolCallHistory = [];
  let lastToolResultSummary = "";

  for (let attempt = 0; attempt < TOOL_LOOP_LIMIT; attempt += 1) {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: buildTools(),
      tool_choice: "auto",
    });

    const choice = response.choices?.[0]?.message;
    if (!choice) {
      return "No response content was returned.";
    }

    if (choice.tool_calls && choice.tool_calls.length > 0) {
      const signatures = choice.tool_calls.map((toolCall) => buildToolCallSignature(toolCall));
      log(`Tool round ${attempt + 1}: ${signatures.join(" | ")}`);
      const repeatedSignature = detectRepeatedToolLoop(toolCallHistory, signatures);
      toolCallHistory.push(signatures.join(" | "));
      if (repeatedSignature) {
        log(`Repeated tool loop detected: ${repeatedSignature}`, "WARN");
        return forceFinalReply(messages, {
          reason: `Repeated tool loop detected for ${repeatedSignature}.`,
          lastToolResultSummary,
        });
      }

      messages.push({
        role: "assistant",
        content: choice.content || "",
        tool_calls: choice.tool_calls.map((toolCall) => ({
          id: toolCall.id,
          type: toolCall.type,
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          },
        })),
      });

      for (const toolCall of choice.tool_calls) {
        const toolResult = await handleToolCall(session, toolCall);
        lastToolResultSummary = summarizeToolResult(toolCall, toolResult);
        log(`Tool result ${buildToolCallSignature(toolCall)} => ${truncateForLog(lastToolResultSummary)}`);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }
      continue;
    }

    const content = sanitizeText(choice.content || "").trim();
    if (!content) {
      return session.pending_plan
        ? describePendingPlan(session.pending_plan)
        : "No response content was returned.";
    }
    return content;
  }

  log("Tool loop limit reached without final reply.", "WARN");
  return forceFinalReply(messages, {
    reason: `Tool loop limit (${TOOL_LOOP_LIMIT}) reached before a final answer.`,
    lastToolResultSummary,
    fallback: session.pending_plan
      ? describePendingPlan(session.pending_plan)
      : "The bot gathered context but hit its tool loop limit before a final answer.",
  });
}

async function handleToolCall(session, toolCall) {
  const toolName = sanitizeText(toolCall.function?.name).trim();
  const args = parseToolArguments(toolCall.function?.arguments);

  try {
    switch (toolName) {
      case "list_files":
        return listFiles(args);
      case "read_file":
        return readFileSegment(args);
      case "tail_file":
        return tailFile(args);
      case "run_readonly_command":
        return executeCommand({
          cwd: args.cwd,
          command: args.command,
          args: args.args,
          mode: "read",
        });
      case "request_write_file":
        return queueWriteFile(session, args);
      case "request_replace_in_file":
        return queueReplaceInFile(session, args);
      case "request_run_command":
        return queueRunCommand(session, args);
      case "request_git_commit":
        return queueGitCommit(session, args);
      case "show_pending_plan":
        return {
          pending: Boolean(session.pending_plan),
          description: describePendingPlan(session.pending_plan),
        };
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    return { ok: false, error: sanitizeText(error.message) };
  }
}

function parseToolArguments(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch (error) {
    return {};
  }
}

function buildSystemPrompt(session) {
  return [
    "You are the Codex Telegram terminal for AI Assistant OS.",
    "You can inspect files and run safe read-only commands immediately.",
    "You can also queue file writes, approved commands, and git commits for explicit operator approval.",
    "Read-only actions run now. Write actions never run immediately; they must be queued and later executed only after the human replies /approve.",
    "Use the provided tools instead of claiming you edited files or ran commands.",
    "Use absolute Windows paths inside these approved roots only:",
    getAllowedRoots().join(", "),
    "Blocked path segments include .git, node_modules, .next, dist, and build.",
    "Git commits are allowed only when the user explicitly wants a milestone commit or asks for commit help.",
    "If a pending plan already exists, do not queue a second unrelated plan unless the user clearly replaces it.",
    "When you queue actions, finish with a concise summary of what is waiting for approval.",
    "If the user only needs information, stay in read-only mode.",
    session.pending_plan
      ? `Current pending plan:\n${describePendingPlan(session.pending_plan)}`
      : "There is no pending plan right now.",
  ].join(" ");
}

function buildTools() {
  return [
    {
      type: "function",
      function: {
        name: "list_files",
        description: "List files under an approved root. Read-only and auto-executes.",
        parameters: {
          type: "object",
          properties: {
            root: { type: "string", description: "Absolute directory path inside an approved root." },
            pattern: { type: "string", description: "Optional substring filter.", default: "" },
            limit: { type: "integer", description: "Max number of files to return.", default: 200 },
          },
          required: ["root"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read a line range from a file in an approved root. Read-only and auto-executes.",
        parameters: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "Absolute file path inside an approved root." },
            start_line: { type: "integer", default: 1 },
            end_line: { type: "integer", default: 200 },
          },
          required: ["file_path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "tail_file",
        description: "Tail a file in an approved root. Read-only and auto-executes.",
        parameters: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "Absolute file path inside an approved root." },
            lines: { type: "integer", default: 80 },
          },
          required: ["file_path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "run_readonly_command",
        description:
          "Run a safe read-only or verification command such as git status, git diff, npm run build, npm run lint, npm test, or node --check. Auto-executes.",
        parameters: {
          type: "object",
          properties: {
            cwd: { type: "string", description: "Absolute working directory inside an approved root." },
            command: { type: "string", description: "Command name, for example git, npm, or node." },
            args: { type: "array", items: { type: "string" }, default: [] },
          },
          required: ["cwd", "command"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "request_write_file",
        description: "Queue a full file write for later /approve execution.",
        parameters: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "Absolute file path inside an approved root." },
            content: { type: "string", description: "Complete file content to write." },
            reason: { type: "string", description: "Short reason for the change.", default: "" },
          },
          required: ["file_path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "request_replace_in_file",
        description: "Queue a targeted search-and-replace edit for later /approve execution.",
        parameters: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "Absolute file path inside an approved root." },
            old_text: { type: "string", description: "Exact existing text to replace." },
            new_text: { type: "string", description: "Replacement text." },
            replace_all: { type: "boolean", default: false },
            reason: { type: "string", default: "" },
          },
          required: ["file_path", "old_text", "new_text"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "request_run_command",
        description: "Queue an approved command such as npm install or npm run build for later /approve execution.",
        parameters: {
          type: "object",
          properties: {
            cwd: { type: "string", description: "Absolute working directory inside an approved root." },
            command: { type: "string", description: "Command name, for example npm or git." },
            args: { type: "array", items: { type: "string" }, default: [] },
            reason: { type: "string", default: "" },
          },
          required: ["cwd", "command"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "request_git_commit",
        description:
          "Queue a git milestone commit for later /approve execution. Use only when the user explicitly wants a commit.",
        parameters: {
          type: "object",
          properties: {
            cwd: { type: "string", description: "Absolute repo path inside an approved root." },
            message: { type: "string", description: "Commit message." },
            files: {
              type: "array",
              items: { type: "string" },
              description: "Optional repo-relative file paths to stage before committing. If omitted, all changes are staged.",
              default: [],
            },
            reason: { type: "string", default: "" },
          },
          required: ["cwd", "message"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "show_pending_plan",
        description: "Show the currently queued plan waiting for /approve or /reject.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
    },
  ];
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

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch (error) {
    return { version: "v2", offset: 0, sessions: {} };
  }
}

function writeState(state) {
  writeJsonFile(STATE_PATH, state);
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message, level = "INFO") {
  const line = `[${new Date().toISOString()}] [${level}] ${sanitizeText(message)}`;
  console.log(`[telegram-codex-terminal] ${line}`);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(BOT_LOG_PATH, `${line}\n`, "utf8");
}

function buildHelpMessage(session) {
  return [
    "Codex terminal bot ready.",
    "Modes:",
    "- Phase 1: read-only inspection and safe verification commands auto-run.",
    "- Phase 2: file edits, approved commands, and milestone commits queue for /approve.",
    "",
    "Commands:",
    "/help - show this command list",
    "/commands - show this command list",
    "/status - show model, chat, pending plan, and approved roots",
    "/pending - show queued write/command/commit actions",
    "/approve - execute the queued plan",
    "/reject - clear the queued plan",
    "/reset - clear chat history and pending plan",
    "",
    `Pending plan: ${session.pending_plan ? session.pending_plan.id : "none"}`,
    `Approved roots: ${getAllowedRoots().join(", ")}`,
    `Audit log: ${ACTION_LOG_PATH}`,
  ].join("\n");
}

function buildToolCallSignature(toolCall) {
  const name = sanitizeText(toolCall.function?.name).trim() || "unknown_tool";
  const args = sanitizeText(toolCall.function?.arguments || "").trim().replace(/\s+/g, " ");
  return `${name}(${args.slice(0, 180)})`;
}

function detectRepeatedToolLoop(toolCallHistory, currentSignatures) {
  const current = currentSignatures.join(" | ");
  let repeatCount = 1;
  for (let index = toolCallHistory.length - 1; index >= 0; index -= 1) {
    if (toolCallHistory[index] !== current) {
      break;
    }
    repeatCount += 1;
  }
  return repeatCount >= REPEATED_TOOL_CALL_LIMIT ? current : "";
}

function summarizeToolResult(toolCall, toolResult) {
  const name = sanitizeText(toolCall.function?.name).trim();
  if (!toolResult || typeof toolResult !== "object") {
    return `${name}: non-object result`;
  }

  if (Object.prototype.hasOwnProperty.call(toolResult, "error")) {
    return `${name}: error=${sanitizeText(toolResult.error)}`;
  }

  if (name === "list_files") {
    return `${name}: ${toolResult.count || 0} files under ${toolResult.root || ""}`;
  }
  if (name === "read_file" || name === "tail_file") {
    return `${name}: ${toolResult.file_path || ""} lines ${toolResult.start_line || ""}-${toolResult.end_line || ""}`;
  }
  if (name === "run_readonly_command" || name === "request_run_command") {
    return `${name}: ${toolResult.command || ""} exit=${toolResult.exit_code ?? "queued"}`;
  }
  if (name === "request_write_file" || name === "request_replace_in_file") {
    return `${name}: queued ${toolResult.file_path || ""}`;
  }
  if (name === "request_git_commit") {
    return `${name}: queued commit in ${toolResult.cwd || ""}`;
  }
  if (name === "show_pending_plan") {
    return `${name}: pending=${String(toolResult.pending)}`;
  }

  return `${name}: ok`;
}

async function forceFinalReply(messages, options = {}) {
  const forcedMessages = [
    {
      role: "system",
      content: [
        "You must answer now without calling any tools.",
        "Use only the tool outputs already present in the conversation.",
        "Do not say you hit a tool limit unless you also explain the likely cause and the practical next step.",
        "If the last tool results are inconclusive, say exactly what is still unknown.",
      ].join(" "),
    },
    ...messages,
    {
      role: "user",
      content: [
        "Produce the final operator-facing reply now.",
        options.reason ? `Reason: ${sanitizeText(options.reason)}` : "",
        options.lastToolResultSummary
          ? `Last tool result summary: ${sanitizeText(options.lastToolResultSummary)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: forcedMessages,
    });
    const content = sanitizeText(response.choices?.[0]?.message?.content || "").trim();
    if (content) {
      return content;
    }
  } catch (error) {
    log(`Forced final reply failed: ${sanitizeText(error.message)}`, "WARN");
  }

  return (
    sanitizeText(options.fallback).trim() ||
    "The bot gathered context but could not produce a final synthesized reply. Check the Telegram bot log in runtime/logs/telegram-codex-terminal.v1.log."
  );
}

function truncateForLog(value, maxLength = 220) {
  const text = sanitizeText(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}
