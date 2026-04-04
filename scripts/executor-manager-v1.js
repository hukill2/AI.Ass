#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_DIR = path.join(ROOT, "runtime", "queue");
const COMPLETED_DIR = path.join(ROOT, "runtime", "completed");
const LOG_DIR = path.join(ROOT, "runtime", "logs");
const LOG_PATH = path.join(LOG_DIR, "executor-manager-v1.log");
const LIBRARIAN_SCRIPT = path.join(__dirname, "executor-librarian-v1.js");
const NOTION_BRIDGE_SCRIPT = path.join(__dirname, "executor-notion-bridge-v1.js");
const CODEX_SCRIPT = path.join(__dirname, "executor-codex-v1.js");
const USAGE_SYNC_SCRIPT = path.join(__dirname, "sync-usage-to-notion.js");
const MODEL_NAME = "qwen2.5-coder:7b";
const POLL_MS = 10_000;
const CHILD_TIMEOUT_MS = 120_000;
const OLLAMA_TIMEOUT_MS = 600_000;
const runOnce = process.argv.includes("--once");

main();

function main() {
  fs.mkdirSync(QUEUE_DIR, { recursive: true });
  fs.mkdirSync(COMPLETED_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });

  log(
    `Watching ${QUEUE_DIR} for task JSON files every ${POLL_MS / 1000} seconds.`,
  );
  runCycle();
}

function runCycle() {
  let activityCount = 0;
  try {
    activityCount = scanQueue();
  } catch (error) {
    log(
      `Manager cycle failed: ${sanitizeText(error.stack || error.message)}`,
      "ERROR",
    );
  }

  if (activityCount > 0 && fs.existsSync(USAGE_SYNC_SCRIPT)) {
    log("Syncing usage ledger to Notion...");
    runChildProcess(process.execPath, [USAGE_SYNC_SCRIPT], CHILD_TIMEOUT_MS);
  } else if (activityCount > 0) {
    log("Usage-sync script missing; skipping Notion update.", "WARN");
  }

  if (!runOnce) {
    setTimeout(runCycle, POLL_MS);
  }
}

function scanQueue() {
  const jsonFiles = listQueueJsonFiles();
  if (jsonFiles.length === 0) {
    log("No queued task JSON files found.");
    return 0;
  }

  let activityCount = 0;

  const missingPlans = jsonFiles.filter(
    (jsonPath) => !fs.existsSync(getPlanPath(jsonPath)),
  );
  if (missingPlans.length > 0) {
    invokeLibrarian(missingPlans);
    activityCount += missingPlans.length;
  }

  const refreshedJsonFiles = listQueueJsonFiles();
  for (const jsonPath of refreshedJsonFiles) {
    const planPath = getPlanPath(jsonPath);
    if (!fs.existsSync(planPath)) {
      continue;
    }
    try {
      processTask(jsonPath, planPath);
      activityCount += 1;
    } catch (error) {
      log(
        `Task processing failed for ${path.basename(jsonPath)}: ${sanitizeText(
          error.stack || error.message,
        )}`,
        "ERROR",
      );
    }
  }

  return activityCount;
}

