#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const dotenvx = require("@dotenvx/dotenvx");
const {
  sanitizeText,
  writeArtifact,
} = require("./reviews-approvals-workflow-v1");

dotenvx.config({ quiet: true });

const DEFAULT_CODEX_MODEL = process.env.CODEX_MODEL_ID || "gpt-5";
const ROOT = path.resolve(__dirname, "..");
const LOG_DIR = path.join(ROOT, "runtime", "logs");

async function generateArchitectPlan(task, promptPackageText) {
  const openaiKey = sanitizeText(process.env.OPENAI_API_KEY).trim();
  if (!openaiKey) {
    const fallback = buildFallbackPlan(task, promptPackageText);
    writeArtifact(task, "gpt-plan.md", `${fallback}\n`);
    return {
      plan_text: fallback,
      self_reported_risks: [
        "OPENAI_API_KEY missing; used deterministic fallback plan.",
      ],
      used_fallback: true,
    };
  }

  const openai = new OpenAI({ apiKey: openaiKey });
  const revisedInstructions = sanitizeText(
    task.revised_instructions || (task.body && task.body.revised_instructions) || "",
  ).trim();
  const repoEvidence = deriveRepoEvidence(task);
  const response = await openai.chat.completions.create({
    model: DEFAULT_CODEX_MODEL,
    messages: [
      {
        role: "system",
        content: [
          "You are the Architect/GPT planner for AI Assistant OS.",
          "Return planning guidance only.",
          "Do not execute code.",
          "Do not write files.",
          "Be direct and concise.",
          "Operator overrides are mandatory and take precedence over prior artifacts or assumptions.",
          "If revised instructions or repo evidence identify the framework/stack, do not contradict them.",
          "If a previous plan assumed the wrong stack, replace it rather than blending the old and new plans.",
          "Return JSON with plan_text and self_reported_risks.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Task ID: ${sanitizeText(task.task_id)}`,
          `Task Title: ${sanitizeText(task.title)}`,
          revisedInstructions ? `Revised Instructions:\n${revisedInstructions}` : "",
          repoEvidence ? `Repo Evidence:\n${repoEvidence}` : "",
          "",
          "Prompt Package:",
          sanitizeText(promptPackageText),
        ].join("\n"),
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0].message.content || "{}";
  const parsed = JSON.parse(raw);
  const planText = sanitizeText(parsed.plan_text || "").trim();
  const risks = Array.isArray(parsed.self_reported_risks)
    ? parsed.self_reported_risks.map((entry) => sanitizeText(entry).trim()).filter(Boolean)
    : [];

  if (!planText) {
    throw new Error("Architect/GPT returned an empty plan_text.");
  }

  writeArtifact(task, "gpt-plan.md", `${planText}\n`);
  appendUsageLog(response.usage || {}, task.task_id);

  return {
    plan_text: planText,
    self_reported_risks: risks,
    used_fallback: false,
  };
}

function deriveRepoEvidence(task) {
  const signalText = [
    sanitizeText(task.revised_instructions),
    sanitizeText(task.body && task.body.revised_instructions),
    sanitizeText(task.operator_notes),
    sanitizeText(task.body && task.body.operator_notes),
  ]
    .filter(Boolean)
    .join("\n");

  const roots = Array.from(
    new Set((signalText.match(/[A-Z]:\\[^\s"'\r\n]+/g) || []).map((entry) => normalizeRoot(entry)).filter(Boolean)),
  );

  const evidence = [];
  for (const root of roots) {
    const packageJsonPath = path.join(root, "package.json");
    const appDir = path.join(root, "app");
    const pubspecPath = path.join(root, "pubspec.yaml");
    if (fs.existsSync(packageJsonPath)) {
      const pkg = safeReadJson(packageJsonPath);
      if (pkg) {
        evidence.push(`Project root: ${root}`);
        evidence.push(`package.json exists: ${packageJsonPath}`);
        if (pkg.dependencies && pkg.dependencies.next) {
          evidence.push(`Detected next dependency: ${sanitizeText(pkg.dependencies.next)}`);
        }
        if (pkg.dependencies && pkg.dependencies.react) {
          evidence.push(`Detected react dependency: ${sanitizeText(pkg.dependencies.react)}`);
        }
      }
    }
    if (fs.existsSync(appDir)) {
      evidence.push(`App Router directory exists: ${appDir}`);
    }
    if (fs.existsSync(pubspecPath)) {
      evidence.push(`Flutter marker exists: ${pubspecPath}`);
    }
  }

  return evidence.join("\n");
}

function normalizeRoot(filePath) {
  const normalized = sanitizeText(filePath).trim().replace(/\//g, "\\").replace(/\\+$/, "");
  const match = normalized.match(/^([A-Z]:\\[^\\]+)(?:\\.*)?$/i);
  return match ? match[1] : "";
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function buildFallbackPlan(task, promptPackageText) {
  return [
    `Task: ${sanitizeText(task.title || task.task_id)}`,
    "",
    "Fallback planning mode engaged because OpenAI credentials are unavailable.",
    "",
    "Recommended planning output:",
    "1. Re-read the approved task summary, constraints, and affected components.",
    "2. Produce the smallest change set that satisfies the task without broadening scope.",
    "3. Preserve the existing Notion -> mirror -> review -> execution pipeline.",
    "4. Include a narrow verification step before claiming completion.",
    "",
    "Prompt package reference:",
    sanitizeText(promptPackageText || ""),
  ].join("\n");
}

function appendUsageLog(usage, taskId) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const ledgerPath = path.join(LOG_DIR, "api-usage.ndjson");
  const entry = {
    timestamp: new Date().toISOString(),
    taskId: sanitizeText(taskId),
    model: DEFAULT_CODEX_MODEL,
    prompt_tokens: usage.prompt_tokens || 0,
    completion_tokens: usage.completion_tokens || 0,
    total_tokens: usage.total_tokens || 0,
  };
  fs.appendFileSync(ledgerPath, `${JSON.stringify(entry)}\n`, "utf8");
}

async function main() {
  const taskPath = process.argv[2];
  const promptPath = process.argv[3];
  if (!taskPath || !promptPath) {
    console.error("Usage: node scripts/executor-codex-v1.js <task-json-path> <prompt-package-path>");
    process.exit(1);
  }

  const task = JSON.parse(fs.readFileSync(path.resolve(taskPath), "utf8"));
  const promptPackageText = fs.readFileSync(path.resolve(promptPath), "utf8");
  const result = await generateArchitectPlan(task, promptPackageText);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Architect/GPT planning failed: ${sanitizeText(error.message)}`);
    process.exit(1);
  });
}

module.exports = { generateArchitectPlan };
