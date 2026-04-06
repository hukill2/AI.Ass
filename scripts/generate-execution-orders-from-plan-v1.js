#!/usr/bin/env node

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  STATUS,
  STAGE,
  APPROVAL_GATE,
  getSectionDefinitions,
  normalizeTask,
  sanitizeText,
} = require("./reviews-approvals-workflow-v1");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_DIR = path.join(ROOT, "runtime", "queue");
const COMPLETED_DIR = path.join(ROOT, "runtime", "completed");
const STANDARD_EXECUTION_TEMPLATE = "Standard execution prompt";
const REVIEWS_DB = sanitizeText(
  process.env.NOTION_REVIEWS_DATABASE_ID || process.env.REVIEWS_DATABASE_ID || "",
).trim();
const NOTION_API_KEY = sanitizeText(process.env.NOTION_API_KEY).trim();

if (!NOTION_API_KEY || !REVIEWS_DB) {
  console.error("NOTION_API_KEY and NOTION_REVIEWS_DATABASE_ID are required.");
  process.exit(1);
}

main().catch((error) => {
  console.error(`[execution-orders] ${sanitizeText(error.stack || error.message)}`);
  process.exit(1);
});

async function main() {
  const args = process.argv.slice(2);
  const taskId = readArg(args, "--task-id");
  const itemsArg = readArg(args, "--items");
  const all = args.includes("--all");
  const dryRun = args.includes("--dry-run");

  if (!taskId || (!itemsArg && !all)) {
    console.error(
      "Usage: node scripts/generate-execution-orders-from-plan-v1.js --task-id <planning-task-id> (--items 1,2,3 | --all) [--dry-run]",
    );
    process.exit(1);
  }

  const planningTask = loadTask(taskId);
  if (!planningTask) {
    throw new Error(`Planning task not found: ${taskId}`);
  }

  const backlog = parseImplementationBacklog(planningTask.body.gpt_plan);
  if (backlog.length === 0) {
    throw new Error("No implementation backlog items found in the planning task GPT plan.");
  }

  const selectedIndexes = all
    ? backlog.map((item) => item.number)
    : parseSelectedItems(itemsArg);
  const selected = backlog.filter((item) => selectedIndexes.includes(item.number));
  if (selected.length === 0) {
    throw new Error("No matching backlog items selected.");
  }

  const dbSchema = await notionGet(`databases/${REVIEWS_DB}`);
  const created = [];

  for (const item of selected) {
    const executionTask = buildExecutionTask(planningTask, item);
    if (dryRun) {
      created.push({
        title: executionTask.title,
        task_id: executionTask.task_id,
        backlog_item: item.number,
        summary: executionTask.body.summary,
      });
      continue;
    }
    const payload = {
      parent: { database_id: REVIEWS_DB },
      properties: buildCreatePropertiesPayload(executionTask, dbSchema.properties || {}),
      children: buildInitialPageBlocks(executionTask),
    };
    const page = await notionApi("pages", payload);
    created.push({
      title: executionTask.title,
      task_id: executionTask.task_id,
      url: page.url,
      backlog_item: item.number,
    });
  }

  console.log(`${dryRun ? "Prepared" : "Created"} ${created.length} execution order(s):`);
  created.forEach((entry) => {
    console.log(`- [${entry.backlog_item}] ${entry.title} (${entry.task_id})`);
    if (dryRun) {
      console.log(`  ${entry.summary}`);
    } else {
      console.log(`  ${entry.url}`);
    }
  });
}

function loadTask(taskId) {
  const fileName = `task-${sanitizeFileName(taskId)}.json`;
  const candidates = [
    path.join(QUEUE_DIR, fileName),
    path.join(COMPLETED_DIR, fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return normalizeTask(JSON.parse(fs.readFileSync(candidate, "utf8")));
    }
  }
  return null;
}

function parseImplementationBacklog(planText) {
  const lines = sanitizeText(planText || "").split(/\r?\n/);
  const start = lines.findIndex((line) => /^Implementation backlog\b/i.test(line.trim()));
  if (start === -1) {
    return [];
  }

  const items = [];
  let current = null;
  let implicitNumber = 0;

  for (let index = start + 1; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trim();
    if (!line) {
      continue;
    }
    if (/^(Verification and review flow|Escalation points|Notes)\b/i.test(line)) {
      break;
    }
    const numberedMatch = line.match(/^(\d+)[\)\.]\s+(.+)$/);
    if (numberedMatch) {
      if (current) {
        items.push(finalizeBacklogItem(current));
      }
      current = {
        number: Number(numberedMatch[1]),
        title: numberedMatch[2].trim(),
        lines: [],
      };
      continue;
    }
    if (isImplicitBacklogHeading(lines, index, line)) {
      if (current) {
        items.push(finalizeBacklogItem(current));
      }
      implicitNumber += 1;
      current = {
        number: implicitNumber,
        title: line,
        lines: [],
      };
      continue;
    }
    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    items.push(finalizeBacklogItem(current));
  }

  return items.filter((item) => item.title);
}