function processTask(jsonPath, planPath) {
  const taskLabel = path.basename(jsonPath);
  log(`Executing ${taskLabel} with ${path.basename(planPath)}.`);

  let taskData = parseJsonFile(jsonPath);
  const planText = readCleanText(planPath).trim();

  if (!planText) {
    throw new Error(`Plan file is empty: ${planPath}`);
  }

  const alreadyExecuted =
    String(taskData.status || "").toLowerCase() === "completed" &&
    String(taskData.sync_status || "").toLowerCase() !== "synced" &&
    sanitizeText((taskData.body && taskData.body.final_outcome) || "");

  if (!alreadyExecuted) {
    const routeTarget = String(taskData.route_target || "local").toLowerCase();

    if (routeTarget === "codex") {
      log(`Routing ${taskLabel} to CODEX (Cloud Architect)...`);

      const codexResult = runChildProcess(
        process.execPath,
        [CODEX_SCRIPT, taskData.task_id],
        CHILD_TIMEOUT_MS,
      );

      if (!codexResult.ok) {
        log(`Codex failed for ${taskData.task_id}. Falling back to Local Apprentice...`, "WARN");
        taskData = executePlanWithOllama(taskData, planText, jsonPath, planPath);
      } else {
        taskData = parseJsonFile(jsonPath);
      }
    } else {
      taskData = executePlanWithOllama(taskData, planText, jsonPath, planPath);
    }

    writeJsonFile(jsonPath, taskData);
  } else {
    log(
      `Skipping Ollama for ${taskLabel}; task already has an unsynced final outcome.`,
    );
  }

  const taskId = sanitizeText(taskData.task_id || taskLabel);
  if (!taskData.notion_page_id) {
    finalizeLocalOnlyTask(jsonPath, planPath, taskData);
    log(
      `Skipping Notion bridge for ${taskId}: missing notion_page_id in task payload. Task finalized locally.`,
      "WARN",
    );
  } else {
    const bridgeResult = runChildProcess(
      process.execPath,
      [NOTION_BRIDGE_SCRIPT, "--task-file", jsonPath],
      CHILD_TIMEOUT_MS,
    );

    if (!bridgeResult.ok) {
      throw new Error(
        `Notion bridge failed for ${taskId}: ${
          bridgeResult.stderr || bridgeResult.stdout || "no diagnostic output"
        }`,
      );
    }

    log(`Task ${taskId} synced back to Notion.`);
  }
}

function finalizeLocalOnlyTask(jsonPath, planPath, taskData) {
  const finalizedTask = {
    ...taskData,
    status: sanitizeText(taskData.status || "Completed") || "Completed",
    sync_status: "Local Only",
    updated_at: new Date().toISOString(),
  };

  writeJsonFile(jsonPath, finalizedTask);

  const completedJsonPath = path.join(COMPLETED_DIR, path.basename(jsonPath));
  moveFileReplacing(jsonPath, completedJsonPath);

  if (fs.existsSync(planPath)) {
    const completedPlanPath = path.join(COMPLETED_DIR, path.basename(planPath));
    moveFileReplacing(planPath, completedPlanPath);
  }
}

function moveFileReplacing(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
  fs.renameSync(sourcePath, targetPath);
}

function invokeLibrarian(missingPlans) {
  if (!fs.existsSync(LIBRARIAN_SCRIPT)) {
    log(
      `Missing ${path.basename(LIBRARIAN_SCRIPT)}; cannot create plans.`,
      "ERROR",
    );
    return;
  }

  for (const jsonPath of missingPlans) {
    const taskId = path.basename(jsonPath, ".json").replace(/^task-/, "");
    log(`Invoking Librarian for task: ${taskId}`);

    const result = runChildProcess(
      process.execPath,
      [LIBRARIAN_SCRIPT, taskId],
      CHILD_TIMEOUT_MS,
    );
    if (!result.ok) {
      throw new Error(
        `Librarian failed for ${taskId}: ${
          result.stderr || result.stdout || "no diagnostic output"
        }`,
      );
    }
  }
}

function executePlanWithOllama(taskData, planText, jsonPath, planPath) {
  const prompt = buildExecutionPrompt(taskData, planText, jsonPath, planPath);
  const result = invokeOllama(prompt);

  if (!result.ok) {
    throw new Error(
      `Ollama failed: ${result.stderr || result.stdout || "no diagnostic output"}`,
    );
  }

  const parsed = normalizeModelPatch(parseModelJson(result.stdout));
  const merged = mergeTask(taskData, parsed);
  merged.updated_at = new Date().toISOString();
  if (!merged.body || typeof merged.body !== "object") {
    merged.body = {};
  }
  merged.body.final_outcome = sanitizeText(merged.body.final_outcome || "");

  log(
    `Ollama updated task ${sanitizeText(
      merged.task_id || taskData.task_id || path.basename(jsonPath, ".json"),
    )}.`,
  );

  return sanitizeValue(merged);
}

