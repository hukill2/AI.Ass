#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { sanitizeText } = require("./reviews-approvals-workflow-v1");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_ALLOWED_ROOTS = [ROOT, "E:\\Mobiledets"];
const BLOCKED_SEGMENTS = new Set(
  (process.env.TELEGRAM_TERMINAL_BLOCK_PATHS || ".git,node_modules,.next,dist,build")
    .split(",")
    .map((value) => sanitizeText(value).trim().toLowerCase())
    .filter(Boolean),
);
const ALLOWED_WRITE_EXTENSIONS = new Set(
  (
    process.env.TELEGRAM_TERMINAL_ALLOWED_WRITE_EXTENSIONS ||
    ".js,.cjs,.mjs,.ts,.tsx,.json,.md,.css,.scss,.html,.txt,.yml,.yaml,.ps1,.env.example"
  )
    .split(",")
    .map((value) => sanitizeText(value).trim().toLowerCase())
    .filter(Boolean),
);
const ACTION_LOG_PATH = path.join(ROOT, "runtime", "logs", "telegram-codex-terminal-actions.v1.jsonl");
const COMMAND_TIMEOUT_MS = Number(process.env.TELEGRAM_TERMINAL_COMMAND_TIMEOUT_MS || 120000);
const MAX_FILE_BYTES = Number(process.env.TELEGRAM_TERMINAL_MAX_FILE_BYTES || 100000);
const MAX_LIST_RESULTS = Number(process.env.TELEGRAM_TERMINAL_MAX_LIST_RESULTS || 200);

