#!/usr/bin/env node

require("dotenv").config();
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

const services = [
  {
    name: "mirror",
    script: path.join(__dirname, "mirror-notion-watch-v1.js"),
  },
  {
    name: "manager",
    script: path.join(__dirname, "executor-manager-v1.js"),
  },
];

if (String(process.env.API_USAGE_SYNC_ENABLED || "true").toLowerCase() !== "false") {
  services.push({
    name: "api-usage",
    script: path.join(__dirname, "watch-api-usage-dashboard-v1.js"),
  });
}

if (String(process.env.TELEGRAM_INTAKE_ENABLED || "").toLowerCase() === "true") {
  services.push({
    name: "telegram-intake",
    script: path.join(__dirname, "telegram-project-intake-v1.js"),
  });
}

if (String(process.env.TELEGRAM_TERMINAL_ENABLED || "").toLowerCase() === "true") {
  services.push({
    name: "telegram-codex-terminal",
    script: path.join(__dirname, "telegram-codex-terminal-v1.js"),
  });
}

if (String(process.env.TELEGRAM_LOCAL_TERMINAL_ENABLED || "").toLowerCase() === "true") {
  services.push({
    name: "telegram-local-terminal",
    script: path.join(__dirname, "telegram-local-terminal-v1.js"),
  });
}

const children = [];
let shuttingDown = false;

for (const service of services) {
  const child = spawn(process.execPath, [service.script], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });

  children.push(child);
  pipeWithPrefix(child.stdout, service.name, "INFO");
  pipeWithPrefix(child.stderr, service.name, "ERROR");

  child.on("exit", (code, signal) => {
    log(
      `${service.name} exited${code != null ? ` with code ${code}` : ""}${
        signal ? ` signal ${signal}` : ""
      }.`,
      code === 0 || shuttingDown ? "INFO" : "ERROR",
    );

    if (!shuttingDown && code !== 0) {
      shutdown(1);
    }
  });
}

log("OS services started: mirror watcher + manager.");

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function pipeWithPrefix(stream, service, level) {
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    const sanitized = sanitizeChildOutput(line);
    if (!sanitized || shouldSuppressLine(sanitized)) {
      return;
    }
    console.log(`[${service}] ${sanitized}`);
  });
  rl.on("close", () => {
    if (!shouldSuppressLine(`${service} ${level.toLowerCase()} stream closed.`)) {
      log(`${service} ${level.toLowerCase()} stream closed.`);
    }
  });
}

function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  log("Shutting down OS services...");

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(exitCode), 250);
}

function log(message, level = "INFO") {
  console.log(`[launcher] [${level}] ${message}`);
}

function shouldSuppressLine(line) {
  return /injecting env/i.test(line);
}

function sanitizeChildOutput(value) {
  return String(value ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(
      /[\u001B\u009B][[\]()#;?]*(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~])/g,
      "",
    )
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, (char) =>
      char === "\n" || char === "\r" || char === "\t" ? char : " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}