function buildExecutionPrompt(taskData, planText, jsonPath, planPath) {
  return [
    "You are the Apprentice executor for AI Assistant OS v1.1.",
    "Execute the supplied plan against the task record and return a minimal JSON patch only.",
    "Return valid JSON only. Do not use Markdown, code fences, ANSI escape sequences, or commentary.",
    'Do not repeat unchanged metadata such as task_id, notion_page_id, notion_url, title, created_at, or updated_at.',
    "Return only fields that changed during execution.",
    'If execution completed successfully, set "status" to "Completed".',
    'Set "sync_status" to "Not Synced".',
    'Always include "body.final_outcome" as a short concrete summary.',
    "Preferred schema:",
    '{',
    '  "status": "Completed",',
    '  "sync_status": "Not Synced",',
    '  "body": {',
    '    "final_outcome": "..."',
    "  }",
    '}',
    `Task file: ${path.basename(jsonPath)}`,
    `Plan file: ${path.basename(planPath)}`,
    "",
    "Current task context:",
    JSON.stringify(sanitizeValue(taskData), null, 2),
    "",
    "Execution plan:",
    sanitizeText(planText),
  ].join("\n");
}

function invokeOllama(prompt) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const raw = spawnSync("ollama", ["run", MODEL_NAME], {
      cwd: ROOT,
      encoding: "utf8",
      input: sanitizeText(prompt),
      timeout: OLLAMA_TIMEOUT_MS,
    });

    const stdout = sanitizeText(raw.stdout || "");
    const stderr = sanitizeText(raw.stderr || "");
    const error = raw.error ? sanitizeText(raw.error.message) : "";
    const is500 = stderr.includes("500 Internal Server Error");

    if (attempt < 2 && (raw.status !== 0 || raw.error) && is500) {
      log("Ollama returned 500 Internal Server Error; retrying once.", "WARN");
      continue;
    }

    return {
      ok: !raw.error && raw.status === 0,
      status: raw.status,
      stdout,
      stderr,
      error,
    };
  }

  return {
    ok: false,
    status: 1,
    stdout: "",
    stderr: "Ollama failed after retry.",
    error: "",
  };
}

function runChildProcess(command, args, timeoutMs) {
  const raw = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: timeoutMs,
  });

  const stdout = sanitizeText(raw.stdout || "");
  const stderr = sanitizeText(raw.stderr || "");
  const error = raw.error ? sanitizeText(raw.error.message) : "";

  if (stdout) {
    log(stdout);
  }
  if (stderr) {
    log(stderr, "WARN");
  }

  return {
    ok: !raw.error && raw.status === 0,
    status: raw.status,
    stdout,
    stderr,
    error,
  };
}

function listQueueJsonFiles() {
  return fs
    .readdirSync(QUEUE_DIR, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"),
    )
    .map((entry) => path.join(QUEUE_DIR, entry.name))
    .sort();
}

function getPlanPath(jsonPath) {
  return `${jsonPath.slice(0, -path.extname(jsonPath).length)}.plan.md`;
}

function readCleanText(filePath) {
  return sanitizeText(fs.readFileSync(filePath, "utf8"));
}

function parseJsonFile(filePath) {
  const text = readCleanText(filePath);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Failed to parse JSON from ${filePath}: ${sanitizeText(error.message)}`,
    );
  }
}

function parseModelJson(rawText) {
  const candidate = extractJsonCandidate(rawText);
  const attempts = [
    candidate,
    escapeControlCharsInStrings(candidate),
    aggressivelySanitizeJsonCandidate(escapeControlCharsInStrings(candidate)),
  ];

  let lastError;
  let lastAttempt = candidate;

  for (const attempt of attempts) {
    lastAttempt = attempt;
    try {
      return JSON.parse(attempt);
    } catch (error) {
      lastError = error;
    }
  }

  const positionMatch = String((lastError && lastError.message) || "").match(/\d+/);
  const offset = positionMatch ? Number(positionMatch[0]) : -1;
  const contextStart = offset >= 0 ? Math.max(0, offset - 20) : 0;
  const contextEnd =
    offset >= 0 ? Math.min(lastAttempt.length, offset + 20) : Math.min(lastAttempt.length, 40);
  const context = lastAttempt.slice(contextStart, contextEnd);
  const charCodes = Array.from(context)
    .map((char) => `${char.charCodeAt(0)}`)
    .join(",");

  log(
    `JSON KILLER FOUND at offset ${offset >= 0 ? offset : "unknown"}: "...${sanitizeText(
      context,
    )}..." codes=[${charCodes}]`,
    "ERROR",
  );

  throw new Error(
    `Model returned invalid JSON: ${sanitizeText(
      (lastError && lastError.message) || "unknown parse failure",
    )}`,
  );
}