function getAllowedRoots() {
  const configured = sanitizeText(process.env.TELEGRAM_TERMINAL_ALLOWED_ROOTS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const roots = configured.length > 0 ? configured : DEFAULT_ALLOWED_ROOTS;
  return roots.map((entry) => normalizeRoot(entry));
}

function normalizeRoot(rootPath) {
  return path.resolve(rootPath).replace(/[\\\/]+$/, "");
}

function isWithinRoot(candidate, root) {
  const normalizedCandidate = normalizeComparablePath(candidate);
  const normalizedRoot = normalizeComparablePath(root);
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${path.sep.toLowerCase()}`)
  );
}

function normalizeComparablePath(value) {
  return path.resolve(value).replace(/[\\\/]+$/, "").toLowerCase();
}

function resolveApprovedPath(targetPath, options = {}) {
  const text = sanitizeText(targetPath).trim();
  if (!text) {
    throw new Error("Path is required.");
  }

  const candidate = path.resolve(text);
  const allowedRoot = getAllowedRoots().find((root) => isWithinRoot(candidate, root));
  if (!allowedRoot) {
    throw new Error(`Path is outside approved roots: ${candidate}`);
  }

  const relative = path.relative(allowedRoot, candidate);
  const segments = relative
    .split(/[\\\/]+/)
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  const blocked = segments.find((segment) => BLOCKED_SEGMENTS.has(segment));
  if (blocked) {
    throw new Error(`Path touches blocked segment "${blocked}": ${candidate}`);
  }

  if (options.mustExist && !fs.existsSync(candidate)) {
    throw new Error(`Path does not exist: ${candidate}`);
  }

  return { path: candidate, root: allowedRoot };
}

function ensureWritableFilePath(targetPath) {
  const resolved = resolveApprovedPath(targetPath);
  const extension = path.extname(resolved.path).toLowerCase();
  if (!ALLOWED_WRITE_EXTENSIONS.has(extension)) {
    throw new Error(`Writes are not allowed for extension "${extension || "(none)"}".`);
  }
  return resolved;
}

function listFiles({ root, pattern = "", limit = MAX_LIST_RESULTS }) {
  const resolved = resolveApprovedPath(root, { mustExist: true });
  const stat = fs.statSync(resolved.path);
  if (!stat.isDirectory()) {
    throw new Error(`Root is not a directory: ${resolved.path}`);
  }

  const matches = [];
  const needle = sanitizeText(pattern).trim().toLowerCase();

  walkDirectory(resolved.path, (entryPath) => {
    const rel = path.relative(resolved.path, entryPath);
    if (!rel) {
      return;
    }
    const relNormalized = rel.replace(/\\/g, "/");
    if (needle && !relNormalized.toLowerCase().includes(needle)) {
      return;
    }
    matches.push(path.join(resolved.path, rel));
    return matches.length < limit;
  });

  return {
    root: resolved.path,
    pattern: needle,
    count: matches.length,
    files: matches,
  };
}

function walkDirectory(rootDir, onFile) {
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (BLOCKED_SEGMENTS.has(entry.name.toLowerCase())) {
          continue;
        }
        stack.push(entryPath);
        continue;
      }
      const shouldContinue = onFile(entryPath);
      if (shouldContinue === false) {
        return;
      }
    }
  }
}

function readFileSegment({ file_path, start_line = 1, end_line = 200 }) {
  const resolved = resolveApprovedPath(file_path, { mustExist: true });
  const stat = fs.statSync(resolved.path);
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${resolved.path}`);
  }
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File is too large to read safely: ${resolved.path}`);
  }

  const lines = fs.readFileSync(resolved.path, "utf8").split(/\r?\n/);
  const start = Math.max(1, Number(start_line || 1));
  const end = Math.max(start, Number(end_line || start));
  const snippet = [];
  for (let index = start; index <= Math.min(end, lines.length); index += 1) {
    snippet.push(`${String(index).padStart(4, " ")} | ${lines[index - 1]}`);
  }
  return {
    file_path: resolved.path,
    start_line: start,
    end_line: Math.min(end, lines.length),
    total_lines: lines.length,
    content: snippet.join("\n"),
  };
}

function tailFile({ file_path, lines = 80 }) {
  const resolved = resolveApprovedPath(file_path, { mustExist: true });
  const stat = fs.statSync(resolved.path);
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${resolved.path}`);
  }
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File is too large to tail safely: ${resolved.path}`);
  }

  const fileLines = fs.readFileSync(resolved.path, "utf8").split(/\r?\n/);
  const count = Math.max(1, Math.min(Number(lines || 80), 200));
  const start = Math.max(1, fileLines.length - count + 1);
  return readFileSegment({
    file_path: resolved.path,
    start_line: start,
    end_line: fileLines.length,
  });
}

function validateCommand(command, args, mode) {
  const cmd = sanitizeText(command).trim().toLowerCase();
  const argv = Array.isArray(args) ? args.map((value) => sanitizeText(value).trim()).filter(Boolean) : [];

  if (!cmd) {
    throw new Error("Command is required.");
  }

  if (mode === "read") {
    if (cmd === "git") {
      const allowed = new Set(["status", "diff", "log", "branch", "rev-parse", "remote"]);
      if (!allowed.has((argv[0] || "").toLowerCase())) {
        throw new Error(`git ${argv[0] || ""} is not allowed in auto mode.`);
      }
      return { command: "git", args: argv };
    }
    if (cmd === "npm") {
      const joined = argv.join(" ").toLowerCase();
      const allowed =
        joined === "run build" ||
        joined === "run lint" ||
        joined === "run test" ||
        joined === "test";
      if (!allowed) {
        throw new Error(`npm ${argv.join(" ")} is not allowed in auto mode.`);
      }
      return { command: "npm", args: argv };
    }
    if (cmd === "node") {
      if ((argv[0] || "").toLowerCase() !== "--check") {
        throw new Error(`node ${argv.join(" ")} is not allowed in auto mode.`);
      }
      return { command: "node", args: argv };
    }
  }

  if (mode === "write") {
    if (cmd === "npm") {
      const joined = argv.join(" ").toLowerCase();
      const allowed =
        joined === "install" ||
        joined === "ci" ||
        joined === "run build" ||
        joined === "run lint" ||
        joined === "run test" ||
        joined === "test";
      if (!allowed) {
        throw new Error(`npm ${argv.join(" ")} is not allowed for approved execution.`);
      }
      return { command: "npm", args: argv };
    }
    if (cmd === "git") {
      const allowed = new Set(["status", "diff", "add", "commit"]);
      if (!allowed.has((argv[0] || "").toLowerCase())) {
        throw new Error(`git ${argv[0] || ""} is not allowed for approved execution.`);
      }
      return { command: "git", args: argv };
    }
    if (cmd === "node") {
      if ((argv[0] || "").toLowerCase() !== "--check") {
        throw new Error(`node ${argv.join(" ")} is not allowed for approved execution.`);
      }
      return { command: "node", args: argv };
    }
  }

  throw new Error(`Command "${cmd}" is not allowed.`);
}

function executeCommand({ cwd, command, args = [], mode = "read" }) {
  const resolvedCwd = resolveApprovedPath(cwd || ROOT, { mustExist: true });
  const stat = fs.statSync(resolvedCwd.path);
  if (!stat.isDirectory()) {
    throw new Error(`cwd is not a directory: ${resolvedCwd.path}`);
  }

  const validated = validateCommand(command, args, mode);
  const result = runProcess(validated.command, validated.args, resolvedCwd.path);
  return {
    cwd: resolvedCwd.path,
    command: validated.command,
    args: validated.args,
    exit_code: result.status,
    stdout: truncateOutput(result.stdout),
    stderr: truncateOutput(result.stderr),
    ok: result.status === 0,
  };
}

function runProcess(command, args, cwd) {
  if (command === "npm") {
    return spawnSync("cmd.exe", ["/d", "/s", "/c", "npm.cmd", ...args], {
      cwd,
      encoding: "utf8",
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
    });
  }

  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true,
  });
}

function truncateOutput(value, maxChars = 12000) {
  const text = sanitizeText(value || "");
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n... [truncated]`;
}

