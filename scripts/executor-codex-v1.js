#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const dotenvx = require("@dotenvx/dotenvx");

dotenvx.config({ quiet: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ROOT = path.resolve(__dirname, "..");
const QUEUE_DIR = path.join(ROOT, "runtime", "queue");
const HANDOFF_PATH = path.join(ROOT, "OS-V1-HANDOFF.md");
const LOG_DIR = path.join(ROOT, "runtime", "logs");
const DEFAULT_CODEX_MODEL = process.env.CODEX_MODEL_ID || "gpt-5";
const DEFAULT_ECONOMY_MODEL = process.env.ECONOMY_MODEL_ID || "gpt-5-mini";

async function main() {
  const taskId = process.argv[2];
  if (!taskId) {
    console.error("Usage: node scripts/executor-codex-v1.js <taskId>");
    process.exit(1);
  }

  const jsonPath = path.join(QUEUE_DIR, `task-${taskId}.json`);
  const planPath = path.join(QUEUE_DIR, `task-${taskId}.plan.md`);

  try {
    const taskData = JSON.parse(sanitizeText(fs.readFileSync(jsonPath, "utf8")));
    const planText = sanitizeText(fs.readFileSync(planPath, "utf8"));
    const handoffText = fs.existsSync(HANDOFF_PATH)
      ? sanitizeText(fs.readFileSync(HANDOFF_PATH, "utf8"))
      : "";

    console.log(`Sending Task ${taskId} to OpenAI Codex (${DEFAULT_CODEX_MODEL})...`);

    const response = await openai.chat.completions.create({
      model: DEFAULT_CODEX_MODEL,
      messages: [
        {
          role: "system",
          content: `You are the Codex Architect for AI Assistant OS v1.1.
Execute the plan against the task record, return ONLY the updated task JSON, and keep unchanged metadata untouched. Reference this handoff: ${handoffText}`
        },
        {
          role: "user",
          content: `Task JSON: ${JSON.stringify(taskData)}\n\nExecution Plan: ${planText}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const updatedTask = JSON.parse(response.choices[0].message.content);

    const usage = response.usage || {};
    const cost = calculateCost(usage, DEFAULT_CODEX_MODEL);
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const ledgerPath = path.join(LOG_DIR, "api-usage.ndjson");

    const logEntry = {
      timestamp: new Date().toISOString(),
      taskId,
      model: DEFAULT_CODEX_MODEL,
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      cost_usd: cost
    };
    fs.appendFileSync(ledgerPath, `${JSON.stringify(logEntry)}\n`, "utf8");

    checkBudgetLimits(cost, ledgerPath);
    const finalTask = {
      ...taskData,
      ...updatedTask,
      task_id: taskData.task_id,
      notion_page_id: taskData.notion_page_id,
      notion_url: taskData.notion_url,
      created_at: taskData.created_at,
      updated_at: new Date().toISOString()
    };

    fs.writeFileSync(jsonPath, `${JSON.stringify(finalTask, null, 2)}\n`, "utf8");
    console.log(`Codex successfully updated task ${taskId}.`);
  } catch (error) {
    console.error(`Codex Execution Error for ${taskId}:`, error.message);
    process.exit(1);
  }
}

function sanitizeText(val) {
  return String(val ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) =>
      [ "\n", "\r", "\t" ].includes(c) ? c : " "
    );
}


function calculateCost(usage, model) {
  const rates = {
    "gpt-5": { input: 2.5, output: 20.0 },
    "gpt-5-mini": { input: 0.75, output: 4.5 }
  };
  const rate = rates[model] || rates["gpt-5"];
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  return Number(
    (
      (promptTokens / 1_000_000) * rate.input +
      (completionTokens / 1_000_000) * rate.output
    ).toFixed(6),
  );
}

function checkBudgetLimits(currentCost, ledgerPath) {
  const SESSION_LIMIT = 5.0;
  const threshold = SESSION_LIMIT * 0.5;
  let total = currentCost;
  if (fs.existsSync(ledgerPath)) {
    const lines = fs.readFileSync(ledgerPath, "utf8").trim().split("\n");
    const now = Date.now();
    const windowMs = 5 * 60 * 60 * 1000;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const entryTime = new Date(entry.timestamp).getTime();
        if (now - entryTime <= windowMs) {
          total += entry.cost_usd || 0;
        }
      } catch {
        continue;
      }
    }
  }

  if (total >= SESSION_LIMIT) {
    throw new Error(`Codex session cost ${total.toFixed(3)} exceeds $${SESSION_LIMIT}`);
  }

  if (total >= threshold) {
    updateEnvModel(DEFAULT_ECONOMY_MODEL);
    console.warn(
      `Usage ${total.toFixed(3)} >= ${threshold}; switching to ${process.env.CODEX_MODEL_ID}`,
    );
  }
}

function updateEnvModel(newModel) {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  const updatedContent = content.replace(/^(CODEX_MODEL_ID=)(.*)$/m, `$1${newModel}`);
  if (content !== updatedContent) {
    fs.writeFileSync(envPath, updatedContent, "utf8");
    process.env.CODEX_MODEL_ID = newModel;
    console.log(`\n[GUARDRAIL] .env UPDATED: CODEX_MODEL_ID is now ${newModel}`);
  }
}

main();