function isImplicitBacklogHeading(lines, index, line) {
  if (!line || line.startsWith("-")) {
    return false;
  }

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const next = sanitizeText(lines[cursor]).trim();
    if (!next) {
      continue;
    }
    if (/^(Verification and review flow|Escalation points|Notes)\b/i.test(next)) {
      return false;
    }
    return /^-\s*(Action|Files|Verify|Verification):/i.test(next);
  }

  return false;
}

function finalizeBacklogItem(item) {
  const action = findDetail(item.lines, ["- Action:", "- Description:"]);
  const files = findDetail(item.lines, ["- Files:", "Files:"]);
  const verification = findDetail(item.lines, ["- Verify:", "- Verification:"]);

  return {
    number: item.number,
    title: item.title,
    action,
    files,
    verification,
    lines: item.lines.slice(),
  };
}

function findDetail(lines, prefixes) {
  for (const line of lines) {
    for (const prefix of prefixes) {
      if (line.startsWith(prefix)) {
        return line.slice(prefix.length).trim();
      }
    }
  }
  return "";
}

function parseSelectedItems(value) {
  return String(value || "")
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
}

function buildExecutionTask(planningTask, backlogItem) {
  const projectName = sanitizeText(planningTask.title).replace(/\s*-\s*Project Intake\s*$/i, "").trim();
  const backlogTag = String(backlogItem.number).padStart(2, "0");
  const taskId = sanitizeFileName(
    `${projectName.toLowerCase()}-exec-${backlogTag}-${backlogItem.title.toLowerCase()}`,
  );
  const subsystemName = `${projectName}: ${backlogItem.title}`;
  const targetFiles = backlogItem.files || "See approved backlog item.";
  const risk = inferExecutionRisk(backlogItem);
  const constraints = [
    "- Execute only this bounded backlog item.",
    "- Do not broaden scope beyond the approved planning task.",
    "- All file writes must occur in \"E:\\Mobiledets\".",
    "- Local file writes inside the approved path are allowed only for this approved task.",
    "- Do not run git init, git add, git commit, git push, create branches, or open PRs unless the task explicitly authorizes version-control actions.",
    "- Do not invent secrets, credentials, legal text, or production-only values.",
    "- Escalate if blocked by calendar method, dashboard scope, missing real assets, or missing deployment credentials.",
    "- Respect the Notion review and local mirror flow before any deploy.",
  ].join("\n");

  return normalizeTask({
    task_id: taskId,
    title: `${projectName} - ${backlogItem.title}`,
    planning_only: false,
    status: STATUS.DRAFT,
    route_target: "Architect/GPT",
    decision: null,
    risk,
    needs_approval: true,
    execution_allowed: false,
    trigger_reason: `Approved planning backlog item ${backlogItem.number} from ${planningTask.task_id}`,
    operator_notes: [
      `Generated from approved planning task ${planningTask.task_id}.`,
      `Backlog item ${backlogItem.number}: ${backlogItem.title}.`,
    ].join("\n"),
    revised_instructions: "",
    sync_status: "Not Synced",
    workflow_stage: STAGE.TASK_INTAKE,
    attempt_count: 1,
    stage_retry_count: 0,
    current_prompt_template: STANDARD_EXECUTION_TEMPLATE,
    approval_gate: APPROVAL_GATE.PROMPT,
    metadata: {
      project: (planningTask.metadata && planningTask.metadata.project) || "OS-V1",
      owner: "Execution Order Generator",
      task_type: "implementation",
      source_task_id: planningTask.task_id,
    },
    body: {
      summary: `${backlogItem.title}: ${backlogItem.action || "Implement the approved backlog item."}`,
      full_context: [
        `Source planning task: ${planningTask.title} (${planningTask.task_id})`,
        "",
        "Approved project summary:",
        planningTask.body.summary || "",
        "",
        "Bounded backlog item:",
        `${backlogItem.number}) ${backlogItem.title}`,
        backlogItem.action ? `Action: ${backlogItem.action}` : "",
        backlogItem.files ? `Files: ${backlogItem.files}` : "",
        backlogItem.verification ? `Verification: ${backlogItem.verification}` : "",
      ].filter(Boolean).join("\n"),
      proposed_action: [
        `Implement backlog item ${backlogItem.number}: ${backlogItem.title}.`,
        backlogItem.action || "Make the smallest coherent change set required by the approved plan.",
        `Expected file footprint: ${targetFiles}`,
      ].join("\n"),
      why_this_was_triggered: `This execution order was generated from the approved planning backlog for ${projectName}.`,
      risk_assessment: `${risk}. Narrow execution task generated from an approved plan.`,
      suggested_route:
        "Architect/GPT using the Standard execution prompt, then bounded local execution after approval.",
      affected_components: targetFiles,
      constraints_guardrails: constraints,
      operator_notes: [
        `Source plan URL: ${planningTask.notion_url || ""}`,
        `Backlog item ${backlogItem.number} selected for execution.`,
      ].filter(Boolean).join("\n"),
    },
  });
}

