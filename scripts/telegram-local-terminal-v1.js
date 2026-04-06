#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const dotenvx = require("@dotenvx/dotenvx");
const { sanitizeText, writeJsonFile } = require("./reviews-approvals-workflow-v1");
const { ROOT, getAllowedRoots } = require("./telegram-codex-broker-v1");

dotenvx.config({ quiet: true });

const RUNTIME_DIR = path.join(ROOT, "runtime");
const LOG_DIR = path.join(RUNTIME_DIR, "logs");
const STATE_PATH = path.join(RUNTIME_DIR, "telegram-local-terminal-state.v1.json");
const BOT_LOG_PATH = path.join(LOG_DIR, "telegram-local-terminal.v1.log");
const POLL_MS = Number(process.env.TELEGRAM_POLL_MS || 3000);
const BOT_TOKEN = sanitizeText(process.env.LOCAL_TERMINAL_TELEGRAM_BOT_TOKEN).trim();
const ALLOWED_CHAT_ID = sanitizeText(
  process.env.LOCAL_TERMINAL_TELEGRAM_CHAT_ID ||
    process.env.CODEX_TERMINAL_TELEGRAM_CHAT_ID ||
    process.env.AIASSBOT_TELEGRAM_CHAT_ID,
).trim();
const MODEL = sanitizeText(process.env.TELEGRAM_LOCAL_MODEL || process.env.OLLAMA_MODEL || "deepseek-coder:6.7b").trim();
const MODEL_TIMEOUT_MS = Number(process.env.TELEGRAM_LOCAL_MODEL_TIMEOUT_MS || 90000);
const OLLAMA_BASE_URL = sanitizeText(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").trim().replace(/\/$/, "");
const HISTORY_LIMIT = 8;
const TELEGRAM_MESSAGE_LIMIT = 3900;
const DEFAULT_TAIL_LINES = 80;
const MAX_CONTEXT_CHARS = 18000;
const MAX_ARTIFACT_LINES = 180;
const MAX_LOG_BYTES = 64000;
const WRITE_REQUEST_PATTERN =
  /\b(edit|fix|patch|change|modify|write|create|implement|commit|delete|rename|replace|apply)\b/i;
const TASK_ID_PATTERN = /\b[a-z0-9]+(?:-[a-z0-9]+){2,}\b/i;
const WINDOWS_PATH_PATTERN = /[A-Za-z]:\\[^\r\n"'<>|?*]+/;

if (!BOT_TOKEN) {
  console.error("LOCAL_TERMINAL_TELEGRAM_BOT_TOKEN is required.");
  process.exit(1);
}

if (!ALLOWED_CHAT_ID) {
  console.error(
    "LOCAL_TERMINAL_TELEGRAM_CHAT_ID or a fallback terminal/intake chat id is required.",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(`[telegram-local-terminal] ${sanitizeText(error.stack || error.message)}`);
  process.exit(1);
});

async function main() {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  log(`Telegram local terminal bot started with model ${MODEL}.`);
  log(`Approved roots: ${getAllowedRoots().join(", ")}`);

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
    await sendMessage(chatId, buildHelpMessage());
    return;
  }

  if (text === "/reset") {
    session.history = [];
    session.updated_at = new Date().toISOString();
    await sendMessage(chatId, "Local chat history cleared for this chat.");
    return;
  }

  if (text === "/status") {
    const latestTask = loadLatestTask();
    await sendMessage(
      chatId,
      [
        "Telegram local terminal status",
        `Model: ${MODEL}`,
        `Stored turns: ${Math.floor(session.history.length / 2)}`,
        `Chat ID: ${chatId}`,
        `Approved roots: ${getAllowedRoots().join(", ")}`,
        latestTask ? `Latest task: ${formatTaskHeadline(latestTask)}` : "Latest task: none found",
      ].join("\n"),
    );
    return;
  }

  if (text.startsWith("/logs")) {
    const response = handleLogsCommand(text);
    for (const chunk of splitText(response, TELEGRAM_MESSAGE_LIMIT)) {
      await sendMessage(chatId, chunk);
    }
    return;
  }

  if (text.startsWith("/task")) {
    const response = handleTaskCommand(text);
    for (const chunk of splitText(response, TELEGRAM_MESSAGE_LIMIT)) {
      await sendMessage(chatId, chunk);
    }
    return;
  }

  if (text.startsWith("/tail")) {
    const response = handleTailCommand(text);
    for (const chunk of splitText(response, TELEGRAM_MESSAGE_LIMIT)) {
      await sendMessage(chatId, chunk);
    }
    return;
  }

  if (text.startsWith("/")) {
    await sendMessage(chatId, [`Unknown command: ${text}`, "", buildHelpMessage()].join("\n"));
    return;
  }

  if (WRITE_REQUEST_PATTERN.test(text)) {
    await sendMessage(
      chatId,
      [
        "This local-model bot is read-only.",
        "Use the Codex Telegram bot for edits, builds that need intervention, commits, or anything that should change files.",
      ].join("\n"),
    );
    return;
  }

  const answer = await answerQuestion(session, text);
  session.history.push({ role: "user", content: text }, { role: "assistant", content: answer });
  session.history = session.history.slice(-HISTORY_LIMIT * 2);
  session.updated_at = new Date().toISOString();

  for (const chunk of splitText(answer, TELEGRAM_MESSAGE_LIMIT)) {
    await sendMessage(chatId, chunk);
  }
}

function handleLogsCommand(text) {
  const parts = text.split(/\s+/).filter(Boolean);
  const alias = sanitizeText(parts[1] || "manager").trim().toLowerCase();
  const lines = Math.max(10, Math.min(Number(parts[2] || DEFAULT_TAIL_LINES), 200));
  const resolved = resolveLogAlias(alias);
  if (!resolved.ok) {
    return resolved.message;
  }
  return formatSnippet(`Log tail: ${resolved.path}`, tailLargeFile(resolved.path, lines));
}

function handleTaskCommand(text) {
  const raw = sanitizeText(text.replace(/^\/task\s*/i, "")).trim();
  const task = !raw || /^(latest|last|current)$/i.test(raw) ? loadLatestTask() : loadTaskByQuery(raw);
  if (!task) {
    return raw ? `No task matched "${raw}".` : "No task records were found.";
  }
  return buildTaskSummary(task);
}

function handleTailCommand(text) {
  const raw = sanitizeText(text.replace(/^\/tail\s*/i, "")).trim();
  if (!raw) {
    return "Usage: /tail <absolute path or log alias> [lines]";
  }

  const numericSuffix = raw.match(/\s+(\d{1,3})$/);
  const lines = numericSuffix ? Math.max(10, Math.min(Number(numericSuffix[1]), 200)) : DEFAULT_TAIL_LINES;
  const target = numericSuffix ? raw.slice(0, numericSuffix.index).trim() : raw;
  const alias = resolveLogAlias(target.toLowerCase());
  const filePath = alias.ok ? alias.path : resolveSafePath(target);
  if (!filePath) {
    return `Path or alias not found: ${target}`;
  }
  return formatSnippet(`Tail: ${filePath}`, tailLargeFile(filePath, lines));
}

async function answerQuestion(session, question) {
  const direct = buildDirectAnswer(question);
  if (direct) {
    return direct;
  }
  const context = gatherContext(question);
  const prompt = buildModelPrompt(session, question, context);
  const result = await runLocalModel(prompt);
  if (!result.ok) {
    const fallback = buildDeterministicFallback(question, context);
    return [
      `Local model call failed: ${result.error}`,
      "",
      fallback ? `Direct fallback:\n${fallback}` : "",
      "Use /logs manager or /task latest for a direct read-only answer, or switch to the Codex Telegram bot for a heavier investigation.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  return result.output;
}

function buildDirectAnswer(question) {
  const text = sanitizeText(question).trim();
  const lower = text.toLowerCase();
  const explicitTask = extractTaskId(text);
  const task =
    explicitTask ||
    /\b(latest task|last task|current task|action plan|gpt plan|architect plan)\b/i.test(text)
      ? explicitTask
        ? loadTaskByQuery(explicitTask)
        : loadLatestTask()
      : null;

  if (
    task &&
    /\b(what is|show|read|summarize).*(action plan)|\baction plan\b.*\b(drafted|approval|logs|task)\b/i.test(lower)
  ) {
    const artifactPath = task.artifacts?.["qwen-action-plan.md"];
    return buildArtifactReply(task, artifactPath, "Qwen Action Plan");
  }

  if (task && /\b(what is|show|read|summarize).*(gpt plan|architect plan)|\b(gpt plan|architect plan)\b/i.test(lower)) {
    const artifactPath = task.artifacts?.["gpt-plan.md"];
    return buildArtifactReply(task, artifactPath, "GPT Plan");
  }

  if (task && /\b(status|where are we at|what is ai\.?ass doing|latest task)\b/i.test(lower)) {
    return buildTaskSummary(task);
  }

  return "";
}

function buildArtifactReply(task, artifactPath, label) {
  const header = [
    `Task: ${sanitizeText(task.title || task.task_id || "unknown")}`,
    `Status: ${sanitizeText(task.status || "unknown")} / ${sanitizeText(task.workflow_stage || "unknown")}`,
  ];

  if (!artifactPath) {
    return [...header, `${label}: no artifact path recorded yet.`].join("\n");
  }

  if (!fs.existsSync(artifactPath)) {
    return [...header, `${label}: artifact path is recorded but the file is missing.`, artifactPath].join("\n");
  }

  return [
    ...header,
    `${label} Artifact: ${artifactPath}`,
    "",
    truncateBlock(readHeadLines(artifactPath, 160), 3200),
  ].join("\n");
}

function gatherContext(question) {
  const sections = [];
  const lower = question.toLowerCase();

  const explicitTask = extractTaskId(question);
  const latestTaskRequested = /\b(latest task|last task|current task|what is ai\.?ass doing)\b/i.test(question);
  const task = explicitTask ? loadTaskByQuery(explicitTask) : latestTaskRequested ? loadLatestTask() : null;
  if (task) {
    sections.push(formatSection("Task Summary", buildTaskSummary(task)));
    const artifactPath = selectArtifactPath(task, lower);
    if (artifactPath && fs.existsSync(artifactPath)) {
      sections.push(formatSection(`Artifact: ${path.basename(artifactPath)}`, readArtifactSnippet(artifactPath)));
    }
  }

  const explicitPath = extractWindowsPath(question);
  if (explicitPath) {
    const safePath = resolveSafePath(explicitPath);
    if (safePath) {
      sections.push(formatSection(`Requested Path: ${safePath}`, readPathSnippet(safePath, lower)));
    }
  }

  for (const alias of detectLogAliases(lower)) {
    const resolved = resolveLogAlias(alias);
    if (resolved.ok) {
      sections.push(formatSection(`Log Tail: ${alias}`, tailLargeFile(resolved.path, DEFAULT_TAIL_LINES)));
    }
  }

  if (sections.length === 0) {
    const latestTask = loadLatestTask();
    if (latestTask) {
      sections.push(formatSection("Latest Task Summary", buildTaskSummary(latestTask)));
    }
    const managerLog = resolveLogAlias("manager");
    if (managerLog.ok) {
      sections.push(formatSection("Manager Log Tail", tailLargeFile(managerLog.path, 60)));
    }
  }

  return trimJoinedSections(sections, MAX_CONTEXT_CHARS);
}

function buildModelPrompt(session, question, context) {
  const recentHistory = session.history
    .slice(-6)
    .map((entry) => `${entry.role === "assistant" ? "Assistant" : "User"}: ${sanitizeText(entry.content)}`)
    .join("\n");

  return [
    "You are the AI.Ass local Telegram assistant.",
    "You are read-only. You do not edit files, run writes, or claim to fix anything.",
    "Answer only from the supplied context.",
    "Be concise and operator-focused.",
    "Prefer this structure when it fits:",
    "Current State",
    "Why It Matters",
    "Next Step",
    "If the context is incomplete, say exactly what is unknown and name the file path or command to inspect next.",
    "",
    recentHistory ? `Recent chat:\n${recentHistory}\n` : "",
    `Question:\n${sanitizeText(question)}`,
    "",
    `Context:\n${context || "No context was found."}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function runLocalModel(prompt) {
  const apiResult = await runLocalModelViaApi(prompt);
  if (apiResult.ok) {
    return apiResult;
  }
  const cliResult = runLocalModelViaCli(prompt);
  if (cliResult.ok) {
    return cliResult;
  }

  return {
    ok: false,
    error: [apiResult.error, cliResult.error].filter(Boolean).join(" | ") || "Unknown local model failure.",
  };
}

async function runLocalModelViaApi(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `Ollama API ${response.status}: ${sanitizeText(await response.text())}`,
      };
    }

    const payload = await response.json();
    const output = sanitizeText(payload.response || "").trim();
    if (!output) {
      return { ok: false, error: "Ollama API returned no response text." };
    }
    return { ok: true, output };
  } catch (error) {
    if (error.name === "AbortError") {
      return { ok: false, error: `Timed out after ${MODEL_TIMEOUT_MS}ms while waiting for ${MODEL}.` };
    }
    return { ok: false, error: sanitizeText(error.message) };
  } finally {
    clearTimeout(timeout);
  }
}

function runLocalModelViaCli(prompt) {
  const result = spawnSync("ollama", ["run", MODEL], {
    cwd: ROOT,
    encoding: "utf8",
    input: prompt,
    timeout: MODEL_TIMEOUT_MS,
    windowsHide: true,
    env: {
      ...process.env,
      TERM: "dumb",
      NO_COLOR: "1",
    },
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      return { ok: false, error: "Ollama was not found on PATH." };
    }
    if (result.error.code === "ETIMEDOUT") {
      return { ok: false, error: `Timed out after ${MODEL_TIMEOUT_MS}ms while waiting for ${MODEL}.` };
    }
    return { ok: false, error: sanitizeText(result.error.message) };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      error: cleanCliNoise(result.stderr || result.stdout || `Ollama exited with status ${result.status}.`),
    };
  }

  const output = cleanCliNoise(result.stdout || "").trim();
  if (!output) {
    return { ok: false, error: "Ollama CLI returned no clean response text." };
  }
  return { ok: true, output };
}

function cleanCliNoise(value) {
  return sanitizeText(value || "")
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(/[\u001B\u009B][[\]()#;?]*(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~])/g, "")
    .replace(/[⠁-⣿]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDeterministicFallback(question, context) {
  const lower = question.toLowerCase();
  if (/action plan/.test(lower)) {
    const match = context.match(/## Artifact: qwen-action-plan\.md\s+([\s\S]*?)(?:\n## |\s*$)/);
    if (match && match[1]) {
      return truncateBlock(match[1].trim(), 1200);
    }
  }
  if (/gpt plan|architect/.test(lower)) {
    const match = context.match(/## Artifact: gpt-plan\.md\s+([\s\S]*?)(?:\n## |\s*$)/);
    if (match && match[1]) {
      return truncateBlock(match[1].trim(), 1200);
    }
  }
  const taskMatch = context.match(/## Task Summary\s+([\s\S]*?)(?:\n## |\s*$)/);
  if (taskMatch && taskMatch[1]) {
    return truncateBlock(taskMatch[1].trim(), 1200);
  }
  const lines = sanitizeText(context)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
  return lines.join("\n");
}

function buildHelpMessage() {
  return [
    "Local Telegram log bot ready.",
    "This bot is read-only and uses the local Ollama model for lightweight summaries.",
    "",
    "Commands:",
    "/help - show this command list",
    "/status - show model, chat, roots, and latest task",
    "/task latest - summarize the latest task",
    "/task <task-id> - summarize a specific task",
    "/logs manager [lines] - tail the manager log",
    "/logs codex [lines] - tail the Codex Telegram bot log",
    "/logs local [lines] - tail this local bot log",
    "/tail <absolute path or alias> [lines] - tail an approved file directly",
    "/reset - clear local chat history",
    "",
    "Use the Codex Telegram bot for edits, commits, or complex troubleshooting that should change files.",
  ].join("\n");
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

function getSession(state, chatId) {
  if (!state.sessions[chatId]) {
    state.sessions[chatId] = {
      history: [],
      updated_at: new Date().toISOString(),
    };
  }
  return state.sessions[chatId];
}

function resolveLogAlias(alias) {
  const logMap = {
    manager: path.join(LOG_DIR, "executor-manager-v1.log"),
    codex: path.join(LOG_DIR, "telegram-codex-terminal.v1.log"),
    local: BOT_LOG_PATH,
    notify: path.join(LOG_DIR, "telegram-notify-state.v1.json"),
    api: path.join(LOG_DIR, "api-usage.ndjson"),
  };
  const resolved = logMap[alias];
  if (!resolved || !fs.existsSync(resolved)) {
    return { ok: false, message: `Unknown or missing log alias: ${alias}` };
  }
  return { ok: true, path: resolved };
}

function extractTaskId(text) {
  const match = sanitizeText(text).match(TASK_ID_PATTERN);
  return match ? match[0] : "";
}

function extractWindowsPath(text) {
  const match = sanitizeText(text).match(WINDOWS_PATH_PATTERN);
  return match ? match[0].replace(/[.,;:]+$/, "") : "";
}

function loadTaskByQuery(query) {
  const needle = sanitizeText(query).trim().toLowerCase();
  const files = getTaskFiles();
  const matches = files.filter(({ task, filePath }) => {
    const id = sanitizeText(task.task_id || "").toLowerCase();
    const title = sanitizeText(task.title || "").toLowerCase();
    return id === needle || id.includes(needle) || title.includes(needle) || filePath.toLowerCase().includes(needle);
  });
  if (matches.length === 0) {
    return null;
  }
  matches.sort((left, right) => new Date(right.task.updated_at || 0) - new Date(left.task.updated_at || 0));
  return matches[0].task;
}

function loadLatestTask() {
  const files = getTaskFiles();
  if (files.length === 0) {
    return null;
  }
  files.sort((left, right) => new Date(right.task.updated_at || 0) - new Date(left.task.updated_at || 0));
  return files[0].task;
}

function getTaskFiles() {
  const taskDirs = [path.join(RUNTIME_DIR, "queue"), path.join(RUNTIME_DIR, "completed")];
  const items = [];
  for (const dir of taskDirs) {
    if (!fs.existsSync(dir)) {
      continue;
    }
    for (const entry of fs.readdirSync(dir)) {
      if (!/^task-.*\.json$/i.test(entry)) {
        continue;
      }
      const filePath = path.join(dir, entry);
      try {
        const task = JSON.parse(fs.readFileSync(filePath, "utf8"));
        items.push({ filePath, task });
      } catch (error) {
        // Skip malformed files.
      }
    }
  }
  return items;
}

function buildTaskSummary(task) {
  const lines = [
    `Task: ${sanitizeText(task.title || task.task_id || "unknown")}`,
    `Task ID: ${sanitizeText(task.task_id || "unknown")}`,
    `Status: ${sanitizeText(task.status || "unknown")} / ${sanitizeText(task.workflow_stage || "unknown")}`,
    `Approval Gate: ${sanitizeText(task.approval_gate || "none")}`,
    `Route Target: ${sanitizeText(task.route_target || "unknown")}`,
    `Updated: ${sanitizeText(task.updated_at || "unknown")}`,
  ];

  if (sanitizeText(task.last_failure_code || "").trim()) {
    lines.push(
      `Last Failure: ${sanitizeText(task.last_failure_actor || "unknown")} / ${sanitizeText(
        task.last_failure_code,
      )} / ${sanitizeText(task.last_failure_summary || "")}`.trim(),
    );
  } else {
    lines.push("Last Failure: none active");
  }

  if (sanitizeText(task.revised_instructions || "").trim()) {
    lines.push(`Revised Instructions: ${truncateInline(task.revised_instructions, 400)}`);
  }

  const attempts = extractAttemptHistory(task);
  if (attempts.length > 0) {
    lines.push("Recent History:");
    attempts.slice(-6).forEach((entry) => lines.push(`- ${entry}`));
  }

  if (task.artifacts && typeof task.artifacts === "object") {
    const artifactNames = Object.keys(task.artifacts);
    if (artifactNames.length > 0) {
      lines.push(`Artifacts: ${artifactNames.join(", ")}`);
    }
  }

  return lines.join("\n");
}

function extractAttemptHistory(task) {
  const raw = sanitizeText(task?.body?.attempt_history || "").trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean);
}

function selectArtifactPath(task, lowerQuestion) {
  if (!task || !task.artifacts) {
    return "";
  }
  const artifactNames = Object.keys(task.artifacts);
  if (/action plan/.test(lowerQuestion)) {
    return task.artifacts["qwen-action-plan.md"] || "";
  }
  if (/gpt plan|architect plan|plan drafted|web-specific replan/.test(lowerQuestion)) {
    return task.artifacts["gpt-plan.md"] || "";
  }
  if (/prompt package/.test(lowerQuestion)) {
    return task.artifacts["prompt-package.md"] || "";
  }
  if (/verification/.test(lowerQuestion)) {
    return task.artifacts["verification-report.json"] || "";
  }
  if (/failure|why.*fail|error report/.test(lowerQuestion)) {
    return task.artifacts["failure-report.json"] || findFirstArtifact(task, "failure");
  }
  if (/stderr|stacktrace|traceback/.test(lowerQuestion)) {
    return findFirstArtifact(task, "stderr");
  }
  if (/scope/.test(lowerQuestion)) {
    return findFirstArtifact(task, "scope");
  }
  return artifactNames.length === 1 ? task.artifacts[artifactNames[0]] : "";
}

function findFirstArtifact(task, needle) {
  const lowered = sanitizeText(needle).toLowerCase();
  const match = Object.entries(task.artifacts || {}).find(([name]) => name.toLowerCase().includes(lowered));
  return match ? match[1] : "";
}

function readArtifactSnippet(filePath) {
  if (!fs.existsSync(filePath)) {
    return `Artifact not found: ${filePath}`;
  }
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".log") {
    return tailLargeFile(filePath, DEFAULT_TAIL_LINES);
  }
  if (extension === ".json") {
    const raw = fs.readFileSync(filePath, "utf8");
    return truncateBlock(raw, 6000);
  }
  return readHeadLines(filePath, MAX_ARTIFACT_LINES);
}

function readPathSnippet(filePath, lowerQuestion) {
  if (/\.log$/i.test(filePath) || /\btail\b/.test(lowerQuestion)) {
    return tailLargeFile(filePath, DEFAULT_TAIL_LINES);
  }
  if (/\.json$/i.test(filePath)) {
    return truncateBlock(fs.readFileSync(filePath, "utf8"), 6000);
  }
  return readHeadLines(filePath, MAX_ARTIFACT_LINES);
}

function readHeadLines(filePath, lineCount) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .slice(0, lineCount)
    .join("\n");
}

function resolveSafePath(target) {
  const text = sanitizeText(target).trim();
  if (!text) {
    return "";
  }

  const alias = resolveLogAlias(text.toLowerCase());
  if (alias.ok) {
    return alias.path;
  }

  const candidate = path.resolve(text);
  const normalizedCandidate = path.resolve(candidate).toLowerCase();
  const allowed = getAllowedRoots().some((root) => {
    const normalizedRoot = path.resolve(root).toLowerCase();
    return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}\\`);
  });
  if (!allowed || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    return "";
  }
  return candidate;
}

function detectLogAliases(lowerQuestion) {
  const aliases = [];
  ["manager", "codex", "local", "notify", "api"].forEach((alias) => {
    if (new RegExp(`\\b${alias}\\b`, "i").test(lowerQuestion)) {
      aliases.push(alias);
    }
  });
  return aliases;
}

function tailLargeFile(filePath, lineCount) {
  const stat = fs.statSync(filePath);
  const readBytes = Math.min(stat.size, MAX_LOG_BYTES);
  const buffer = Buffer.alloc(readBytes);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, readBytes, Math.max(0, stat.size - readBytes));
  } finally {
    fs.closeSync(fd);
  }
  const lines = buffer
    .toString("utf8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  return lines.slice(-lineCount).join("\n");
}

function formatSection(title, content) {
  return `## ${title}\n${sanitizeText(content).trim()}`;
}

function formatSnippet(title, content) {
  return `${title}\n\n${sanitizeText(content).trim()}`;
}

function trimJoinedSections(sections, maxChars) {
  const kept = [];
  let total = 0;
  for (const section of sections) {
    if (!section) {
      continue;
    }
    const nextTotal = total + section.length + 2;
    if (nextTotal > maxChars && kept.length > 0) {
      break;
    }
    kept.push(section);
    total = nextTotal;
  }
  return kept.join("\n\n");
}

function truncateBlock(value, maxChars) {
  const text = sanitizeText(value || "");
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n... [truncated]`;
}

function truncateInline(value, maxChars) {
  const text = sanitizeText(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}...`;
}

function formatTaskHeadline(task) {
  return `${sanitizeText(task.task_id || "unknown")} (${sanitizeText(task.status || "unknown")} / ${sanitizeText(
    task.workflow_stage || "unknown",
  )})`;
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
    disable_web_page_preview: true,
  });
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
  console.log(`[telegram-local-terminal] ${line}`);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(BOT_LOG_PATH, `${line}\n`, "utf8");
}