function queueAction(session, action) {
  if (!session.pending_plan) {
    session.pending_plan = {
      id: `pending-${Date.now()}`,
      created_at: new Date().toISOString(),
      summary: "",
      actions: [],
    };
  }
  session.pending_plan.actions.push(action);
  session.pending_plan.updated_at = new Date().toISOString();
  return session.pending_plan;
}

function queueWriteFile(session, { file_path, content, reason = "" }) {
  const resolved = ensureWritableFilePath(file_path);
  const text = String(content ?? "");
  const pending = queueAction(session, {
    type: "write_file",
    file_path: resolved.path,
    reason: sanitizeText(reason).trim(),
    content: text,
  });
  return {
    pending_id: pending.id,
    action_count: pending.actions.length,
    file_path: resolved.path,
    bytes: Buffer.byteLength(text, "utf8"),
  };
}

function queueReplaceInFile(session, { file_path, old_text, new_text, replace_all = false, reason = "" }) {
  const resolved = ensureWritableFilePath(file_path);
  const pending = queueAction(session, {
    type: "replace_in_file",
    file_path: resolved.path,
    old_text: String(old_text ?? ""),
    new_text: String(new_text ?? ""),
    replace_all: Boolean(replace_all),
    reason: sanitizeText(reason).trim(),
  });
  return {
    pending_id: pending.id,
    action_count: pending.actions.length,
    file_path: resolved.path,
    replace_all: Boolean(replace_all),
  };
}

function queueRunCommand(session, { cwd, command, args = [], reason = "" }) {
  const resolvedCwd = resolveApprovedPath(cwd || ROOT, { mustExist: true });
  const validated = validateCommand(command, args, "write");
  const pending = queueAction(session, {
    type: "run_command",
    cwd: resolvedCwd.path,
    command: validated.command,
    args: validated.args,
    reason: sanitizeText(reason).trim(),
  });
  return {
    pending_id: pending.id,
    action_count: pending.actions.length,
    cwd: resolvedCwd.path,
    command: `${validated.command} ${validated.args.join(" ")}`.trim(),
  };
}

