#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TASK_ARTIFACTS_DIR = path.join(ROOT, "runtime", "task-artifacts");
const NOTION_SYNC_STATE_PATH = path.join(
  ROOT,
  "runtime",
  "logs",
  "notion-review-sync-state.v1.json",
);

const STATUS = Object.freeze({
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending Review",
  APPROVED: "Approved",
  DENIED: "Denied",
  NEEDS_EDIT: "Needs Edit",
  PROCESSING: "Processing",
  RETRYING: "Retrying",
  ESCALATED: "Escalated",
  FAILED: "Failed",
  EXECUTED: "Executed",
  ARCHIVED: "Archived",
  COMPLETED: "Completed",
});

const STAGE = Object.freeze({
  TASK_INTAKE: "Task Intake",
  PROMPT_PACKAGE_ASSEMBLY: "Prompt Package Assembly",
  PROMPT_APPROVAL: "Prompt Approval",
  LIBRARIAN_PROMPT_VALIDATION: "Librarian Prompt Validation",
  ARCHITECT_GPT_PLANNING: "Architect/GPT Planning",
  QWEN_ACTION_PLAN_DRAFT: "Qwen Action Plan Draft",
  ACTION_PLAN_APPROVAL: "Action Plan Approval",
  LIBRARIAN_ACTION_PLAN_VALIDATION: "Librarian Action Plan Validation",
  QWEN_EXECUTION: "Qwen Execution",
  POST_EXECUTION_VERIFICATION: "Post-Execution Verification",
  ESCALATED_TO_OPERATOR: "Escalated To Operator",
  COMPLETED: "Completed",
});

const APPROVAL_GATE = Object.freeze({
  PROMPT: "prompt",
  ACTION_PLAN: "action_plan",
});

const VERDICT = Object.freeze({
  PASS: "pass",
  RETRY: "retry",
  ESCALATE_OPERATOR: "escalate_operator",
  FAIL_TERMINAL: "fail_terminal",
});

const ROUTE_TARGET_ALIAS = Object.freeze({
  Codex: "Architect/GPT",
  "Architect/GPT": "Architect/GPT",
  GPT: "Architect/GPT",
  Local: "Local",
  Claude: "Claude",
});

const DEFAULT_PROMPT_TEMPLATE = "Alignment review / planning prompt";

const BODY_SECTIONS = Object.freeze([
  { key: "summary", heading: "Summary", aliases: ["summary"] },
  {
    key: "full_context",
    heading: "Full Context",
    aliases: ["fullcontext"],
  },
  {
    key: "proposed_action",
    heading: "Proposed Action",
    aliases: ["proposedaction"],
  },
  {
    key: "why_this_was_triggered",
    heading: "Why This Was Triggered",
    aliases: ["whythiswastriggered"],
  },
  {
    key: "risk_assessment",
    heading: "Risk Assessment",
    aliases: ["riskassessment"],
  },
  {
    key: "suggested_route",
    heading: "Suggested Route",
    aliases: ["suggestedroute"],
  },
  {
    key: "affected_components",
    heading: "Affected Components",
    aliases: ["affectedcomponents"],
  },
  {
    key: "constraints_guardrails",
    heading: "Constraints / Guardrails",
    aliases: ["constraintsguardrails", "constraints", "guardrails"],
  },
  {
    key: "machine_task_json",
    heading: "Machine Task JSON",
    aliases: ["machinetaskjson"],
  },
  {
    key: "prompt_template_selection",
    heading: "Prompt Template Selection",
    aliases: ["prompttemplateselection"],
  },
  {
    key: "prompt_package_for_approval",
    heading: "Prompt Package For Approval",
    aliases: ["promptpackageforapproval"],
  },
  {
    key: "librarian_validation_notes",
    heading: "Librarian Validation Notes",
    aliases: ["librarianvalidationnotes"],
  },
  {
    key: "gpt_plan",
    heading: "GPT Plan",
    aliases: ["gptplan"],
  },
  {
    key: "qwen_action_plan_for_approval",
    heading: "Qwen Action Plan For Approval",
    aliases: ["qwenactionplanforapproval"],
  },
  {
    key: "failure_report",
    heading: "Failure Report",
    aliases: ["failurereport"],
  },
  {
    key: "attempt_history",
    heading: "Attempt History",
    aliases: ["attempthistory"],
  },
  {
    key: "operator_notes",
    heading: "Operator Notes",
    aliases: ["operatornotes"],
  },
  {
    key: "revised_instructions",
    heading: "Revised Instructions",
    aliases: ["revisedinstructions"],
  },
  {
    key: "escalation_notes",
    heading: "Escalation Notes",
    aliases: ["escalationnotes"],
  },
  {
    key: "final_outcome",
    heading: "Final Outcome",
    aliases: ["finaloutcome"],
  },
]);