function inferExecutionRisk(backlogItem) {
  const text = `${backlogItem.title} ${backlogItem.action} ${backlogItem.files}`.toLowerCase();
  if (/(mongodb|api|route|db|deploy|vercel|auth|email|calendar)/.test(text)) {
    return "Medium";
  }
  return "Low";
}

function buildInitialPageBlocks(task) {
  const sections = getSectionDefinitions();
  const children = [];
  for (const section of sections) {
    const content = sanitizeText(task.body[section.key]).trim();
    if (!content) {
      continue;
    }
    children.push(headingBlock(section.heading));
    for (const paragraph of splitParagraphs(content)) {
      children.push(paragraphBlock(paragraph));
    }
  }
  return children;
}

function headingBlock(text) {
  return {
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: buildRichText(sanitizeText(text)),
    },
  };
}

function paragraphBlock(text) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: buildRichText(sanitizeText(text)),
    },
  };
}

function splitParagraphs(content) {
  return sanitizeText(content)
    .split(/\r?\n\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildRichText(text) {
  const clean = sanitizeText(text).trim();
  if (!clean) {
    return [];
  }
  return splitText(clean, 1800).map((chunk) => ({
    type: "text",
    text: { content: chunk },
  }));
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

async function notionApi(pathname, body) {
  const response = await fetch(`https://api.notion.com/v1/${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Notion ${pathname} failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function notionGet(pathname) {
  const response = await fetch(`https://api.notion.com/v1/${pathname}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Notion ${pathname} failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

function buildCreatePropertiesPayload(task, properties) {
  const updates = {};
  const titlePropertyName = properties.Title ? "Title" : properties.Name ? "Name" : null;

  if (titlePropertyName) {
    updates[titlePropertyName] = {
      title: buildRichText(task.title || task.task_id),
    };
  }

  assignCreateProperty(updates, properties, "Task ID", task.task_id);
  assignCreateProperty(updates, properties, "Status", task.status);
  assignCreateProperty(updates, properties, "Route Target", task.route_target);
  assignCreateProperty(updates, properties, "Risk", task.risk);
  assignCreateProperty(updates, properties, "Needs Approval", task.needs_approval);
  assignCreateProperty(updates, properties, "Execution Allowed", task.execution_allowed);
  assignCreateProperty(updates, properties, "Trigger Reason", task.trigger_reason);
  assignCreateProperty(updates, properties, "Operator Notes", task.operator_notes);
  assignCreateProperty(updates, properties, "Revised Instructions", task.revised_instructions);
  assignCreateProperty(updates, properties, "Sync Status", task.sync_status);
  assignCreateProperty(updates, properties, "Workflow Stage", task.workflow_stage);
  assignCreateProperty(updates, properties, "Attempt Count", task.attempt_count);
  assignCreateProperty(updates, properties, "Stage Retry Count", task.stage_retry_count);
  assignCreateProperty(updates, properties, "Current Prompt Template", task.current_prompt_template);
  assignCreateProperty(updates, properties, "Approval Gate", task.approval_gate);

  return updates;
}

function assignCreateProperty(target, properties, name, value) {
  const prop = properties[name];
  if (!prop) {
    return;
  }
  const clean = sanitizeText(value).trim();
  switch (prop.type) {
    case "title":
      target[name] = { title: buildRichText(clean) };
      return;
    case "rich_text":
      target[name] = { rich_text: buildRichText(clean) };
      return;
    case "select":
      if (clean) {
        target[name] = { select: { name: clean } };
      }
      return;
    case "status":
      if (clean) {
        target[name] = { status: { name: clean } };
      }
      return;
    case "checkbox":
      target[name] = { checkbox: Boolean(value) };
      return;
    case "number":
      if (Number.isFinite(Number(value))) {
        target[name] = { number: Number(value) };
      }
      return;
    case "url":
      target[name] = { url: clean || null };
      return;
    default:
      return;
  }
}

function readArg(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return "";
  }
  return args[index + 1] || "";
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