function queueGitCommit(session, { cwd, message, files = [], reason = "" }) {
  const resolvedCwd = resolveApprovedPath(cwd || ROOT, { mustExist: true });
  if (!sanitizeText(message).trim()) {
    throw new Error("Commit message is required.");
  }
  const normalizedFiles = Array.isArray(files)
    ? files.map((entry) => sanitizeText(entry).trim()).filter(Boolean)
    : [];
  normalizedFiles.forEach((entry) => {
    const target = path.resolve(resolvedCwd.path, entry);
    resolveApprovedPath(target);
  });
  const pending = queueAction(session, {
    type: "git_commit",
    cwd: resolvedCwd.path,
    message: sanitizeText(message).trim(),
    files: normalizedFiles,
    reason: sanitizeText(reason).trim(),
  });
  return {
    pending_id: pending.id,
    action_count: pending.actions.length,
    cwd: resolvedCwd.path,
    message: sanitizeText(message).trim(),
    files: normalizedFiles,
  };
}

function describePendingPlan(plan) {
  if (!plan || !Array.isArray(plan.actions) || plan.actions.length === 0) {
    return "No pending approved actions.";
  }

  const lines = [
    `Pending plan: ${plan.id}`,
    `Queued at: ${plan.created_at || "unknown"}`,
  ];
  if (plan.summary) {
    lines.push(`Summary: ${sanitizeText(plan.summary)}`);
  }
  lines.push("Actions:");
  plan.actions.forEach((action, index) => {
    lines.push(`${index + 1}. ${describeAction(action)}`);
  });
  lines.push("Reply /approve to execute or /reject to clear.");
  return lines.join("\n");
}

function describeAction(action) {
  switch (action.type) {
    case "write_file":
      return `write ${action.file_path}`;
    case "replace_in_file":
      return `edit ${action.file_path}`;
    case "run_command":
      return `run ${action.command} ${Array.isArray(action.args) ? action.args.join(" ") : ""}`.trim();
    case "git_commit":
      return `git commit in ${action.cwd} with message "${action.message}"`;
    default:
      return action.type || "unknown action";
  }
}

function executePendingPlan(session, options = {}) {
  const plan = session.pending_plan;
  if (!plan || !Array.isArray(plan.actions) || plan.actions.length === 0) {
    return {
      ok: false,
      message: "No pending actions to approve.",
      results: [],
    };
  }

  const results = [];
  for (const action of plan.actions) {
    let result;
    try {
      result = executeApprovedAction(action);
      appendActionLog({
        chat_id: options.chatId || "",
        approved_by: options.approvedBy || "",
        action,
        result,
        timestamp: new Date().toISOString(),
      });
      results.push({ ok: true, action, result });
    } catch (error) {
      result = { ok: false, error: sanitizeText(error.message) };
      appendActionLog({
        chat_id: options.chatId || "",
        approved_by: options.approvedBy || "",
        action,
        result,
        timestamp: new Date().toISOString(),
      });
      results.push({ ok: false, action, result });
      session.pending_plan = null;
      return {
        ok: false,
        message: formatExecutionSummary(plan, results),
        results,
      };
    }
  }

  session.pending_plan = null;
  return {
    ok: true,
    message: formatExecutionSummary(plan, results),
    results,
  };
}

function executeApprovedAction(action) {
  switch (action.type) {
    case "write_file":
      return executeWriteFile(action);
    case "replace_in_file":
      return executeReplaceInFile(action);
    case "run_command":
      return executeCommand({
        cwd: action.cwd,
        command: action.command,
        args: action.args,
        mode: "write",
      });
    case "git_commit":
      return executeGitCommit(action);
    default:
      throw new Error(`Unknown approved action type: ${action.type}`);
  }
}

function executeWriteFile(action) {
  const resolved = ensureWritableFilePath(action.file_path);
  fs.mkdirSync(path.dirname(resolved.path), { recursive: true });
  fs.writeFileSync(resolved.path, action.content, "utf8");
  return {
    ok: true,
    file_path: resolved.path,
    bytes: Buffer.byteLength(action.content, "utf8"),
  };
}