const BODY_SECTION_MAP = new Map(
  BODY_SECTIONS.flatMap((section) =>
    [section.heading, ...(section.aliases || [])].map((label) => [
      normalizeHeading(label),
      section.key,
    ]),
  ),
);

function normalizeHeading(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
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
    );
}

function createEmptyBody() {
  return BODY_SECTIONS.reduce((acc, section) => {
    acc[section.key] = "";
    return acc;
  }, {});
}

function normalizeRouteTarget(value) {
  const text = sanitizeText(value).trim();
  if (!text) {
    return "Architect/GPT";
  }
  return ROUTE_TARGET_ALIAS[text] || text;
}

function normalizeTask(task) {
  const body = {
    ...createEmptyBody(),
    ...sanitizeValue(task && task.body ? task.body : {}),
  };
  const normalized = {
    ...sanitizeValue(task || {}),
    body,
    route_target: normalizeRouteTarget(task && task.route_target),
    status: sanitizeText((task && task.status) || STATUS.DRAFT) || STATUS.DRAFT,
    workflow_stage:
      sanitizeText((task && task.workflow_stage) || inferWorkflowStage(task)) ||
      STAGE.TASK_INTAKE,
    approval_gate: sanitizeApprovalGate(task && task.approval_gate),
    attempt_count: normalizeNumber(task && task.attempt_count, 1),
    stage_retry_count: normalizeNumber(task && task.stage_retry_count, 0),
    last_failure_stage: sanitizeText(task && task.last_failure_stage),
    last_failure_actor: sanitizeText(task && task.last_failure_actor),
    last_failure_code: sanitizeText(task && task.last_failure_code),
    last_failure_summary: sanitizeText(task && task.last_failure_summary),
    escalation_reason: sanitizeText(task && task.escalation_reason),
    current_prompt_template:
      sanitizeText(task && task.current_prompt_template) || DEFAULT_PROMPT_TEMPLATE,
    sync_status: sanitizeText((task && task.sync_status) || "Synced") || "Synced",
    artifacts:
      task && task.artifacts && typeof task.artifacts === "object"
        ? sanitizeValue(task.artifacts)
        : {},
    metadata:
      task && task.metadata && typeof task.metadata === "object"
        ? sanitizeValue(task.metadata)
        : {},
  };
  return normalized;
}

function inferWorkflowStage(task) {
  const status = sanitizeText(task && task.status);
  if (status === STATUS.PENDING_REVIEW) {
    if (sanitizeApprovalGate(task && task.approval_gate) === APPROVAL_GATE.ACTION_PLAN) {
      return STAGE.ACTION_PLAN_APPROVAL;
    }
    return STAGE.PROMPT_APPROVAL;
  }
  if (status === STATUS.APPROVED) {
    if (sanitizeApprovalGate(task && task.approval_gate) === APPROVAL_GATE.ACTION_PLAN) {
      return STAGE.ACTION_PLAN_APPROVAL;
    }
    return STAGE.PROMPT_APPROVAL;
  }
  if (status === STATUS.COMPLETED) {
    return STAGE.COMPLETED;
  }
  return STAGE.TASK_INTAKE;
}

