#!/usr/bin/env node

const fs = require("fs");
const {
  APPROVAL_GATE,
  STAGE,
  VERDICT,
  sanitizeText,
  writeArtifact,
} = require("./reviews-approvals-workflow-v1");

const PROMPT_REQUIRED_FRAGMENTS = [
  "Task Summary:",
  "Constraints / Guardrails:",
  "Machine Task JSON:",
  "Template Body:",
];

const ACTION_PLAN_REQUIRED_FRAGMENTS = [
  "Action Plan:",
  "Verification:",
  "GPT Plan Reference:",
];

function validateWorkflowArtifact(task, mode, text) {
  if (mode === APPROVAL_GATE.PROMPT) {
    return validatePromptPackage(task, text);
  }
  if (mode === APPROVAL_GATE.ACTION_PLAN) {
    return validateActionPlan(task, text);
  }
  throw new Error(`Unsupported librarian mode: ${mode}`);
}

function validatePromptPackage(task, text) {
  const value = sanitizeText(text).trim();
  const failedChecks = [];
  const requiredChanges = [];

  if (!value) {
    return verdict(
      task,
      APPROVAL_GATE.PROMPT,
      VERDICT.FAIL_TERMINAL,
      "prompt_empty",
      "Prompt package is empty.",
      "The prompt package file contains no content.",
      ["Prompt package text missing."],
      ["Rebuild the prompt package before resubmitting."],
      false,
      true,
    );
  }

  for (const fragment of PROMPT_REQUIRED_FRAGMENTS) {
    if (!value.includes(fragment)) {
      failedChecks.push(`Missing prompt package section: ${fragment}`);
      requiredChanges.push(`Add the ${fragment.replace(":", "")} section.`);
    }
  }

  if (!value.includes("project_id")) {
    failedChecks.push("Machine task JSON does not include project_id.");
    requiredChanges.push("Include project_id in the machine task JSON.");
  }
  if (!value.includes("Constraints / Guardrails")) {
    failedChecks.push("Prompt package missing constraint section required by OS-V1-HANDOFF.md.");
    requiredChanges.push("Add explicit constraints and guardrails from the handoff contract.");
  }

  if (failedChecks.length === 0) {
    return verdict(
      task,
      APPROVAL_GATE.PROMPT,
      VERDICT.PASS,
      "prompt_valid",
      "Prompt package passed Librarian validation.",
      "All required prompt-package sections and guardrails are present.",
      [],
      [],
      false,
      false,
    );
  }

  const shouldEscalate = task.stage_retry_count >= 3;
  return verdict(
    task,
    APPROVAL_GATE.PROMPT,
    shouldEscalate ? VERDICT.ESCALATE_OPERATOR : VERDICT.RETRY,
    "prompt_guardrail_violation",
    "Prompt package is missing required structure or guardrails.",
    failedChecks[0],
    failedChecks,
    requiredChanges,
    !shouldEscalate,
    shouldEscalate,
  );
}

function validateActionPlan(task, text) {
  const value = sanitizeText(text).trim();
  const failedChecks = [];
  const requiredChanges = [];

  if (!value) {
    return verdict(
      task,
      APPROVAL_GATE.ACTION_PLAN,
      VERDICT.FAIL_TERMINAL,
      "action_plan_empty",
      "Action plan is empty.",
      "The Qwen action plan file contains no content.",
      ["Action plan text missing."],
      ["Rebuild the action plan before resubmitting."],
      false,
      true,
    );
  }

  for (const fragment of ACTION_PLAN_REQUIRED_FRAGMENTS) {
    if (!value.includes(fragment)) {
      failedChecks.push(`Missing action-plan section: ${fragment}`);
      requiredChanges.push(`Add the ${fragment.replace(":", "")} section.`);
    }
  }

  if (!/verification/i.test(value)) {
    failedChecks.push(
      "Qwen action plan omits verification step required by post-write-verification-plan-v1.md.",
    );
    requiredChanges.push("Add an explicit verification step to the action plan.");
  }

  if (/broad refactor|architecture redesign|approval redesign/i.test(value)) {
    failedChecks.push("GPT plan proposes work outside the bounded workflow scope.");
    requiredChanges.push("Reduce the plan to the smallest bounded task scope.");
  }

  if (failedChecks.length === 0) {
    return verdict(
      task,
      APPROVAL_GATE.ACTION_PLAN,
      VERDICT.PASS,
      "action_plan_valid",
      "Action plan passed Librarian validation.",
      "The action plan includes execution and verification steps within guardrails.",
      [],
      [],
      false,
      false,
    );
  }

  const shouldEscalate = task.stage_retry_count >= 3;
  return verdict(
    task,
    APPROVAL_GATE.ACTION_PLAN,
    shouldEscalate ? VERDICT.ESCALATE_OPERATOR : VERDICT.RETRY,
    "action_plan_guardrail_violation",
    "Action plan does not satisfy required execution or verification guardrails.",
    failedChecks[0],
    failedChecks,
    requiredChanges,
    !shouldEscalate,
    shouldEscalate,
  );
}

function verdict(
  task,
  gate,
  mode,
  failureCode,
  failureSummary,
  exactProblem,
  failedChecks,
  requiredChanges,
  retryable,
  escalateToOperator,
) {
  const result = {
    verdict: mode,
    failure_code: failureCode,
    failure_summary: failureSummary,
    exact_problem: exactProblem,
    failed_checks: failedChecks,
    required_changes: requiredChanges,
    retryable,
    operator_message: [
      `Why it failed: ${failureSummary}`,
      `What is wrong now: ${exactProblem}`,
      `What Qwen/Librarian already tried: ${failedChecks.length > 0 ? failedChecks.join("; ") : "Initial validation only."}`,
      `What decision or edit is needed from you: ${requiredChanges.length > 0 ? requiredChanges.join("; ") : "No operator change required."}`,
    ].join("\n"),
    workflow_stage:
      gate === APPROVAL_GATE.PROMPT
        ? STAGE.LIBRARIAN_PROMPT_VALIDATION
        : STAGE.LIBRARIAN_ACTION_PLAN_VALIDATION,
    approval_gate: gate,
    escalate_to_operator: escalateToOperator,
  };

  const fileName =
    gate === APPROVAL_GATE.PROMPT
      ? "librarian-prompt-check.json"
      : "librarian-action-plan-check.json";
  writeArtifact(task, fileName, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

async function main() {
  const taskPath = process.argv[2];
  const mode = process.argv[3];
  const inputPath = process.argv[4];
  if (!taskPath || !mode || !inputPath) {
    console.error(
      "Usage: node scripts/executor-librarian-v1.js <task-json-path> <prompt|action_plan> <artifact-path>",
    );
    process.exit(1);
  }

  const task = JSON.parse(fs.readFileSync(taskPath, "utf8"));
  const text = fs.readFileSync(inputPath, "utf8");
  const result = validateWorkflowArtifact(task, mode, text);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Librarian validation failed: ${sanitizeText(error.message)}`);
    process.exit(1);
  });
}

module.exports = { validateWorkflowArtifact };
