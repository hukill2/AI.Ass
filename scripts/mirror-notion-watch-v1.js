#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const MIRROR_SCRIPT = path.join(__dirname, "mirror-notion-to-local-v1.js");
const DEFAULT_INTERVAL_MS = 1 * 1000;

const argInterval = Number(process.argv[2]);
const envInterval = Number(process.env.NOTION_MIRROR_POLL_MS);
const intervalMs =
  Number.isFinite(argInterval) && argInterval > 0
    ? argInterval
    : Number.isFinite(envInterval) && envInterval > 0
      ? envInterval
      : DEFAULT_INTERVAL_MS;

main();

function main() {
  log(`Watching Notion for approved tasks every ${Math.round(intervalMs / 1000)}s.`);
  runCycle();
}

function runCycle() {
  const result = spawnSync(process.execPath, [MIRROR_SCRIPT], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120000,
  });

  writeSanitizedOutput(result.stdout, "stdout");
  writeSanitizedOutput(result.stderr, "stderr");

  if (result.error) {
    log(`Mirror poll failed: ${result.error.message}`, "ERROR");
  } else if (result.status !== 0) {
    log(`Mirror poll exited with status ${result.status}.`, "WARN");
  }

  setTimeout(runCycle, intervalMs);
}

function log(message, level = "INFO") {
  console.log(`[${new Date().toISOString()}] [${level}] ${message}`);
}

function writeSanitizedOutput(value, streamName) {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => sanitizeText(line))
    .filter((line) => line && !/injecting env/i.test(line));

  if (lines.length === 0) {
    return;
  }

  const target = streamName === "stderr" ? process.stderr : process.stdout;
  target.write(`${lines.join("\n")}\n`);
}

function sanitizeText(value) {
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