function escapeControlCharsInStrings(text) {
  const controlMap = {
    0x08: "\\b",
    0x09: "\\t",
    0x0a: "\\n",
    0x0c: "\\f",
    0x0d: "\\r",
  };

  let result = "";
  let inString = false;
  let escaped = false;

  for (const char of text) {
    const code = char.charCodeAt(0);

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    if (inString && code < 0x20) {
      result += controlMap[code] || `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }

    result += char;
  }

  return result;
}

function aggressivelySanitizeJsonCandidate(text) {
  return text
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
    .replace(/(^|[\s,])\[(?:\d{1,4}(?:;\d{0,4})*)?[A-PR-TZcf-nq-uy=><~](?=$|[\s,"])/g, "$1")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, (char) => {
      const map = {
        "\n": "\n",
        "\r": "",
        "\t": "\t",
        "\b": "",
        "\f": "",
      };
      return map[char] ?? "";
    });
}

function extractJsonCandidate(rawText) {
  const cleaned = sanitizeText(rawText).trim();
  if (!cleaned) {
    throw new Error("Model returned empty output.");
  }

  const fenced = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const text = fenced ? fenced[1].trim() : cleaned;
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

function normalizeModelPatch(value) {
  const patch = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const next = {
    status: sanitizeText(patch.status || "Completed") || "Completed",
    sync_status: sanitizeText(patch.sync_status || "Not Synced") || "Not Synced",
    body: {
      final_outcome: sanitizeText(
        (patch.body && patch.body.final_outcome) || patch.final_outcome || "",
      ),
    },
  };

  if (!next.body.final_outcome) {
    throw new Error("Model patch is missing body.final_outcome.");
  }

  if (typeof patch.operator_notes === "string") {
    next.operator_notes = sanitizeText(patch.operator_notes);
  }
  if (typeof patch.revised_instructions === "string") {
    next.revised_instructions = sanitizeText(patch.revised_instructions);
  }
  if (typeof patch.decision === "string" || patch.decision === null) {
    next.decision = patch.decision === null ? null : sanitizeText(patch.decision);
  }
  if (typeof patch.risk === "string") {
    next.risk = sanitizeText(patch.risk);
  }
  if (typeof patch.route_target === "string") {
    next.route_target = sanitizeText(patch.route_target);
  }
  if (typeof patch.execution_allowed === "boolean") {
    next.execution_allowed = patch.execution_allowed;
  }

  return next;
}

function mergeTask(originalTask, updatedTask) {
  const nextTask = {
    ...originalTask,
    ...updatedTask,
    task_id: originalTask.task_id,
    notion_page_id: originalTask.notion_page_id,
    notion_url: originalTask.notion_url,
    created_at: originalTask.created_at,
    body: {
      ...(originalTask.body || {}),
      ...((updatedTask && updatedTask.body) || {}),
    },
  };

  if (!nextTask.sync_status) {
    nextTask.sync_status = originalTask.sync_status || "Not Synced";
  }

  return nextTask;
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(sanitizeValue(value), null, 2)}\n`,
    "utf8",
  );
}

function sanitizeValue(value) {
  if (typeof value === "string") {
    return sanitizeText(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)]),
    );
  }
  return value;
}

function sanitizeText(value) {
  return String(value ?? "")
    .replace(/\uFEFF/g, "") // Strips BOM
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "") // Strips OSC sequences
    .replace(
      /[\u001B\u009B][[\]()#;?]*(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~])/g,
      "",
    ) // Strips ANSI codes before ESC is lost
    .replace(/(^|[\s,])\[(?:\d{1,4}(?:;\d{0,4})*)?[A-PR-TZcf-nq-uy=><~](?=$|[\s,"])/g, "$1")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, (char) =>
      char === "\n" || char === "\r" || char === "\t" ? char : " ",
    ); // Preserves layout whitespace, normalizes the rest
}

function log(message, level = "INFO") {
  const line = `[${new Date().toISOString()}] [${level}] ${sanitizeText(message)}`;
  console.log(line);
  fs.appendFileSync(LOG_PATH, `${line}\n`, "utf8");
}