function sanitizeApprovalGate(value) {
  const text = sanitizeText(value).trim().toLowerCase();
  if (text === APPROVAL_GATE.PROMPT) {
    return APPROVAL_GATE.PROMPT;
  }
  if (text === APPROVAL_GATE.ACTION_PLAN) {
    return APPROVAL_GATE.ACTION_PLAN;
  }
  return null;
}

function normalizeNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
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

function getBodySectionKey(heading) {
  return BODY_SECTION_MAP.get(normalizeHeading(heading)) || null;
}

function getBodySectionHeading(key) {
  const section = BODY_SECTIONS.find((entry) => entry.key === key);
  return section ? section.heading : key;
}

function readJsonFile(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(sanitizeValue(value), null, 2)}\n`,
    "utf8",
  );
}

function getTaskArtifactDir(task) {
  return path.join(
    TASK_ARTIFACTS_DIR,
    sanitizeFilePart(task.task_id || "unknown-task"),
    `attempt-${normalizeNumber(task.attempt_count, 1)}`,
  );
}

function sanitizeFilePart(value) {
  return String(value || "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

function writeArtifact(task, fileName, content) {
  const dir = getTaskArtifactDir(task);
  fs.mkdirSync(dir, { recursive: true });
  const artifactPath = path.join(dir, fileName);
  fs.writeFileSync(artifactPath, content, "utf8");
  if (!task.artifacts || typeof task.artifacts !== "object") {
    task.artifacts = {};
  }
  task.artifacts[fileName] = artifactPath;
  return artifactPath;
}

function buildMachineTask(task) {
  const constraints = deriveConstraints(task);
  const guardrails = deriveGuardrails(task);
  return sanitizeValue({
    task_id: task.task_id,
    title: task.title,
    planning_only: Boolean(task.planning_only),
    project_id:
      (task.metadata && task.metadata.project) ||
      process.env.DEFAULT_PROJECT_ID ||
      "OS-V1",
    route_target: normalizeRouteTarget(task.route_target),
    risk: task.risk || "Medium",
    summary: task.body.summary || task.title || "",
    full_context: task.body.full_context || "",
    proposed_action: task.body.proposed_action || "",
    trigger_reason: task.trigger_reason || task.body.why_this_was_triggered || "",
    constraints,
    guardrails,
    revised_instructions:
      task.revised_instructions || task.body.revised_instructions || "",
    affected_components: task.body.affected_components || "",
    operator_notes: task.operator_notes || task.body.operator_notes || "",
    current_prompt_template: task.current_prompt_template || DEFAULT_PROMPT_TEMPLATE,
    workflow_stage: task.workflow_stage || STAGE.TASK_INTAKE,
    approval_gate: task.approval_gate || APPROVAL_GATE.PROMPT,
  });
}

function deriveConstraints(task) {
  const values = [
    task.body.constraints_guardrails,
    task.revised_instructions,
    task.body.revised_instructions,
    task.operator_notes,
    task.body.operator_notes,
  ]
    .map((entry) => sanitizeText(entry).trim())
    .filter(Boolean);
  return dedupeStrings(
    [
      "Keep outputs concise, direct, and machine-usable.",
      "Do not bypass Notion review or the local mirror.",
      ...values,
    ].filter(Boolean),
  );
}

function deriveGuardrails(task) {
  const values = [
    task.body.constraints_guardrails,
    task.body.risk_assessment,
    task.body.affected_components,
  ]
    .map((entry) => sanitizeText(entry).trim())
    .filter(Boolean);
  return dedupeStrings(
    [
      "Cloud planning does not authorize direct repo writes.",
      "Any retry or escalation must explain the exact blocker.",
      ...values,
    ].filter(Boolean),
  );
}

function dedupeStrings(items) {
  return [...new Set(items.map((item) => sanitizeText(item).trim()).filter(Boolean))];
}

function renderBulletList(items) {
  const values = items
    .map((item) => sanitizeText(item).trim())
    .filter(Boolean)
    .map((item) => `- ${item}`);
  return values.length > 0 ? values.join("\n") : "- none";
}

function buildPromptPackage(task, templateBody, machineTask) {
  const revisedInstructions = sanitizeText(
    task.revised_instructions || task.body.revised_instructions || "",
  ).trim();
  return [
    `Template: ${task.current_prompt_template || DEFAULT_PROMPT_TEMPLATE}`,
    "",
    "Task Summary:",
    sanitizeText(task.body.summary || task.title || ""),
    revisedInstructions
      ? ["", "Critical Operator Overrides:", revisedInstructions].join("\n")
      : "",
    "",
    "Constraints / Guardrails:",
    renderBulletList([...deriveConstraints(task), ...deriveGuardrails(task)]),
    "",
    "Machine Task JSON:",
    JSON.stringify(machineTask, null, 2),
    "",
    "Template Body:",
    sanitizeText(templateBody || "").trim(),
  ]
    .join("\n")
    .trim();
}

function buildActionPlan(task, gptPlanText) {
  const lines = [
    `Task: ${sanitizeText(task.title || task.task_id)}`,
    "Execution Owner: Qwen",
    "Execution Mode: Local bounded execution",
    "",
    "Action Plan:",
    "1. Re-read the task page, constraints, and the validated GPT plan.",
    "2. Execute only the bounded work required by the approved task.",
    "3. Stop and escalate immediately if execution would widen scope or violate guardrails.",
    "4. Record exact outputs, blockers, and verification notes back into the task artifacts.",
    "",
    "Verification:",
    "- Confirm the intended artifact or outcome exists.",
    "- Run the narrowest relevant verification step available.",
    "- Report exact failure details if verification does not pass.",
    "",
    "GPT Plan Reference:",
    sanitizeText(gptPlanText || "").trim() || "No GPT plan returned.",
  ];
  return lines.join("\n").trim();
}

function buildFailureReport({
  task,
  workflowStage,
  failingActor,
  failureCode,
  failureSummary,
  exactProblem,
  failedChecks,
  requiredChanges,
  nextOwner,
  retryable,
  escalateToOperator,
}) {
  return sanitizeValue({
    task_id: task.task_id,
    attempt_count: normalizeNumber(task.attempt_count, 1),
    workflow_stage: workflowStage,
    failing_actor: failingActor,
    failure_code: failureCode,
    failure_summary: failureSummary,
    exact_problem: exactProblem,
    failed_checks: Array.isArray(failedChecks) ? failedChecks : [],
    required_changes: Array.isArray(requiredChanges) ? requiredChanges : [],
    next_owner: nextOwner,
    retryable: Boolean(retryable),
    escalate_to_operator: Boolean(escalateToOperator),
  });
}

function applyFailureReport(task, report, options = {}) {
  const failureText = formatFailureReportText(report);
  task.last_failure_stage = sanitizeText(report.workflow_stage);
  task.last_failure_actor = sanitizeText(report.failing_actor);
  task.last_failure_code = sanitizeText(report.failure_code);
  task.last_failure_summary = sanitizeText(report.failure_summary);
  task.body.failure_report = failureText;
  if (options.validationNotes) {
    task.body.librarian_validation_notes = sanitizeText(options.validationNotes);
  }
  appendAttemptHistory(
    task,
    `${report.workflow_stage} / ${report.failing_actor}: ${report.failure_summary}`,
  );
  writeArtifact(task, "failure-report.json", `${JSON.stringify(report, null, 2)}\n`);
  return task;
}

function formatFailureReportText(report) {
  return [
    `Why it failed: ${sanitizeText(report.failure_summary)}`,
    `What is wrong now: ${sanitizeText(report.exact_problem)}`,
    `Failed stage: ${sanitizeText(report.workflow_stage)}`,
    `Failed actor: ${sanitizeText(report.failing_actor)}`,
    `Failure code: ${sanitizeText(report.failure_code)}`,
    `What Qwen/Librarian already tried: ${renderBulletList(report.failed_checks || [])}`,
    `What decision or edit is needed from you: ${renderBulletList(report.required_changes || [])}`,
    `Can the authoring AI retry without operator help: ${report.retryable ? "yes" : "no"}`,
  ].join("\n");
}

function appendAttemptHistory(task, entry) {
  const timestamp = new Date().toISOString();
  const line = `- [${timestamp}] ${sanitizeText(entry)}`;
  task.body.attempt_history = task.body.attempt_history
    ? `${task.body.attempt_history}\n${line}`
    : line;
  return task.body.attempt_history;
}

function clearFailureState(task) {
  task.stage_retry_count = 0;
  task.last_failure_stage = "";
  task.last_failure_actor = "";
  task.last_failure_code = "";
  task.last_failure_summary = "";
  task.escalation_reason = "";
  task.body.failure_report = "";
  task.body.escalation_notes = "";
  return task;
}

function isTerminalStatus(status) {
  return [STATUS.COMPLETED, STATUS.DENIED, STATUS.ARCHIVED].includes(
    sanitizeText(status),
  );
}

function readNotionSyncState() {
  return readJsonFile(NOTION_SYNC_STATE_PATH, { version: "v1", pages: {} });
}

function writeNotionSyncState(state) {
  writeJsonFile(NOTION_SYNC_STATE_PATH, {
    version: "v1",
    pages: (state && state.pages) || {},
  });
}

function updateNotionSyncState(pageId, lastEditedTime, fingerprint = "") {
  if (!pageId || !lastEditedTime) {
    return;
  }
  const state = readNotionSyncState();
  state.pages[pageId] = {
    last_edited_time: sanitizeText(lastEditedTime),
    fingerprint: sanitizeText(fingerprint),
    updated_at: new Date().toISOString(),
  };
  writeNotionSyncState(state);
}

function shouldQueueNotionPage(page) {
  const props = (page && page.properties) || {};
  const statusValue = getPropValue(props, "Status");
  const syncStatus = getPropValue(props, "Sync Status");
  if (syncStatus === "Ignore") {
    return false;
  }
  if (statusValue === STATUS.ARCHIVED) {
    return false;
  }
  return true;
}

function getPropValue(props, name) {
  const prop = props[name];
  if (!prop) return "";
  if (prop.type === "title") {
    return (prop.title || []).map((entry) => entry.plain_text).join("");
  }
  if (prop.type === "rich_text") {
    return (prop.rich_text || []).map((entry) => entry.plain_text).join("");
  }
  if (prop.type === "select") {
    return prop.select ? prop.select.name : "";
  }
  if (prop.type === "status") {
    return prop.status ? prop.status.name : "";
  }
  if (prop.type === "number") {
    return prop.number != null ? String(prop.number) : "";
  }
  if (prop.type === "checkbox") {
    return prop.checkbox ? "true" : "false";
  }
  if (prop.type === "url") {
    return prop.url || "";
  }
  return prop[prop.type] || "";
}

function getPropCheckbox(props, name) {
  const prop = props[name];
  return Boolean(prop && prop.type === "checkbox" && prop.checkbox);
}

function getSectionDefinitions() {
  return BODY_SECTIONS.slice();
}

module.exports = {
  ROOT,
  STATUS,
  STAGE,
  APPROVAL_GATE,
  VERDICT,
  BODY_SECTIONS,
  DEFAULT_PROMPT_TEMPLATE,
  NOTION_SYNC_STATE_PATH,
  normalizeHeading,
  normalizeTask,
  normalizeRouteTarget,
  createEmptyBody,
  getBodySectionKey,
  getBodySectionHeading,
  buildMachineTask,
  buildPromptPackage,
  buildActionPlan,
  buildFailureReport,
  applyFailureReport,
  appendAttemptHistory,
  clearFailureState,
  isTerminalStatus,
  sanitizeText,
  sanitizeValue,
  writeJsonFile,
  readJsonFile,
  writeArtifact,
  getTaskArtifactDir,
  readNotionSyncState,
  writeNotionSyncState,
  updateNotionSyncState,
  shouldQueueNotionPage,
  getPropValue,
  getPropCheckbox,
  getSectionDefinitions,
};