function executeReplaceInFile(action) {
  const resolved = ensureWritableFilePath(action.file_path);
  const existing = fs.readFileSync(resolved.path, "utf8");
  if (!existing.includes(action.old_text)) {
    throw new Error(`Target text was not found in ${resolved.path}`);
  }
  const next = action.replace_all
    ? existing.split(action.old_text).join(action.new_text)
    : existing.replace(action.old_text, action.new_text);
  fs.writeFileSync(resolved.path, next, "utf8");
  return {
    ok: true,
    file_path: resolved.path,
    changed: true,
  };
}

function executeGitCommit(action) {
  const cwd = resolveApprovedPath(action.cwd, { mustExist: true }).path;
  const stageArgs = Array.isArray(action.files) && action.files.length > 0 ? ["add", "--", ...action.files] : ["add", "-A"];
  const stageResult = executeCommand({
    cwd,
    command: "git",
    args: stageArgs,
    mode: "write",
  });
  if (!stageResult.ok) {
    throw new Error(stageResult.stderr || stageResult.stdout || "git add failed.");
  }

  const commitResult = executeCommand({
    cwd,
    command: "git",
    args: ["commit", "-m", action.message],
    mode: "write",
  });

  if (!commitResult.ok) {
    const combined = `${commitResult.stdout}\n${commitResult.stderr}`.toLowerCase();
    if (combined.includes("nothing to commit")) {
      return {
        ok: true,
        cwd,
        commit_skipped: true,
        reason: "Nothing to commit.",
      };
    }
    if (combined.includes("does not have any commits yet") || combined.includes("unborn branch")) {
      return {
        ok: true,
        cwd,
        commit_skipped: true,
        reason:
          "Needs initial GitHub commit before delegated milestone commits can run. Review and create the first commit manually, then retry later commit tasks.",
      };
    }
    throw new Error(commitResult.stderr || commitResult.stdout || "git commit failed.");
  }

  return {
    ok: true,
    cwd,
    stdout: commitResult.stdout,
    stderr: commitResult.stderr,
  };
}

function formatExecutionSummary(plan, results) {
  const lines = [`Execution result for ${plan.id}:`];
  results.forEach((entry, index) => {
    if (!entry.ok) {
      lines.push(`${index + 1}. FAILED ${describeAction(entry.action)} -> ${entry.result.error}`);
      return;
    }

    const result = entry.result || {};
    if (entry.action.type === "write_file") {
      lines.push(`${index + 1}. Wrote ${result.file_path}`);
      return;
    }
    if (entry.action.type === "replace_in_file") {
      lines.push(`${index + 1}. Edited ${result.file_path}`);
      return;
    }
    if (entry.action.type === "run_command") {
      lines.push(
        `${index + 1}. Ran ${entry.action.command} ${(entry.action.args || []).join(" ")} (exit ${result.exit_code})`,
      );
      if (result.stdout) {
        lines.push(indentBlock(result.stdout, "   stdout: "));
      }
      if (result.stderr) {
        lines.push(indentBlock(result.stderr, "   stderr: "));
      }
      return;
    }
    if (entry.action.type === "git_commit") {
      lines.push(`${index + 1}. Git commit result in ${result.cwd}`);
      if (result.reason) {
        lines.push(`   note: ${result.reason}`);
      }
      if (result.stdout) {
        lines.push(indentBlock(result.stdout, "   stdout: "));
      }
      if (result.stderr) {
        lines.push(indentBlock(result.stderr, "   stderr: "));
      }
      return;
    }
  });
  return lines.join("\n");
}

function indentBlock(value, prefix) {
  return sanitizeText(value)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => (index === 0 ? `${prefix}${line}` : `            ${line}`))
    .join("\n");
}

function appendActionLog(entry) {
  fs.mkdirSync(path.dirname(ACTION_LOG_PATH), { recursive: true });
  fs.appendFileSync(ACTION_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

module.exports = {
  ROOT,
  ACTION_LOG_PATH,
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
};
