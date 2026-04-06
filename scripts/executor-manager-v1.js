#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  STATUS,
  STAGE,
  APPROVAL_GATE,
  VERDICT,
  DEFAULT_PROMPT_TEMPLATE,
  normalizeTask,
  buildMachineTask,
  buildPromptPackage,
  buildActionPlan,
  buildFailureReport,
  applyFailureReport,
  appendAttemptHistory,
  clearFailureState,
  sanitizeText,
  writeJsonFile,
  writeArtifact,
  isTerminalStatus,
  getTaskArtifactDir,
} = require("./reviews-approvals-workflow-v1");
const { syncTaskToNotion } = require("./executor-notion-bridge-v1");
const { validateWorkflowArtifact } = require("./executor-librarian-v1");
const { generateArchitectPlan } = require("./executor-codex-v1");
const { sendTelegramNotification } = require("./send-telegram-notification-v1");
const { getTemplateByName } = require("./get-prompt-template-v1");

const ROOT = path.resolve(__dirname, "..");
const QUEUE_DIR = path.join(ROOT, "runtime", "queue");
const COMPLETED_DIR = path.join(ROOT, "runtime", "completed");
const LOG_DIR = path.join(ROOT, "runtime", "logs");
const LOG_PATH = path.join(LOG_DIR, "executor-manager-v1.log");
const QWEN_EXECUTOR_CONTRACT_PATH = path.join(ROOT, "docs", "qwen-os-executor-contract-v1.md");
const GENERATE_EXECUTION_ORDERS_SCRIPT = path.join(
  ROOT,
  "scripts",
  "generate-execution-orders-from-plan-v1.js",
);
const POLL_MS = 10_000;
const OLLAMA_TIMEOUT_MS = 240_000;
const CLAUDE_TIMEOUT_MS = 300_000;
const LOCAL_WRITE_TIMEOUT_MS = 300_000;
const EXECUTION_RETRY_LIMITS = Object.freeze({
  execution_scope_self_check_invalid_json: 3,
  execution_scope_self_check_failed: 2,
  execution_runtime_error: 5,
  execution_invalid_json: 5,
  execution_missing_outcome: 4,
  verification_missing_artifacts: 2,
  verification_missing_expected_files: 4,
  verification_missing_outcome: 2,
  verification_review_only_outcome: 3,
  verification_insufficient_evidence: 3,
  default: 1,
});
const runOnce = process.argv.includes("--once");
let cachedQwenExecutorContract = null;

main().catch((error) => {
  log(`Manager startup failed: ${sanitizeText(error.stack || error.message)}`, "ERROR");
  process.exit(1);
});

async function main() {
  fs.mkdirSync(QUEUE_DIR, { recursive: true });
  fs.mkdirSync(COMPLETED_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  log(`Watching ${QUEUE_DIR} for task JSON files every ${POLL_MS / 1000} seconds.`);
  await runCycle();
}

async function runCycle() {
  try {
    const files = listQueueJsonFiles();
    if (files.length === 0) {
      log("No queued task JSON files found.");
    }
    for (const filePath of files) {
      await processTaskFile(filePath);
    }
  } catch (error) {
    log(`Manager cycle failed: ${sanitizeText(error.stack || error.message)}`, "ERROR");
  }

  if (!runOnce) {
    setTimeout(() => {
      runCycle().catch((error) => {
        log(`Manager cycle failed: ${sanitizeText(error.stack || error.message)}`, "ERROR");
      });
    }, POLL_MS);
  }
}

async function processTaskFile(taskPath) {
  const taskLabel = path.basename(taskPath);
  let task = normalizeTask(readTask(taskPath));
  let touched = false;

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const result = await advanceTask(task, taskPath);
    if (!result.changed) {
      break;
    }
    touched = true;
    writeJsonFile(taskPath, task);

    if (task.notion_page_id) {
      await syncTaskToNotion(task);
      writeJsonFile(taskPath, task);
    }

    if (result.notifyOperator) {
      try {
        await sendTelegramNotification(task, result.notifyReason || "");
      } catch (error) {
        log(`Telegram notification failed for ${task.task_id}: ${sanitizeText(error.message)}`, "WARN");
      }
    }

    if (result.stop) {
      break;
    }
  }

  if (sanitizeText(task.status).trim() === STATUS.COMPLETED && !isValidCompletedTaskState(task)) {
    repairInvalidCompletedTaskState(task);
    touched = true;
    writeJsonFile(taskPath, task);

    if (task.notion_page_id) {
      await syncTaskToNotion(task);
      writeJsonFile(taskPath, task);
    }
  }

  if (!touched) {
    log(`No workflow action required for ${taskLabel}.`);
  }

  if (isTerminalStatus(task.status)) {
    maybeGenerateNextExecutionOrder(task);
    moveTaskToCompleted(taskPath);
  }
}

async function advanceTask(task, taskPath) {
  if (isTerminalStatus(task.status)) {
    return { changed: false, stop: true };
  }

  if (task.status === STATUS.DENIED) {
    task.sync_status = "Not Synced";
    return { changed: true, stop: true, notifyOperator: true, notifyReason: "Task denied." };
  }

  if (task.workflow_stage === STAGE.ESCALATED_TO_OPERATOR) {
    return handleOperatorEscalation(task);
  }

  if (shouldPreparePromptPackage(task)) {
    preparePromptPackage(task);
    return {
      changed: true,
      stop: true,
      notifyOperator: true,
      notifyReason: "Prompt package ready for approval.",
    };
  }

  if (shouldPrepareActionPlanDraft(task)) {
    prepareActionPlanDraft(task);
    return {
      changed: true,
      stop: true,
      notifyOperator: true,
      notifyReason: "Action plan ready for approval.",
    };
  }

  if (task.status === STATUS.PENDING_REVIEW) {
    const decision = sanitizeText(task.decision).trim().toLowerCase();
    if (decision === "approve") {
      task.status = STATUS.APPROVED;
      task.sync_status = "Synced";
      task.decision = null;
      return { changed: true, stop: false };
    }
    if (decision === "deny") {
      task.status = STATUS.DENIED;
      task.sync_status = "Not Synced";
      task.decision = null;
      return { changed: true, stop: true, notifyOperator: true, notifyReason: "Task denied." };
    }
    if (decision === "modify") {
      task.status = STATUS.NEEDS_EDIT;
      task.sync_status = "Synced";
      task.decision = null;
      appendAttemptHistory(task, "Operator requested modifications during review.");
      return { changed: true, stop: false };
    }
  }

  if (task.status === STATUS.PENDING_REVIEW) {
    return { changed: false, stop: true };
  }

  if (task.status === STATUS.APPROVED && task.workflow_stage === STAGE.PROMPT_APPROVAL) {
    task.status = STATUS.PROCESSING;
    task.sync_status = "Synced";
    task.workflow_stage = STAGE.LIBRARIAN_PROMPT_VALIDATION;
    appendAttemptHistory(task, "Prompt approval received; sent to Librarian for validation.");
    return { changed: true, stop: true };
  }

  if (task.status === STATUS.PROCESSING && task.workflow_stage === STAGE.LIBRARIAN_PROMPT_VALIDATION) {
    const outcome = await runPromptApprovalFlow(task);
    return outcome;
  }

  if (task.status === STATUS.PROCESSING && task.workflow_stage === STAGE.ARCHITECT_GPT_PLANNING) {
    const outcome = await runArchitectPlanningFlow(task);
    return outcome;
  }

  if (task.status === STATUS.APPROVED && task.workflow_stage === STAGE.ACTION_PLAN_APPROVAL) {
    task.status = STATUS.PROCESSING;
    task.sync_status = "Synced";
    task.workflow_stage = STAGE.LIBRARIAN_ACTION_PLAN_VALIDATION;
    appendAttemptHistory(task, "Action-plan approval received; sent to Librarian for validation.");
    return { changed: true, stop: true };
  }

  if (task.status === STATUS.PROCESSING && task.workflow_stage === STAGE.LIBRARIAN_ACTION_PLAN_VALIDATION) {
    const outcome = await runActionPlanApprovalFlow(task);
    return outcome;
  }

  if (task.status === STATUS.RETRYING && task.workflow_stage === STAGE.QWEN_EXECUTION) {
    const outcome = await executeApprovedActionPlan(task, taskPath);
    return outcome;
  }

  if (task.status === STATUS.PROCESSING && task.workflow_stage === STAGE.QWEN_EXECUTION) {
    const outcome = await executeApprovedActionPlan(task, taskPath);
    return outcome;
  }

  return { changed: false, stop: true };
}

function handleOperatorEscalation(task) {
  const decision = sanitizeText(task.decision).trim().toLowerCase();

  if (task.status === STATUS.APPROVED || decision === "approve") {
    const resume = getEscalationResumeState(task);
    clearFailureState(task);
    task.sync_status = "Synced";
    task.status = resume.status;
    task.workflow_stage = resume.workflowStage;
    task.decision = null;
    appendAttemptHistory(task, "Operator approved after escalation.");
    return { changed: true, stop: false };
  }

  if (task.status === STATUS.NEEDS_EDIT || decision === "modify") {
    clearFailureState(task);
    task.sync_status = "Synced";
    task.status = STATUS.RETRYING;
    task.workflow_stage =
      task.approval_gate === APPROVAL_GATE.ACTION_PLAN
        ? STAGE.QWEN_ACTION_PLAN_DRAFT
        : STAGE.PROMPT_PACKAGE_ASSEMBLY;
    task.decision = null;
    appendAttemptHistory(task, "Operator requested edits after escalation.");
    return { changed: true, stop: false };
  }

  if (decision === "deny") {
    task.status = STATUS.DENIED;
    task.sync_status = "Not Synced";
    task.decision = null;
    appendAttemptHistory(task, "Operator denied the task after escalation.");
    return {
      changed: true,
      stop: true,
      notifyOperator: true,
      notifyReason: "Task denied after escalation.",
    };
  }

  if ([STATUS.ESCALATED, STATUS.FAILED].includes(task.status)) {
    return { changed: false, stop: true };
  }

  return { changed: false, stop: true };
}

function getEscalationResumeState(task) {
  switch (task.last_failure_stage) {
    case STAGE.LIBRARIAN_PROMPT_VALIDATION:
      return { status: STATUS.PROCESSING, workflowStage: STAGE.LIBRARIAN_PROMPT_VALIDATION };
    case STAGE.ARCHITECT_GPT_PLANNING:
      return { status: STATUS.PROCESSING, workflowStage: STAGE.ARCHITECT_GPT_PLANNING };
    case STAGE.LIBRARIAN_ACTION_PLAN_VALIDATION:
      return { status: STATUS.PROCESSING, workflowStage: STAGE.LIBRARIAN_ACTION_PLAN_VALIDATION };
    case STAGE.QWEN_EXECUTION:
      return { status: STATUS.PROCESSING, workflowStage: STAGE.QWEN_EXECUTION };
    case STAGE.POST_EXECUTION_VERIFICATION:
      return { status: STATUS.PROCESSING, workflowStage: STAGE.QWEN_EXECUTION };
    default:
      return {
        status: STATUS.APPROVED,
        workflowStage:
          task.approval_gate === APPROVAL_GATE.ACTION_PLAN
            ? STAGE.ACTION_PLAN_APPROVAL
            : STAGE.PROMPT_APPROVAL,
      };
  }
}

function shouldPreparePromptPackage(task) {
  if ([STATUS.DRAFT, STATUS.NEEDS_EDIT].includes(task.status)) {
    return !task.approval_gate || task.approval_gate === APPROVAL_GATE.PROMPT;
  }
  if (task.status === STATUS.RETRYING && task.workflow_stage === STAGE.PROMPT_PACKAGE_ASSEMBLY) {
    return true;
  }
  if (task.workflow_stage === STAGE.TASK_INTAKE) {
    return true;
  }
  return false;
}

function shouldPrepareActionPlanDraft(task) {
  if (task.approval_gate !== APPROVAL_GATE.ACTION_PLAN) {
    return false;
  }
  if (task.status === STATUS.NEEDS_EDIT) {
    return true;
  }
  if (task.status === STATUS.RETRYING && task.workflow_stage === STAGE.QWEN_ACTION_PLAN_DRAFT) {
    return true;
  }
  return false;
}

function preparePromptPackage(task) {
  clearFailureState(task);
  resetWorkflowOutputs(task, "prompt");
  task.current_prompt_template = task.current_prompt_template || DEFAULT_PROMPT_TEMPLATE;
  task.workflow_stage = STAGE.PROMPT_PACKAGE_ASSEMBLY;
  task.sync_status = "Synced";
  task.approval_gate = APPROVAL_GATE.PROMPT;

  const machineTask = buildMachineTask(task);
  const template = getTemplateByName(task.current_prompt_template);
  const templateBody = template ? template.body : "";
  const promptPackage = buildPromptPackage(task, templateBody, machineTask);

  writeArtifact(task, "machine-task.json", `${JSON.stringify(machineTask, null, 2)}\n`);
  writeArtifact(task, "prompt-package.md", `${promptPackage}\n`);
  task.body.summary = task.body.summary || task.title || "";
  task.body.constraints_guardrails = [
    machineTask.constraints.map((entry) => `- ${entry}`).join("\n"),
    machineTask.guardrails.map((entry) => `- ${entry}`).join("\n"),
  ]
    .filter(Boolean)
    .join("\n");
  task.body.machine_task_json = JSON.stringify(machineTask, null, 2);
  task.body.prompt_template_selection = [
    `Template: ${task.current_prompt_template}`,
    `Route target: ${task.route_target}`,
  ].join("\n");
  task.body.prompt_package_for_approval = promptPackage;
  task.status = STATUS.PENDING_REVIEW;
  task.workflow_stage = STAGE.PROMPT_APPROVAL;
  task.sync_status = "Not Synced";
  task.decision = null;
  appendAttemptHistory(task, "Prompt package assembled and sent for approval.");
  log(`Prompt package prepared for ${task.task_id}.`);
}

async function runPromptApprovalFlow(task) {
  const promptText = ensurePromptPackageArtifact(task);
  const librarianResult = validateWorkflowArtifact(task, APPROVAL_GATE.PROMPT, promptText);
  const handled = handleLibrarianOutcome(task, librarianResult, {
    retryStage: STAGE.PROMPT_PACKAGE_ASSEMBLY,
    escalationStage: STAGE.ESCALATED_TO_OPERATOR,
    artifactText: promptText,
  });
  if (handled.stop) {
    return handled;
  }

  task.workflow_stage = STAGE.ARCHITECT_GPT_PLANNING;
  task.status = STATUS.PROCESSING;
  task.sync_status = "Synced";
  appendAttemptHistory(task, "Librarian approved the prompt package; sent to Architect/GPT.");
  return { changed: true, stop: true };
}

function prepareActionPlanDraft(task) {
  clearFailureState(task);
  resetWorkflowOutputs(task, "action_plan");
  const gptPlanText =
    readOptionalFile(task.artifacts["gpt-plan.md"]) || sanitizeText(task.body.gpt_plan);
  const qwenActionPlan = buildActionPlan(task, gptPlanText);
  writeArtifact(task, "qwen-action-plan.md", `${qwenActionPlan}\n`);
  task.body.qwen_action_plan_for_approval = qwenActionPlan;
  task.status = STATUS.PENDING_REVIEW;
  task.workflow_stage = STAGE.ACTION_PLAN_APPROVAL;
  task.sync_status = "Not Synced";
  task.approval_gate = APPROVAL_GATE.ACTION_PLAN;
  task.decision = null;
  appendAttemptHistory(task, "Qwen regenerated the action plan for operator review.");
}

async function runActionPlanApprovalFlow(task) {
  const actionPlanText = ensureActionPlanArtifact(task);
  const librarianResult = validateWorkflowArtifact(task, APPROVAL_GATE.ACTION_PLAN, actionPlanText);
  const handled = handleLibrarianOutcome(task, librarianResult, {
    retryStage: STAGE.QWEN_ACTION_PLAN_DRAFT,
    escalationStage: STAGE.ESCALATED_TO_OPERATOR,
    artifactText: actionPlanText,
  });
  if (handled.stop) {
    return handled;
  }

  if (isPlanningOnlyTask(task)) {
    completePlanningOnlyTask(task);
    return { changed: true, stop: true };
  }

  task.workflow_stage = STAGE.QWEN_EXECUTION;
  task.status = STATUS.PROCESSING;
  task.sync_status = "Synced";
  appendAttemptHistory(task, "Librarian approved the action plan; sent to Qwen for execution.");
  return { changed: true, stop: true };
}

async function runArchitectPlanningFlow(task) {
  const promptText = ensurePromptPackageArtifact(task);
  const architectResult = await generateArchitectPlan(task, promptText);
  const architectReview = reviewArchitectPlan(task, architectResult);
  if (!architectReview.ok) {
    applyFailureReport(task, architectReview.report);
    task.status = STATUS.ESCALATED;
    task.workflow_stage = STAGE.ESCALATED_TO_OPERATOR;
    task.sync_status = "Not Synced";
    task.approval_gate = APPROVAL_GATE.PROMPT;
    task.escalation_reason = task.last_failure_summary;
    task.body.escalation_notes = architectReview.report.exact_problem;
    return {
      changed: true,
      stop: true,
      notifyOperator: true,
      notifyReason: architectReview.report.failure_summary,
    };
  }

  const qwenActionPlan = buildActionPlan(task, architectResult.plan_text);
  writeArtifact(task, "qwen-action-plan.md", `${qwenActionPlan}\n`);
  task.body.gpt_plan = architectResult.plan_text;
  task.body.qwen_action_plan_for_approval = qwenActionPlan;
  task.status = STATUS.PENDING_REVIEW;
  task.workflow_stage = STAGE.ACTION_PLAN_APPROVAL;
  task.sync_status = "Not Synced";
  task.approval_gate = APPROVAL_GATE.ACTION_PLAN;
  task.decision = null;
  appendAttemptHistory(task, "GPT plan reviewed and Qwen action plan drafted for approval.");
  return {
    changed: true,
    stop: true,
    notifyOperator: true,
    notifyReason: "Action plan ready for approval.",
  };
}

function handleLibrarianOutcome(task, librarianResult, options) {
  task.body.librarian_validation_notes = sanitizeText(librarianResult.operator_message || "");

  if (librarianResult.verdict === VERDICT.PASS) {
    clearFailureState(task);
    task.stage_retry_count = 0;
    appendAttemptHistory(task, `${librarianResult.workflow_stage} passed Librarian validation.`);
    return { changed: true, stop: false };
  }

  const report = buildFailureReport({
    task,
    workflowStage: librarianResult.workflow_stage,
    failingActor: "Librarian",
    failureCode: librarianResult.failure_code,
    failureSummary: librarianResult.failure_summary,
    exactProblem: librarianResult.exact_problem,
    failedChecks: librarianResult.failed_checks,
    requiredChanges: librarianResult.required_changes,
    nextOwner: librarianResult.escalate_to_operator ? "operator" : "qwen",
    retryable: Boolean(librarianResult.retryable),
    escalateToOperator: Boolean(librarianResult.escalate_to_operator),
  });

  applyFailureReport(task, report, {
    validationNotes: librarianResult.operator_message,
  });

  if (librarianResult.verdict === VERDICT.RETRY) {
    task.stage_retry_count += 1;
    if (task.stage_retry_count >= 3) {
      escalateTask(task, report, options.escalationStage);
      return {
        changed: true,
        stop: true,
        notifyOperator: true,
        notifyReason: report.failure_summary,
      };
    }
    task.status = STATUS.RETRYING;
    task.workflow_stage = options.retryStage;
    task.sync_status = "Synced";
    appendAttemptHistory(
      task,
      `Retry requested: ${report.failure_summary}. Required changes: ${report.required_changes.join("; ")}`,
    );
    return { changed: true, stop: false };
  }

  if ([VERDICT.ESCALATE_OPERATOR, VERDICT.FAIL_TERMINAL].includes(librarianResult.verdict)) {
    escalateTask(task, report, options.escalationStage, librarianResult.verdict === VERDICT.FAIL_TERMINAL);
    return {
      changed: true,
      stop: true,
      notifyOperator: true,
      notifyReason: report.failure_summary,
    };
  }

  return { changed: false, stop: true };
}

function escalateTask(task, report, stage, markFailed = false) {
  task.status = markFailed ? STATUS.FAILED : STATUS.ESCALATED;
  task.workflow_stage = stage;
  task.sync_status = "Not Synced";
  task.escalation_reason = report.failure_summary;
  task.body.escalation_notes = [
    `Why it failed: ${report.failure_summary}`,
    `What is wrong now: ${report.exact_problem}`,
    `What Qwen/Librarian already tried: ${report.failed_checks.join("; ") || "Initial validation only."}`,
    `What decision or edit is needed from you: ${report.required_changes.join("; ") || "Review the task and choose a direction."}`,
  ].join("\n");
}

function reviewArchitectPlan(task, architectResult) {
  const planText = sanitizeText((architectResult && architectResult.plan_text) || "").trim();
  if (!planText) {
    return {
      ok: false,
      report: buildFailureReport({
        task,
        workflowStage: STAGE.ARCHITECT_GPT_PLANNING,
        failingActor: "Architect/GPT",
        failureCode: "gpt_plan_empty",
        failureSummary: "Architect/GPT returned an empty plan.",
        exactProblem: "No plan_text was returned for the approved prompt package.",
        failedChecks: ["Missing plan_text."],
        requiredChanges: ["Review the prompt package and regenerate the GPT plan."],
        nextOwner: "operator",
        retryable: false,
        escalateToOperator: true,
      }),
    };
  }
  if (!/plan/i.test(planText) || !/verify|validation/i.test(planText)) {
    const normalized = `${planText}\n\nVerification note:\n- Run a narrow verification step before completion.`;
    architectResult.plan_text = normalized;
  }
  return { ok: true };
}

async function executeApprovedActionPlan(task) {
  const actionPlanText = ensureActionPlanArtifact(task);
  const scopeCheck = runExecutionScopeSelfCheck(task, actionPlanText);
  if (!scopeCheck.ok) {
    const retryMeta = getExecutionRetryMeta(task, scopeCheck.failureCode);
    return handleExecutionFailure(task, {
      failureCode: scopeCheck.failureCode,
      failureSummary: scopeCheck.failureSummary,
      exactProblem: scopeCheck.exactProblem,
      failedChecks: scopeCheck.failedChecks,
      requiredChanges: scopeCheck.requiredChanges,
      retryable: retryMeta.retryable,
      retryLimit: retryMeta.retryLimit,
      nextOwner: retryMeta.nextOwner,
    });
  }
  const expectedFiles = extractExpectedFiles(task);
  if (expectedFiles.length > 0) {
    const writeResult = executeLocalWritePlan(task, actionPlanText, expectedFiles);
    const executionActor = getExecutionActorName(writeResult.model);
    writeArtifact(task, "qwen-execution-raw.txt", `${writeResult.rawSummary || ""}\n`);
    if (writeResult.stderr) {
      writeArtifact(task, "qwen-execution-stderr.txt", `${writeResult.stderr}\n`);
    }
    writeArtifact(
      task,
      "qwen-execution-model.json",
      `${JSON.stringify(
        {
          selected_model: writeResult.model || "",
          fallback_used: Boolean(writeResult.fallbackUsed),
          attempts: writeResult.attempts || [],
        },
        null,
        2,
      )}\n`,
    );

    if (!writeResult.ok) {
      const retryMeta = getExecutionRetryMeta(task, writeResult.failureCode || "execution_runtime_error");
      return handleExecutionFailure(task, {
        failingActor: executionActor,
        failureCode: writeResult.failureCode || "execution_runtime_error",
        failureSummary: writeResult.failureSummary || "Local write execution failed.",
        exactProblem: writeResult.exactProblem || "Unknown local write failure.",
        failedChecks: writeResult.failedChecks || ["Local write execution failed."],
        requiredChanges: writeResult.requiredChanges || [
          "Review the local write execution artifacts and retry the execution stage.",
        ],
        retryable: retryMeta.retryable,
        retryLimit: retryMeta.retryLimit,
        nextOwner: retryMeta.nextOwner,
      });
    }

    task.body.final_outcome = sanitizeText(writeResult.finalOutcome).trim();
    task.status = STATUS.EXECUTED;
    task.workflow_stage = STAGE.POST_EXECUTION_VERIFICATION;
    task.sync_status = "Synced";
    appendAttemptHistory(task, `${executionActor} execution completed; running verification.`);

    const verification = verifyExecution(task);
    if (!verification.ok) {
      const retryMeta = getExecutionRetryMeta(task, verification.failureCode);
      return handleExecutionFailure(task, {
        workflowStage: STAGE.POST_EXECUTION_VERIFICATION,
        failingActor: "Verifier",
        retryStage: STAGE.QWEN_EXECUTION,
        failureCode: verification.failureCode,
        failureSummary: verification.failureSummary,
        exactProblem: verification.exactProblem,
        failedChecks: verification.failedChecks,
        requiredChanges: verification.requiredChanges,
        retryable: retryMeta.retryable,
        retryLimit: retryMeta.retryLimit,
        nextOwner: retryMeta.nextOwner,
      });
    }

    clearFailureState(task);
    task.status = STATUS.COMPLETED;
    task.workflow_stage = STAGE.COMPLETED;
    task.sync_status = "Synced";
    appendAttemptHistory(task, `Verification passed: ${verification.command}`);
    return { changed: true, stop: true };
  }

  const prompt = buildExecutionPrompt(task, actionPlanText);
  const runResult = invokeExecutionModel(task, prompt);
  const executionActor = getExecutionActorName(runResult.model);
  writeArtifact(task, "qwen-execution-raw.txt", `${runResult.stdout || ""}\n`);
  if (runResult.stderr) {
    writeArtifact(task, "qwen-execution-stderr.txt", `${runResult.stderr}\n`);
  }
  writeArtifact(
    task,
    "qwen-execution-model.json",
    `${JSON.stringify(
      {
        selected_model: runResult.model || "",
        fallback_used: Boolean(runResult.fallbackUsed),
        attempts: runResult.attempts || [],
      },
      null,
      2,
    )}\n`,
  );

  if (!runResult.ok) {
    const retryMeta = getExecutionRetryMeta(task, "execution_runtime_error");
    return handleExecutionFailure(task, {
      failureCode: "execution_runtime_error",
      failingActor: executionActor,
      failureSummary: `${executionActor} execution failed before producing a usable result.`,
      exactProblem: runResult.stderr || runResult.error || "Unknown execution failure.",
      failedChecks: [
        `ollama status=${runResult.status}`,
        runResult.model ? `model=${runResult.model}` : "",
      ].filter(Boolean),
      requiredChanges: ["Review local runtime availability and retry the execution stage."],
      retryable: retryMeta.retryable,
      retryLimit: retryMeta.retryLimit,
      nextOwner: retryMeta.nextOwner,
    });
  }

  let patch;
  try {
    patch = parseModelJson(runResult.stdout || "");
  } catch (error) {
    const repaired = attemptExecutionJsonRepair(task, runResult.stdout || "", error);
    if (repaired.ok) {
      patch = repaired.patch;
    } else {
      const retryMeta = getExecutionRetryMeta(task, "execution_invalid_json");
      return handleExecutionFailure(task, {
        failureCode: "execution_invalid_json",
        failingActor: executionActor,
        failureSummary: `${executionActor} execution output was not valid JSON.`,
        exactProblem: sanitizeText(repaired.exactProblem || error.message),
        failedChecks: repaired.failedChecks || ["Execution patch JSON parse failed."],
        requiredChanges: ["Regenerate the execution patch as valid JSON only."],
        retryable: retryMeta.retryable,
        retryLimit: retryMeta.retryLimit,
        nextOwner: retryMeta.nextOwner,
      });
    }
  }

  const finalOutcome = sanitizeText(
    (patch.body && patch.body.final_outcome) || patch.final_outcome || "",
  ).trim();
  const reframeRequired = Boolean(patch.reframe_required);

  if (reframeRequired) {
    task.attempt_count += 1;
    task.stage_retry_count = 0;
    task.status = STATUS.RETRYING;
    task.workflow_stage = STAGE.TASK_INTAKE;
    task.approval_gate = APPROVAL_GATE.PROMPT;
    task.sync_status = "Synced";
    appendAttemptHistory(task, `Execution requested task reframing: ${sanitizeText(patch.failure_reason || "No reason provided.")}`);
    return { changed: true, stop: false };
  }

  if (!finalOutcome) {
    const retryMeta = getExecutionRetryMeta(task, "execution_missing_outcome");
    return handleExecutionFailure(task, {
      failureCode: "execution_missing_outcome",
      failingActor: executionActor,
      failureSummary: `${executionActor} execution did not provide a final outcome summary.`,
      exactProblem: "The execution patch is missing body.final_outcome.",
      failedChecks: ["body.final_outcome missing from execution patch."],
      requiredChanges: ["Return a concrete final outcome summary from execution."],
      retryable: retryMeta.retryable,
      retryLimit: retryMeta.retryLimit,
      nextOwner: retryMeta.nextOwner,
    });
  }

  task.body.final_outcome = finalOutcome;
  task.status = STATUS.EXECUTED;
  task.workflow_stage = STAGE.POST_EXECUTION_VERIFICATION;
  task.sync_status = "Synced";
  appendAttemptHistory(task, `${executionActor} execution completed; running verification.`);

  const verification = verifyExecution(task);
  if (!verification.ok) {
    const retryMeta = getExecutionRetryMeta(task, verification.failureCode);
    return handleExecutionFailure(task, {
      workflowStage: STAGE.POST_EXECUTION_VERIFICATION,
      failingActor: "Verifier",
      retryStage: STAGE.QWEN_EXECUTION,
      failureCode: verification.failureCode,
      failureSummary: verification.failureSummary,
      exactProblem: verification.exactProblem,
      failedChecks: verification.failedChecks,
      requiredChanges: verification.requiredChanges,
      retryable: retryMeta.retryable,
      retryLimit: retryMeta.retryLimit,
      nextOwner: retryMeta.nextOwner,
      escalationNotes: verification.operatorMessage,
    });
  }

  clearFailureState(task);
  task.status = STATUS.COMPLETED;
  task.workflow_stage = STAGE.COMPLETED;
  task.sync_status = "Synced";
  appendAttemptHistory(task, `Verification passed: ${verification.command}`);
  return { changed: true, stop: true };
}

function executeLocalWritePlan(task, actionPlanText, expectedFiles) {
  const approvedRoots = extractApprovedWriteRoots(task);
  const invalidTargets = expectedFiles.filter(
    (filePath) => !approvedRoots.some((root) => isPathWithinApprovedRoot(filePath, root)),
  );
  if (invalidTargets.length > 0) {
    return {
      ok: false,
      failureCode: "execution_scope_self_check_failed",
      failureSummary: "Expected file paths are outside the approved write roots.",
      exactProblem: `Out-of-scope file targets: ${invalidTargets.join(", ")}`,
      failedChecks: invalidTargets.map((filePath) => `within_approved_root(${filePath}) = false`),
      requiredChanges: ["Update the approved write roots or narrow the expected file list."],
      rawSummary: `Blocked local write plan because targets were outside scope: ${invalidTargets.join(", ")}`,
      model: "",
      fallbackUsed: false,
      attempts: [],
    };
  }

  const rootReadiness = ensureApprovedRootsReady(task, approvedRoots, expectedFiles);
  if (!rootReadiness.ok) {
    return {
      ok: false,
      failureCode: "execution_scope_self_check_failed",
      failureSummary: rootReadiness.failureSummary,
      exactProblem: rootReadiness.exactProblem,
      failedChecks: rootReadiness.failedChecks,
      requiredChanges: rootReadiness.requiredChanges,
      rawSummary: rootReadiness.exactProblem,
      model: "",
      fallbackUsed: false,
      attempts: [],
    };
  }

  const writeAttempts = [];
  const writtenFiles = [];
  const errors = [];
  let selectedModel = "";
  let fallbackUsed = false;

  for (const targetFile of expectedFiles) {
    const filePrompt = buildFileGenerationPrompt(task, actionPlanText, targetFile, expectedFiles);
    const runResult = invokeExecutionModel(task, filePrompt);
    selectedModel = runResult.model || selectedModel;
    fallbackUsed = fallbackUsed || Boolean(runResult.fallbackUsed);
    writeAttempts.push(...(runResult.attempts || []));
    if (!(runResult.attempts || []).length) {
      writeAttempts.push(summarizeOllamaAttempt(runResult));
    }
    writeArtifact(
      task,
      `qwen-file-${sanitizeFileName(path.basename(targetFile))}.raw.txt`,
      `${runResult.stdout || ""}\n`,
    );
    if (runResult.stderr) {
      writeArtifact(
        task,
        `qwen-file-${sanitizeFileName(path.basename(targetFile))}.stderr.txt`,
        `${runResult.stderr}\n`,
      );
    }

    if (!runResult.ok) {
      errors.push(
        `${targetFile}: ${runResult.stderr || runResult.error || `ollama exit ${runResult.status}`}`,
      );
      return {
        ok: false,
        failureCode: "execution_runtime_error",
        failureSummary: "Model execution failed while generating file contents.",
        exactProblem: errors.join("\n"),
        failedChecks: errors.map((entry) => `file_generation_failed(${entry})`),
        requiredChanges: ["Retry the local write execution once the model runtime is healthy."],
        rawSummary: `File generation failed for ${targetFile}.`,
        model: runResult.model || "",
        fallbackUsed: Boolean(runResult.fallbackUsed),
        attempts: writeAttempts,
        stderr: runResult.stderr || runResult.error || "",
      };
    }

    const prepared = prepareGeneratedFileContent(targetFile, runResult.stdout || "");
    if (!prepared.ok) {
      return {
        ok: false,
        failureCode: "execution_invalid_file_content",
        failureSummary: "Model returned unusable file content.",
        exactProblem: `${targetFile}: ${prepared.exactProblem}`,
        failedChecks: prepared.failedChecks,
        requiredChanges: ["Regenerate the file contents without commentary, apologies, or extra guidance text."],
        rawSummary: `File content validation failed for ${targetFile}.`,
        model: runResult.model || "",
        fallbackUsed: Boolean(runResult.fallbackUsed),
        attempts: writeAttempts,
      };
    }

    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, prepared.content, "utf8");
    writtenFiles.push(targetFile);
  }

  let verification = runLocalWriteVerification(expectedFiles[0] ? path.dirname(expectedFiles[0]) : "");
  if (!verification.ok) {
    const repair = attemptLocalWriteRepair(task, actionPlanText, expectedFiles, verification, writeAttempts);
    selectedModel = repair.model || selectedModel;
    fallbackUsed = fallbackUsed || Boolean(repair.fallbackUsed);
    if (repair.repaired) {
      verification = repair.verification;
    }
  }
  const verificationSummary = verification.ok
    ? `Verification passed: ${verification.steps.join("; ")}`
    : `Verification incomplete: ${verification.exactProblem}`;
  if (verification.stdout) {
    writeArtifact(task, "local-write-verification.stdout.txt", `${verification.stdout}\n`);
  }
  if (verification.stderr) {
    writeArtifact(task, "local-write-verification.stderr.txt", `${verification.stderr}\n`);
  }

  return {
    ok: verification.ok,
    failureCode: verification.ok ? "" : "execution_runtime_error",
    failureSummary: verification.ok ? "" : "Local verification failed after writing scaffold files.",
    exactProblem: verification.ok ? "" : verification.exactProblem,
    failedChecks: verification.ok ? [] : verification.steps.map((step) => `failed_step(${step}) = true`),
    requiredChanges: verification.ok ? [] : ["Fix the generated scaffold and rerun npm install plus npm run build."],
    finalOutcome: buildLocalWriteOutcome(expectedFiles, verification),
    rawSummary: [
      `Host-side local write execution completed for ${writtenFiles.length} file(s).`,
      ...writtenFiles.map((filePath) => `- ${filePath}`),
      verificationSummary,
    ].join("\n"),
    model: selectedModel || writeAttempts.find((attempt) => attempt.ok)?.model || writeAttempts[0]?.model || "",
    fallbackUsed:
      fallbackUsed ||
      writeAttempts.some((attempt) => attempt.ok && attempt.model !== getPrimaryOllamaModel()),
    attempts: writeAttempts,
    stderr: verification.ok ? "" : verification.stderr || verification.exactProblem,
  };
}

function attemptLocalWriteRepair(task, actionPlanText, expectedFiles, verification, writeAttempts) {
  const projectRoot = expectedFiles[0] ? path.dirname(expectedFiles[0]) : "";
  const repairTargets = extractRepairTargetsFromVerification(projectRoot, verification, expectedFiles);
  if (repairTargets.length === 0) {
    return { repaired: false, verification, model: "", fallbackUsed: false };
  }

  let selectedModel = "";
  let fallbackUsed = false;
  const attemptedTargets = [];

  for (const targetFile of repairTargets) {
    const currentContent = safeReadFile(targetFile);
    const repairPrompt = buildVerificationRepairPrompt(
      task,
      actionPlanText,
      targetFile,
      currentContent,
      verification,
      expectedFiles,
    );
    const repairResult = invokeExecutionModel(task, repairPrompt);
    selectedModel = repairResult.model || selectedModel;
    fallbackUsed = fallbackUsed || Boolean(repairResult.fallbackUsed);
    writeAttempts.push(...(repairResult.attempts || []));
    if (!(repairResult.attempts || []).length) {
      writeAttempts.push(summarizeOllamaAttempt(repairResult));
    }

    writeArtifact(
      task,
      `qwen-repair-${sanitizeFileName(path.basename(targetFile))}.raw.txt`,
      `${repairResult.stdout || ""}\n`,
    );
    if (repairResult.stderr) {
      writeArtifact(
        task,
        `qwen-repair-${sanitizeFileName(path.basename(targetFile))}.stderr.txt`,
        `${repairResult.stderr}\n`,
      );
    }

    if (!repairResult.ok) {
      return { repaired: false, verification, model: selectedModel, fallbackUsed };
    }

    const prepared = prepareGeneratedFileContent(targetFile, repairResult.stdout || "");
    if (!prepared.ok) {
      return { repaired: false, verification, model: selectedModel, fallbackUsed };
    }

    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, prepared.content, "utf8");
    attemptedTargets.push(targetFile);
  }

  if (attemptedTargets.length === 0) {
    return { repaired: false, verification, model: selectedModel, fallbackUsed };
  }

  const rerun = runLocalWriteVerification(projectRoot);
  const notes = [
    `Repair attempted for ${attemptedTargets.length} file(s).`,
    ...attemptedTargets.map((filePath) => `- ${filePath}`),
    rerun.ok
      ? `Repair verification passed: ${rerun.steps.join("; ")}`
      : `Repair verification still failing: ${sanitizeText(rerun.exactProblem)}`,
  ].join("\n");
  writeArtifact(task, "local-write-repair-summary.txt", `${notes}\n`);
  return {
    repaired: true,
    verification: rerun,
    model: selectedModel,
    fallbackUsed,
  };
}

function verifyExecution(task) {
  const artifactDir = getTaskArtifactDir(task);
  const exists = fs.existsSync(artifactDir);
  const outcome = sanitizeText(task.body.final_outcome).trim();
  const expectedFiles = extractExpectedFiles(task);
  const implementationTask = isImplementationExecutionTask(task);
  const evidence = collectExecutionEvidence(artifactDir);
  if (!exists) {
    return withVerificationReport(task, {
      ok: false,
      failureCode: "verification_missing_artifacts",
      failureSummary: "Execution artifacts are missing.",
      exactProblem: `Artifact directory not found: ${artifactDir}`,
      failedChecks: [`artifact_dir_exists(${artifactDir}) = false`],
      requiredChanges: ["Re-run execution so artifacts are written before verification."],
      operatorMessage: `Why it failed: execution artifacts are missing.\nWhat is wrong now: ${artifactDir} does not exist.\nWhat Qwen/Librarian already tried: execution completed without a usable artifact bundle.\nWhat decision or edit is needed from you: review the task artifacts or request a rerun.`,
      command: `artifact-check ${artifactDir}`,
      evidence,
    });
  }
  if (!outcome) {
    return withVerificationReport(task, {
      ok: false,
      failureCode: "verification_missing_outcome",
      failureSummary: "Final outcome summary is missing after execution.",
      exactProblem: "body.final_outcome is empty.",
      failedChecks: ["final_outcome_present = false"],
      requiredChanges: ["Re-run execution and ensure a final outcome is recorded."],
      operatorMessage: "Why it failed: final outcome summary is missing.\nWhat is wrong now: the task page has no final outcome.\nWhat Qwen/Librarian already tried: execution completed but did not persist the result cleanly.\nWhat decision or edit is needed from you: request a rerun or update the task outcome manually.",
      command: `artifact-check ${artifactDir}`,
      evidence,
    });
  }
  if (implementationTask && isReviewOnlyOutcome(outcome)) {
    return withVerificationReport(task, {
      ok: false,
      failureCode: "verification_review_only_outcome",
      failureSummary: "Implementation task reported a review-only outcome.",
      exactProblem: `Final outcome is review-only instead of implementation proof: ${outcome}`,
      failedChecks: ["implementation_outcome_is_review_only = true"],
      requiredChanges: [
        "Re-run execution and require concrete implementation evidence, not a review-only summary.",
      ],
      operatorMessage: [
        "Why it failed: an implementation task reported a review-only outcome.",
        `What is wrong now: ${outcome}`,
        "What Qwen/Librarian already tried: execution returned an artifact/report summary instead of proving code changes.",
        "What decision or edit is needed from you: rerun the task with concrete file/build verification or narrow it into a true review-only task.",
      ].join("\n"),
      command: `artifact-check ${artifactDir}`,
      evidence,
    });
  }
  if (implementationTask && !hasConcreteExecutionEvidence(evidence)) {
    return withVerificationReport(task, {
      ok: false,
      failureCode: "verification_insufficient_evidence",
      failureSummary: "Implementation task lacks concrete completion evidence.",
      exactProblem:
        "Execution did not produce file-write artifacts, local verification output, or a repair summary. Artifact-only completion is not accepted for implementation tasks.",
      failedChecks: [
        `generated_file_artifacts > 0 = ${evidence.generatedFileArtifactCount > 0}`,
        `local_write_verification_present = ${evidence.localWriteVerificationPresent}`,
        `repair_summary_present = ${evidence.repairSummaryPresent}`,
      ],
      requiredChanges: [
        "Re-run execution and require actual file writes or command verification output.",
        "Do not complete implementation tasks on artifact-check alone.",
      ],
      operatorMessage: [
        "Why it failed: reporting could not prove that implementation actually landed.",
        "What is wrong now: the task only has generic artifacts and no file-write/build evidence.",
        "What Qwen/Librarian already tried: execution returned a summary and artifact bundle without implementation proof.",
        "What decision or edit is needed from you: rerun the task with explicit deliverables and concrete verification.",
      ].join("\n"),
      command: `artifact-check ${artifactDir}`,
      evidence,
    });
  }
  if (expectedFiles.length > 0) {
    const missingFiles = expectedFiles.filter((filePath) => !fs.existsSync(filePath));
    if (missingFiles.length > 0) {
      return withVerificationReport(task, {
        ok: false,
        failureCode: "verification_missing_expected_files",
        failureSummary: "Expected execution files are missing.",
        exactProblem: `Missing expected files: ${missingFiles.join(", ")}`,
        failedChecks: missingFiles.map((filePath) => `exists(${filePath}) = false`),
        requiredChanges: [
          "Re-run execution and ensure the approved file footprint is actually written to disk.",
        ],
        operatorMessage: [
          "Why it failed: expected execution files are missing.",
          `What is wrong now: ${missingFiles.join(", ")}`,
          "What Qwen/Librarian already tried: execution produced artifacts and an outcome summary, but the expected files were not found on disk.",
          "What decision or edit is needed from you: request a rerun or update the task so verification matches the real deliverables.",
        ].join("\n"),
        command: `fs-check ${expectedFiles.join(", ")}`,
        evidence,
      });
    }
  }
  return withVerificationReport(task, {
    ok: true,
    command:
      expectedFiles.length > 0
        ? `fs-check ${expectedFiles.join(", ")}`
        : `artifact-check ${artifactDir}`,
    evidence,
  });
}

function withVerificationReport(task, report) {
  writeArtifact(task, "verification-report.json", `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function collectExecutionEvidence(artifactDir) {
  const names = fs.existsSync(artifactDir) ? fs.readdirSync(artifactDir) : [];
  return {
    artifactCount: names.length,
    generatedFileArtifactCount: names.filter((name) => /^qwen-file-.*\.raw\.txt$/i.test(name)).length,
    localWriteVerificationPresent:
      names.includes("local-write-verification.stdout.txt") ||
      names.includes("local-write-verification.stderr.txt"),
    repairSummaryPresent: names.includes("local-write-repair-summary.txt"),
    rawExecutionPresent: names.includes("qwen-execution-raw.txt"),
    modelRecordPresent: names.includes("qwen-execution-model.json"),
    artifactNames: names.slice(0, 32),
  };
}

function hasConcreteExecutionEvidence(evidence) {
  return Boolean(
    evidence &&
      (evidence.generatedFileArtifactCount > 0 ||
        evidence.localWriteVerificationPresent ||
        evidence.repairSummaryPresent),
  );
}

function isReviewOnlyOutcome(outcome) {
  const text = sanitizeText(outcome).toLowerCase();
  return (
    text.includes("review-only task completed") ||
    text.includes("alignment review") ||
    text.includes("artifact bundle exists") ||
    text.includes("repo report drafted") ||
    text.includes("report drafted in notion")
  );
}

function handleExecutionFailure(task, failure) {
  if (isInitialGitCommitBlocker(failure)) {
    return resolveInitialGitCommitBlocker(task, failure);
  }

  const workflowStage = failure.workflowStage || STAGE.QWEN_EXECUTION;
  const failingActor = failure.failingActor || "Qwen";
  const retryLimit = Number.isFinite(failure.retryLimit)
    ? failure.retryLimit
    : getExecutionRetryLimit(failure.failureCode);
  const report = buildFailureReport({
    task,
    workflowStage,
    failingActor,
    failureCode: failure.failureCode,
    failureSummary: failure.failureSummary,
    exactProblem: failure.exactProblem,
    failedChecks: failure.failedChecks,
    requiredChanges: failure.requiredChanges,
    nextOwner: failure.nextOwner,
    retryable: failure.retryable,
    escalateToOperator: !failure.retryable,
  });
  applyFailureReport(task, report);

  if (failure.retryable && task.stage_retry_count < retryLimit) {
    task.stage_retry_count += 1;
    task.status = STATUS.RETRYING;
    task.workflow_stage = failure.retryStage || STAGE.QWEN_EXECUTION;
    task.sync_status = "Synced";
    task.body.final_outcome = "";
    appendAttemptHistory(
      task,
      `Auto-retrying ${sanitizeText(failingActor).toLowerCase()} failure (${task.stage_retry_count}/${retryLimit}): ${failure.failureSummary}`,
    );
    return { changed: true, stop: false };
  }

  if (shouldHandOffToClaude(task, failure, retryLimit)) {
    return handOffExecutionToClaude(task, failure, failingActor);
  }

  task.status = STATUS.ESCALATED;
  task.workflow_stage = STAGE.ESCALATED_TO_OPERATOR;
  task.sync_status = "Not Synced";
  task.escalation_reason = report.failure_summary;
  task.body.escalation_notes =
    sanitizeText(failure.escalationNotes).trim() ||
    [
      `Why it failed: ${report.failure_summary}`,
      `What is wrong now: ${report.exact_problem}`,
      `What Qwen/Librarian already tried: ${report.failed_checks.join("; ")}`,
      `What decision or edit is needed from you: ${report.required_changes.join("; ")}`,
    ].join("\n");
  return {
    changed: true,
    stop: true,
    notifyOperator: true,
    notifyReason: report.failure_summary,
  };
}

function isInitialGitCommitBlocker(failure) {
  const combinedText = [
    sanitizeText(failure && failure.failureSummary),
    sanitizeText(failure && failure.exactProblem),
    ...(Array.isArray(failure && failure.failedChecks) ? failure.failedChecks : []),
    ...(Array.isArray(failure && failure.requiredChanges) ? failure.requiredChanges : []),
  ]
    .filter(Boolean)
    .join("\n");

  return /needs? initial github commit|needs? initial git commit|manual initial (github|git) commit|repository has no commits yet|current branch .+ has no commits yet|src refspec .+ does not match any|ambiguous argument 'head'|unknown revision or path not in the working tree/i.test(
    combinedText,
  );
}

function shouldHandOffToClaude(task, failure, retryLimit) {
  if (!canUseClaudeExecution()) {
    return false;
  }
  if (!isImplementationExecutionTask(task)) {
    return false;
  }
  if (getExecutionProvider(task) === "claude") {
    return false;
  }
  if (!failure || failure.retryable === false) {
    return false;
  }
  if (!isClaudeEligibleFailureCode(failure.failureCode)) {
    return false;
  }
  return task.stage_retry_count >= retryLimit;
}

function handOffExecutionToClaude(task, failure, failingActor) {
  task.metadata = task.metadata || {};
  task.metadata.execution_provider = "claude";
  task.metadata.execution_provider_switched_at = new Date().toISOString();
  task.metadata.execution_provider_previous = getPrimaryOllamaModel();
  task.stage_retry_count = 0;
  task.status = STATUS.RETRYING;
  task.workflow_stage = failure.retryStage || STAGE.QWEN_EXECUTION;
  task.sync_status = "Synced";
  task.body.final_outcome = "";
  appendAttemptHistory(
    task,
    `Local execution retries exhausted for ${sanitizeText(failingActor).toLowerCase()}; handing off to Claude execution fallback.`,
  );
  return { changed: true, stop: false };
}

function isClaudeEligibleFailureCode(failureCode) {
  return [
    "execution_runtime_error",
    "execution_invalid_json",
    "execution_missing_outcome",
    "execution_invalid_file_content",
    "verification_missing_expected_files",
    "verification_review_only_outcome",
    "verification_insufficient_evidence",
  ].includes(sanitizeText(failureCode).trim());
}

function resolveInitialGitCommitBlocker(task, failure) {
  const note =
    "Needs initial GitHub commit before delegated milestone commits can run. Review and create the first commit manually, then reapprove later commit tasks.";
  const existingOperatorNotes = sanitizeText(task.operator_notes || task.body.operator_notes).trim();
  const mergedOperatorNotes = existingOperatorNotes
    ? existingOperatorNotes.includes(note)
      ? existingOperatorNotes
      : `${existingOperatorNotes}\n${note}`
    : note;
  const existingOutcome = sanitizeText(task.body.final_outcome).trim();

  task.operator_notes = mergedOperatorNotes;
  task.body.operator_notes = mergedOperatorNotes;
  task.body.final_outcome =
    existingOutcome ||
    "Implementation milestone completed locally; manual initial GitHub commit is still required before delegated milestone commits can continue.";
  clearFailureState(task);
  task.status = STATUS.COMPLETED;
  task.workflow_stage = STAGE.COMPLETED;
  task.sync_status = "Not Synced";
  appendAttemptHistory(
    task,
    `Commit step deferred for operator review: ${note} Original blocker: ${sanitizeText(
      failure && failure.failureSummary,
    ) || sanitizeText(failure && failure.exactProblem) || "Initial GitHub commit is missing."}`,
  );

  return {
    changed: true,
    stop: true,
    notifyOperator: true,
    notifyReason: note,
  };
}

function runExecutionScopeSelfCheck(task, actionPlanText) {
  const approvedRoots = extractApprovedWriteRoots(task);
  const expectedFiles = extractExpectedFiles(task);
  const gitAuthorized = isGitAuthorizedForTask(task, actionPlanText);

  writeArtifact(
    task,
    "qwen-scope-self-check-raw.txt",
    [
      "Deterministic local scope preflight executed.",
      `Approved write roots: ${approvedRoots.join(", ") || "none"}`,
      `Expected files: ${expectedFiles.join(", ") || "none"}`,
      `Git authorized: ${gitAuthorized ? "true" : "false"}`,
    ].join("\n"),
  );
  writeArtifact(
    task,
    "qwen-scope-self-check-model.json",
    `${JSON.stringify(
      {
        selected_model: "local-deterministic-preflight",
        fallback_used: false,
        attempts: [],
      },
      null,
      2,
    )}\n`,
  );

  if (approvedRoots.length === 0 && expectedFiles.length > 0) {
    return {
      ok: false,
      failureCode: "execution_scope_self_check_failed",
      failureSummary: "Execution preflight could not determine an approved write root.",
      exactProblem: `Expected files require a write root, but none was found. Expected files: ${expectedFiles.join(", ")}`,
      failedChecks: ["approved_write_roots = []"],
      requiredChanges: ["Add or preserve an explicit approved write root before execution."],
    };
  }

  const outOfScope = expectedFiles.filter(
    (entry) => approvedRoots.length > 0 && !approvedRoots.some((root) => isPathWithinApprovedRoot(entry, root)),
  );
  if (outOfScope.length > 0) {
    return {
      ok: false,
      failureCode: "execution_scope_self_check_failed",
      failureSummary: "Execution preflight found expected files outside the approved write root.",
      exactProblem: `Out-of-scope expected files: ${outOfScope.join(", ")}`,
      failedChecks: outOfScope.map((entry) => `outside_approved_root(${entry}) = true`),
      requiredChanges: [`Keep all expected writes within: ${approvedRoots.join(", ") || "none"}`],
    };
  }

  if (gitAuthorized) {
    return {
      ok: false,
      failureCode: "execution_scope_self_check_failed",
      failureSummary: "Execution preflight detected git authorization in a task that should stay local-only.",
      exactProblem: "Git actions were inferred as authorized from the task text.",
      failedChecks: ["git_authorized = true"],
      requiredChanges: ["Remove git/version-control actions from the approved task or authorize them explicitly in a dedicated task."],
    };
  }

  writeArtifact(
    task,
    "qwen-scope-self-check.json",
    `${JSON.stringify(
      {
        approved_roots: approvedRoots,
        expected_files: expectedFiles,
        git_allowed: false,
        scope_ok: true,
        mode: "local-deterministic-preflight",
      },
      null,
      2,
    )}\n`,
  );
  return { ok: true };
}

function buildExecutionPrompt(task, actionPlanText) {
  const contractText = getQwenExecutorContractText();
  const executionBrief = buildCompactExecutionBrief(task, actionPlanText);
  const approvedRoots = extractApprovedWriteRoots(task);
  const expectedFiles = extractExpectedFiles(task);
  const firstExpectedFile = expectedFiles[0] || "";
  const priorFailureSummary = sanitizeText(task.last_failure_summary).trim();
  const priorFailureCode = sanitizeText(task.last_failure_code).trim();
  const retryContext =
    task.stage_retry_count > 0 && (priorFailureSummary || priorFailureCode)
      ? [
          "",
          "Previous execution failure to avoid on this retry:",
          priorFailureCode ? `Failure code: ${priorFailureCode}` : "",
          priorFailureSummary ? `Failure summary: ${priorFailureSummary}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";
  return [
    "You are Qwen, the local execution assistant for AI Assistant OS.",
    "Execute the approved action plan and return JSON only.",
    "Do not include markdown, code fences, commentary, or prose outside JSON.",
    'Return this minimal schema: {"body":{"final_outcome":"..."},"reframe_required":false}',
    "If the task must be reframed, set reframe_required=true and include failure_reason.",
    "Return compact JSON on a single line.",
    "Before responding, internally verify that your output is valid JSON matching the schema exactly.",
    "Keep body.final_outcome to one concise sentence no longer than 240 characters.",
    "Inside JSON strings, escape newlines as \\n and tabs as \\t.",
    expectedFiles.length > 0
      ? "This is a filesystem write task, not a review-only task."
      : "If the approved task is explicitly review-only, return a final_outcome that says exactly what review artifact or report was produced.",
    "Unless the approved task explicitly authorizes version-control actions, do not run git init, git add, git commit, git push, create branches, or open pull requests.",
    "If a later milestone explicitly authorizes a commit but the repo still needs its first manual GitHub commit, stop and report that operator note instead of treating it as a fatal execution failure.",
    approvedRoots.length > 0
      ? `All writes must stay inside: ${approvedRoots.join(", ")}`
      : "No file writes are authorized unless explicitly listed in the approved task.",
    firstExpectedFile
      ? `Before anything else, prove write access by creating or updating this expected file inside scope: ${firstExpectedFile}`
      : "",
    expectedFiles.length > 0
      ? `Do not report success unless these expected files exist on disk: ${expectedFiles.join(", ")}`
      : "",
    firstExpectedFile
      ? `If you cannot write ${firstExpectedFile}, return reframe_required=true and explain the blocker.`
      : "",
    "",
    `Task ID: ${sanitizeText(task.task_id)}`,
    `Task Title: ${sanitizeText(task.title)}`,
    `Workflow Stage: ${sanitizeText(task.workflow_stage)}`,
    `Approval Gate: ${sanitizeText(task.approval_gate)}`,
    "",
    "Qwen OS Executor Contract:",
    contractText,
    retryContext,
    "",
    "Compact execution brief:",
    executionBrief,
  ].join("\n");
}

function buildScopeSelfCheckPrompt(task, actionPlanText, approvedRoots) {
  const scopeBrief = buildCompactScopeBrief(task, actionPlanText);
  return [
    "You are Qwen, the local execution assistant for AI Assistant OS.",
    "Before execution, confirm your write boundary and git restriction.",
    "Return JSON only on a single line with exactly this schema:",
    '{"scope_ok":true,"allowed_write_paths":["..."],"git_allowed":false,"reason":""}',
    "Do not add markdown or commentary.",
    "If no file writes are approved, return an empty allowed_write_paths array.",
    "git_allowed must be false unless the task explicitly authorizes version-control actions.",
    "",
    `Task ID: ${sanitizeText(task.task_id)}`,
    `Task Title: ${sanitizeText(task.title)}`,
    `Approved write roots: ${approvedRoots.length ? approvedRoots.join(", ") : "none"}`,
    "",
    "Execution scope brief:",
    scopeBrief,
  ].join("\n");
}

function isGitAuthorizedForTask(task, actionPlanText) {
  const negativeText = [
    sanitizeText(task.body.constraints_guardrails),
    sanitizeText(task.body.full_context),
    sanitizeText(task.body.proposed_action),
    sanitizeText(actionPlanText),
  ]
    .filter(Boolean)
    .join("\n");

  if (/do not run git init|do not run version-control actions|git actions are not allowed/i.test(negativeText)) {
    return false;
  }

  const explicitAuthorizationText = [
    sanitizeText(task.revised_instructions),
    sanitizeText(task.operator_notes),
    sanitizeText(task.body.operator_notes),
    sanitizeText(task.body.escalation_notes),
  ]
    .filter(Boolean)
    .join("\n");

  return /git (actions|operations) explicitly authorized|version-control actions explicitly authorized|git is authorized for this task|allow git (init|add|commit|push)|allow version-control actions/i.test(
    explicitAuthorizationText,
  );
}

function invokeOllama(prompt) {
  const primaryModel = getPrimaryOllamaModel();
  const fallbackModel = getFallbackOllamaModel(primaryModel);
  const primaryResult = runOllamaModel(primaryModel, prompt);

  if (primaryResult.ok || !fallbackModel || !shouldTryFallback(primaryResult)) {
    return primaryResult;
  }

  const fallbackResult = runOllamaModel(fallbackModel, prompt);
  if (fallbackResult.ok) {
    return {
      ...fallbackResult,
      fallbackUsed: true,
      attempts: [summarizeOllamaAttempt(primaryResult), summarizeOllamaAttempt(fallbackResult)],
    };
  }

  return {
    ...fallbackResult,
    fallbackUsed: true,
    attempts: [summarizeOllamaAttempt(primaryResult), summarizeOllamaAttempt(fallbackResult)],
    stderr: [primaryResult.stderr, fallbackResult.stderr].filter(Boolean).join("\n\n"),
    error: [primaryResult.error, fallbackResult.error].filter(Boolean).join("\n\n"),
  };
}

function invokeExecutionModel(task, prompt) {
  if (getExecutionProvider(task) === "claude" && canUseClaudeExecution()) {
    return runClaudeModel(getClaudeExecutionModel(), prompt);
  }
  return invokeOllama(prompt);
}

function runOllamaModel(model, prompt) {
  const raw = spawnSync("ollama", ["run", model], {
    cwd: ROOT,
    encoding: "utf8",
    input: sanitizeText(prompt),
    timeout: OLLAMA_TIMEOUT_MS,
  });

  return {
    ok: !raw.error && raw.status === 0,
    model,
    status: raw.status,
    stdout: sanitizeText(raw.stdout || ""),
    stderr: sanitizeText(raw.stderr || ""),
    error: raw.error ? sanitizeText(raw.error.message) : "",
    fallbackUsed: false,
    attempts: [],
  };
}

function runClaudeModel(model, prompt) {
  const apiKey = sanitizeText(process.env.ANTHROPIC_API_KEY).trim();
  if (!apiKey) {
    return {
      ok: false,
      model,
      status: 0,
      stdout: "",
      stderr: "ANTHROPIC_API_KEY is not set.",
      error: "Claude execution fallback is unavailable because ANTHROPIC_API_KEY is missing.",
      fallbackUsed: false,
      attempts: [],
    };
  }

  const tmpDir = path.join(ROOT, "runtime", "tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const requestPath = path.join(tmpDir, `claude-request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  const responsePath = path.join(tmpDir, `claude-response-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  const requestBody = {
    model,
    max_tokens: 4096,
    system: "You are Claude Code acting as the execution fallback for AI Assistant OS. Follow the user's execution contract exactly and return only the requested output shape.",
    messages: [{ role: "user", content: sanitizeText(prompt) }],
  };

  fs.writeFileSync(requestPath, JSON.stringify(requestBody), "utf8");
  const raw = spawnSync(
    "curl.exe",
    [
      "-sS",
      "https://api.anthropic.com/v1/messages",
      "-H",
      `x-api-key: ${apiKey}`,
      "-H",
      "anthropic-version: 2023-06-01",
      "-H",
      "content-type: application/json",
      "-o",
      responsePath,
      "-w",
      "%{http_code}",
      "--data-binary",
      `@${requestPath}`,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      timeout: CLAUDE_TIMEOUT_MS,
    },
  );

  const statusCode = sanitizeText(raw.stdout || "").trim();
  const responseText = fs.existsSync(responsePath) ? fs.readFileSync(responsePath, "utf8") : "";
  try {
    if (fs.existsSync(requestPath)) fs.unlinkSync(requestPath);
    if (fs.existsSync(responsePath)) fs.unlinkSync(responsePath);
  } catch {}

  if (raw.error) {
    return {
      ok: false,
      model,
      status: raw.status,
      stdout: "",
      stderr: sanitizeText(raw.stderr || ""),
      error: sanitizeText(raw.error.message),
      fallbackUsed: false,
      attempts: [],
    };
  }

  let parsed;
  try {
    parsed = responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    return {
      ok: false,
      model,
      status: raw.status,
      stdout: sanitizeText(responseText),
      stderr: sanitizeText(raw.stderr || ""),
      error: `Claude response was not valid JSON: ${sanitizeText(error.message)}`,
      fallbackUsed: false,
      attempts: [],
    };
  }

  if (Number(statusCode) >= 400) {
    const apiError =
      sanitizeText(parsed && parsed.error && (parsed.error.message || parsed.error.type)) ||
      sanitizeText(responseText);
    return {
      ok: false,
      model,
      status: Number(statusCode) || raw.status,
      stdout: "",
      stderr: apiError,
      error: apiError,
      fallbackUsed: false,
      attempts: [],
    };
  }

  const text = Array.isArray(parsed && parsed.content)
    ? parsed.content
        .filter((entry) => entry && entry.type === "text")
        .map((entry) => sanitizeText(entry.text || ""))
        .join("\n")
    : "";

  return {
    ok: Boolean(text),
    model,
    status: Number(statusCode) || raw.status || 0,
    stdout: text,
    stderr: sanitizeText(raw.stderr || ""),
    error: text ? "" : "Claude returned no text content.",
    fallbackUsed: false,
    attempts: [],
  };
}

function getPrimaryOllamaModel() {
  return sanitizeText(process.env.OLLAMA_MODEL || "deepseek-coder:6.7b").trim();
}

function getFallbackOllamaModel(primaryModel) {
  const fallback = sanitizeText(
    process.env.OLLAMA_FALLBACK_MODEL || "qwen2.5-coder:7b",
  ).trim();
  if (!fallback || fallback === primaryModel) {
    return "";
  }
  return fallback;
}

function shouldTryFallback(result) {
  if (result.ok) {
    return false;
  }

  const failureText = `${sanitizeText(result.stderr)} ${sanitizeText(result.error)}`.toLowerCase();
  return (
    failureText.includes("llama runner process has terminated") ||
    failureText.includes("500 internal server error") ||
    failureText.includes("cuda error") ||
    failureText.includes("out of memory") ||
    failureText.includes("timed out")
  );
}

function canUseClaudeExecution() {
  return Boolean(sanitizeText(process.env.ANTHROPIC_API_KEY).trim());
}

function getClaudeExecutionModel() {
  return sanitizeText(process.env.CLAUDE_EXECUTION_MODEL || "claude-3-5-haiku-latest").trim();
}

function getExecutionProvider(task) {
  const provider = sanitizeText(task && task.metadata && task.metadata.execution_provider).trim().toLowerCase();
  return provider === "claude" ? "claude" : "local";
}

function summarizeOllamaAttempt(result) {
  return {
    model: result.model || "",
    ok: Boolean(result.ok),
    status: result.status,
    stderr: sanitizeText(result.stderr || "").slice(0, 400),
    error: sanitizeText(result.error || "").slice(0, 400),
  };
}

function parseModelJson(rawText) {
  const cleaned = sanitizeText(rawText).trim();
  if (!cleaned) {
    throw new Error("Model returned empty output.");
  }

  const text = stripMarkdownCodeFences(cleaned).trim();
  const candidate = extractLikelyJsonObject(text);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    const repaired = repairJsonControlCharacters(candidate);
    if (repaired !== candidate) {
      return JSON.parse(repaired);
    }
    throw error;
  }
}

function attemptExecutionJsonRepair(task, rawOutput, parseError) {
  const repairPrompt = [
    "You are repairing malformed JSON from a previous model response.",
    "Return valid JSON only on a single line.",
    "Do not add markdown fences or commentary.",
    'Return exactly this schema: {"body":{"final_outcome":"..."},"reframe_required":false}',
    "Preserve the meaning of the original response, but keep final_outcome concise and under 240 characters.",
    "Escape newlines as \\n and tabs as \\t inside strings.",
    "",
    "Malformed output to repair:",
    sanitizeText(rawOutput),
  ].join("\n");

  const repairResult = invokeExecutionModel(task, repairPrompt);
  writeArtifact(task, "qwen-execution-repair-raw.txt", `${repairResult.stdout || ""}\n`);
  if (repairResult.stderr) {
    writeArtifact(task, "qwen-execution-repair-stderr.txt", `${repairResult.stderr}\n`);
  }

  if (!repairResult.ok) {
    return {
      ok: false,
      exactProblem: repairResult.stderr || repairResult.error || sanitizeText(parseError.message),
      failedChecks: [
        "Execution patch JSON parse failed.",
        `Repair attempt runtime status=${repairResult.status}`,
      ],
    };
  }

  try {
    return { ok: true, patch: parseModelJson(repairResult.stdout || "") };
  } catch (repairError) {
    return {
      ok: false,
      exactProblem: sanitizeText(repairError.message),
      failedChecks: [
        "Execution patch JSON parse failed.",
        "Repair-only JSON regeneration also failed.",
      ],
    };
  }
}

function buildCompactExecutionBrief(task, actionPlanText) {
  const approvedRoots = extractApprovedWriteRoots(task);
  const expectedFiles = extractExpectedFiles(task);
  const sections = [
    `Task summary: ${sanitizeText(task.body.summary || task.title).trim()}`,
    getPreferredApprovedActionText(task)
      ? `Approved action: ${getPreferredApprovedActionText(task)}`
      : "",
    approvedRoots.length > 0 ? `Allowed write roots: ${approvedRoots.join(", ")}` : "",
    formatListSection("Expected files", expectedFiles),
    formatListSection("Verification targets", extractVerificationTargets(task)),
    formatListSection("Critical constraints", extractConstraintLines(task)),
    formatListSection("Execution notes", extractActionPlanHighlights(actionPlanText)),
  ].filter(Boolean);

  return truncateForLocalExecutor(sections.join("\n\n"), 3600);
}

function buildCompactScopeBrief(task, actionPlanText) {
  const approvedRoots = extractApprovedWriteRoots(task);
  const expectedFiles = extractExpectedFiles(task);
  const sections = [
    `Task summary: ${sanitizeText(task.body.summary || task.title).trim()}`,
    approvedRoots.length > 0 ? `Allowed write roots: ${approvedRoots.join(", ")}` : "",
    formatListSection("Expected files", expectedFiles),
    formatListSection("Critical constraints", extractConstraintLines(task)),
    formatListSection("Execution notes", extractActionPlanHighlights(actionPlanText, 4)),
  ].filter(Boolean);

  return truncateForLocalExecutor(sections.join("\n\n"), 2200);
}

function extractExpectedFiles(task) {
  const source = [
    sanitizeText(task.body.proposed_action),
    sanitizeText(task.body.gpt_plan),
    sanitizeText(task.body.qwen_action_plan_for_approval),
    sanitizeText(task.body.machine_task_json),
  ]
    .filter(Boolean)
    .join("\n");
  const approvedRoots = extractApprovedWriteRoots(task);
  const defaultRoot = approvedRoots[0] || "";
  const results = [];
  const lines = source
    .split(/\r?\n/)
    .map((line) => sanitizeText(line).trim())
    .filter(Boolean);

  for (const line of lines) {
    const isExpectedFootprintLine = /^(Files:|Expected file footprint:)/i.test(line);
    const isExplicitFileBullet = /^-\s+(?:[A-Z]:\\|\.[A-Za-z0-9]|[A-Za-z0-9_.-]+(?:[\\/])|[A-Za-z0-9_.-]+\.[A-Za-z0-9]+)\b/i.test(line);
    if (!isExpectedFootprintLine && !isExplicitFileBullet) {
      continue;
    }
    for (const candidate of extractFilePathCandidates(line, defaultRoot)) {
      results.push(candidate);
    }
  }

  return uniqueList(results).slice(0, 16);
}

function extractFilePathCandidates(line, defaultRoot) {
  const normalizedRoot = normalizeWindowsPath(defaultRoot);
  const cleanedLine = sanitizeText(line)
    .replace(/^(Files:|Expected file footprint:)\s*/i, "")
    .replace(/^-+\s*/, "")
    .trim();

  if (!cleanedLine) {
    return [];
  }

  const candidates = [];
  const absoluteMatches = cleanedLine.match(/[A-Z]:\\[^\s,;\r\n]+/g) || [];
  for (const match of absoluteMatches) {
    const clean = normalizeWindowsPath(match.replace(/[;,.]+$/g, "").trim());
    if (clean && looksLikeExpectedFilePath(clean, normalizedRoot)) {
      candidates.push(clean);
    }
  }

  if (candidates.length > 0) {
    return candidates;
  }

  if (!normalizedRoot) {
    return [];
  }

  const segments = cleanedLine
    .split(",")
    .map((segment) => segment.trim().replace(/[;,.]+$/g, ""))
    .filter(Boolean);

  for (const segment of segments) {
    if (/\s/.test(segment)) {
      continue;
    }
    if (!/[\\/]/.test(segment) && !/\.[A-Za-z0-9]+$/.test(segment) && !segment.startsWith(".")) {
      continue;
    }
    const candidate = normalizeWindowsPath(path.join(normalizedRoot, segment));
    if (looksLikeExpectedFilePath(candidate, normalizedRoot)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function extractVerificationTargets(task) {
  const lines = sanitizeText(getExecutionSignalText(task))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const results = [];
  let captureNext = false;
  for (const line of lines) {
    if (/^Verification target:?$/i.test(line)) {
      captureNext = true;
      continue;
    }
    if (captureNext) {
      results.push(line.replace(/^-+\s*/, ""));
      captureNext = false;
      continue;
    }
    if (/^(verify|verification|acceptance criteria)/i.test(line)) {
      results.push(line.replace(/^-+\s*/, ""));
    }
  }

  return uniqueList(results).slice(0, 8);
}

function extractConstraintLines(task) {
  return uniqueList(
    sanitizeText(task.body.constraints_guardrails)
      .split(/\r?\n/)
      .map((line) => line.replace(/^-+\s*/, "").trim())
      .filter(Boolean),
  ).slice(0, 8);
}

function extractActionPlanHighlights(actionPlanText, limit = 6) {
  const lines = sanitizeText(actionPlanText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const results = [];
  for (const line of lines) {
    if (/^(Task:|Execution Owner:|Execution Mode:|Action Plan:|Verification:|GPT Plan Reference:)/i.test(line)) {
      continue;
    }
    if (/^(No direct repo or cloud writes|Do not run git init|Unless the approved task explicitly authorizes version-control actions)/i.test(line)) {
      results.push(line);
      continue;
    }
    if (/^(Re-read|Execute only|Stop and escalate|Record exact outputs|Confirm the intended artifact|Run the narrowest relevant verification)/i.test(line)) {
      results.push(line);
      continue;
    }
    if (/^(Files:|Expected file footprint:|Verification target:)/i.test(line)) {
      results.push(line);
    }
  }

  return uniqueList(results).slice(0, limit);
}

function formatListSection(title, entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "";
  }
  return `${title}:\n${entries.map((entry) => `- ${sanitizeText(entry)}`).join("\n")}`;
}

function uniqueList(entries) {
  return Array.from(
    new Set(
      (entries || [])
        .map((entry) => sanitizeText(entry).trim())
        .filter(Boolean),
    ),
  );
}

function truncateForLocalExecutor(text, maxLength) {
  const clean = sanitizeText(text).trim();
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, maxLength - 20).trim()}\n\n[truncated for local executor]`;
}

function extractApprovedWriteRoots(task) {
  const text = [
    sanitizeText(task.body.constraints_guardrails),
    sanitizeText(task.body.affected_components),
    sanitizeText(task.body.machine_task_json),
    getExecutionSignalText(task),
  ]
    .filter(Boolean)
    .join("\n");

  const explicitRoots = [];
  const explicitPattern = /All file writes must occur in\s+"?([A-Z]:\\[^"\s\r\n]+)"?/gi;
  let explicitMatch;
  while ((explicitMatch = explicitPattern.exec(text))) {
    const candidate = sanitizeApprovedRootCandidate(explicitMatch[1]);
    if (candidate) {
      explicitRoots.push(candidate);
    }
  }
  if (explicitRoots.length > 0) {
    return Array.from(new Set(explicitRoots.filter(Boolean)));
  }

  const pathMatches = text.match(/[A-Z]:\\[^\s"';,\n]+/g) || [];
  const inferredRoots = pathMatches
    .map((entry) => inferProjectRootFromPath(entry))
    .filter(Boolean);
  return Array.from(new Set(inferredRoots));
}

function inferProjectRootFromPath(filePath) {
  const normalized = sanitizeApprovedRootCandidate(filePath);
  if (!normalized) {
    return "";
  }
  const match = normalized.match(/^([A-Z]:\\[^\\]+)(?:\\.*)?$/i);
  return match ? match[1] : normalized;
}

function normalizeWindowsPath(value) {
  return sanitizeText(value).trim().replace(/\//g, "\\").replace(/\\+$/, "");
}

function sanitizeApprovedRootCandidate(value) {
  const normalized = normalizeWindowsPath(value).replace(/[.]+$/g, "");
  if (!/^[A-Z]:\\/i.test(normalized)) {
    return "";
  }
  return normalized;
}

function looksLikeExpectedFilePath(candidatePath, defaultRoot = "") {
  const normalized = normalizeWindowsPath(candidatePath);
  if (!normalized || normalized === normalizeWindowsPath(defaultRoot)) {
    return false;
  }

  const basename = path.basename(normalized);
  if (basename.startsWith(".")) {
    return true;
  }

  if (/README(?:\.[A-Za-z0-9]+)?$/i.test(basename)) {
    return true;
  }

  return /\.[A-Za-z0-9]+$/i.test(basename);
}

function getExecutionSignalText(task) {
  return [
    sanitizeText(task.body.full_context),
    sanitizeText(task.body.proposed_action),
    sanitizeText(task.body.gpt_plan),
    sanitizeText(task.body.qwen_action_plan_for_approval),
    sanitizeText(task.body.prompt_package_for_approval),
    sanitizeText(task.operator_notes),
    sanitizeText(task.revised_instructions),
  ]
    .filter(Boolean)
    .join("\n");
}

function getPreferredApprovedActionText(task) {
  return sanitizeText(task.body.proposed_action || "").trim() || "";
}

function ensureApprovedRootsReady(task, approvedRoots, expectedFiles) {
  const root = approvedRoots[0] || "";
  if (!root) {
    return {
      ok: false,
      failureSummary: "No approved write root was found for the execution task.",
      exactProblem: "The execution task did not provide an approved local write root.",
      failedChecks: ["approved_write_root_present = false"],
      requiredChanges: ["Update the task context so the approved write root is explicit."],
    };
  }

  fs.mkdirSync(root, { recursive: true });
  if (!shouldEnforceScaffoldFootprint(task)) {
    return { ok: true };
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const expectedSet = buildAllowedScaffoldEntrySet(root, expectedFiles);
  const unexpected = [];

  for (const entry of entries) {
    const entryPath = normalizeWindowsPath(path.join(root, entry.name));
    if (!expectedSet.has(entryPath.toLowerCase())) {
      unexpected.push(entryPath);
    }
  }

  if (unexpected.length > 0) {
    return {
      ok: false,
      failureSummary: "Approved write root contains files that are outside the current scaffold footprint.",
      exactProblem: `Unexpected existing entries in ${root}: ${unexpected.join(", ")}`,
      failedChecks: unexpected.map((entryPath) => `unexpected_entry(${entryPath}) = true`),
      requiredChanges: ["Review the existing directory contents before rerunning the scaffold task."],
    };
  }

  return { ok: true };
}

function shouldEnforceScaffoldFootprint(task) {
  const signalText = [
    sanitizeText(task.title),
    sanitizeText(task.body.summary),
    sanitizeText(task.body.proposed_action),
    sanitizeText(task.operator_notes),
  ]
    .filter(Boolean)
    .join("\n");

  return /(repo scaffold|scaffold ready|project scaffold|scaffold task|app router scaffold|initialize(?: the)? repo|initialize(?: the)? project|bootstrap(?: the)? repo|bootstrap(?: the)? project)/i.test(
    signalText,
  );
}

function buildAllowedScaffoldEntrySet(root, expectedFiles) {
  const allowed = new Set();

  for (const filePath of expectedFiles) {
    if (!isPathWithinApprovedRoot(filePath, root)) {
      continue;
    }

    let current = normalizeWindowsPath(filePath);
    while (current && isPathWithinApprovedRoot(current, root)) {
      allowed.add(current.toLowerCase());
      if (normalizeWindowsPath(current) === normalizeWindowsPath(root)) {
        break;
      }
      current = normalizeWindowsPath(path.dirname(current));
      if (!current || current === "." || current === path.dirname(current)) {
        break;
      }
    }
  }

  const commonGeneratedEntries = [
    ".git",
    ".next",
    "node_modules",
    "package-lock.json",
  ];
  for (const entry of commonGeneratedEntries) {
    allowed.add(normalizeWindowsPath(path.join(root, entry)).toLowerCase());
  }

  return allowed;
}

function buildFileGenerationPrompt(task, actionPlanText, targetFile, expectedFiles) {
  const extension = path.extname(targetFile).toLowerCase();
  const workspaceContext = buildWorkspaceContextForTarget(task, targetFile, expectedFiles);
  const rules = [
    "Return only the complete contents of the target file.",
    "Do not return markdown fences, JSON wrappers, explanations, or commentary.",
    extension === ".json"
      ? "Return valid JSON only."
      : "Return plain file contents only.",
    "Do not say you cannot access local files or ask for more context.",
    "You are generating the file contents using the approved plan plus the authoritative workspace snapshot below.",
    "",
    `Task: ${sanitizeText(task.title)}`,
    `Target file: ${targetFile}`,
    `Approved root: ${extractApprovedWriteRoots(task)[0] || ""}`,
    "",
    "Expected project file set:",
    ...expectedFiles.map((filePath) => `- ${filePath}`),
    "",
    "File-specific requirements:",
    ...extractFileSpecificRequirements(actionPlanText, targetFile).map((line) => `- ${line}`),
    "",
    "Project-wide execution notes:",
    ...extractActionPlanHighlights(actionPlanText, 10).map((line) => `- ${line}`),
    "",
    "Framework and file rules:",
    ...getFrameworkRulesForTarget(targetFile).map((line) => `- ${line}`),
    "",
    "Workspace snapshot:",
    workspaceContext,
  ];
  return truncateForLocalExecutor(rules.join("\n"), 7000);
}

function extractFileSpecificRequirements(actionPlanText, targetFile) {
  const lines = sanitizeText(actionPlanText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const normalizedTarget = normalizeWindowsPath(targetFile).toLowerCase();
  const basename = path.basename(targetFile).toLowerCase();
  const results = [];
  let capture = false;

  for (const line of lines) {
    const clean = line.replace(/^-+\s*/, "").trim();
    const normalizedLine = normalizeWindowsPath(clean).toLowerCase();
    const lineStartsNewFile =
      /^[A-Z]:\\/.test(clean) ||
      /^[A-Z]:\\/.test(normalizedLine) ||
      /[A-Z]:\\/.test(clean);

    if (!capture) {
      if (normalizedLine === normalizedTarget || clean.toLowerCase() === basename || clean.toLowerCase().endsWith(`\\${basename}`)) {
        capture = true;
      }
      continue;
    }

    if (!line.startsWith("-")) {
      break;
    }
    if (lineStartsNewFile && !clean.toLowerCase().includes(basename)) {
      break;
    }
    results.push(clean);
  }

  if (results.length > 0) {
    return results;
  }

  return getFallbackFileRequirements(targetFile);
}

function getFallbackFileRequirements(targetFile) {
  const normalized = normalizeWindowsPath(targetFile).toLowerCase();
  const basename = path.basename(normalized);
  if (basename === "package.json") {
    return [
      'Set name to "mobile-detailing-app", private true, version "0.1.0".',
      'Include scripts dev/build/start for Next.js.',
      'Pin next 14.1.0, react 18.2.0, react-dom 18.2.0.',
      'Add devDependencies for TypeScript, @types/react, and @types/node.',
      'Set engines.node to ">=18.17.0".',
    ];
  }
  if (basename === "next.config.js") {
    return ['Export reactStrictMode true and include a JSDoc Next.js config type hint.'];
  }
  if (basename === "tsconfig.json") {
    return [
      "Use a strict Next.js App Router TypeScript config with noEmit and jsx preserve.",
      'Include alias "@/*" -> ["./*"].',
    ];
  }
  if (basename === ".gitignore") {
    return ["Ignore node_modules, .next, out, dist, coverage, *.log, and .env*.local."];
  }
  if (basename === "readme.md") {
    return [
      "Document project purpose, npm install, npm run dev, Node >=18.17.0, and that this is still pending Notion review.",
    ];
  }
  if (basename === "globals.css") {
    return ["Provide a minimal reset and simple body typography without Tailwind."];
  }
  if (basename === "layout.tsx") {
    return [
      "Import ./globals.css.",
      "Export metadata with the specified title and description.",
      'Render <html lang="en"><body>{children}</body></html>.',
    ];
  }
  if (basename === "page.tsx") {
    return ['Render a main element with h1 "Mobile Detailing App" and a short scaffold-ready paragraph.'];
  }
  return ["Match the approved action plan for this target file exactly."];
}

function prepareGeneratedFileContent(targetFile, rawOutput) {
  const rawText = sanitizeText(rawOutput).trim();
  const suspicious = detectModelFileOutputIssues(targetFile, rawText);
  if (suspicious.length > 0) {
    return {
      ok: false,
      exactProblem: `Model returned non-file content: ${suspicious.join("; ")}`,
      failedChecks: suspicious.map((issue) => `${issue}(${targetFile}) = true`),
    };
  }
  const cleaned = extractPreferredContentBlock(rawText);
  if (!cleaned) {
    return {
      ok: false,
      exactProblem: "Model returned empty file content.",
      failedChecks: [`generated_content_present(${targetFile}) = false`],
    };
  }

  if (path.extname(targetFile).toLowerCase() === ".json") {
    try {
      const parsed = JSON.parse(repairJsonControlCharacters(extractLikelyJsonObject(cleaned)));
      return { ok: true, content: `${JSON.stringify(parsed, null, 2)}\n` };
    } catch (error) {
      return {
        ok: false,
        exactProblem: `Invalid JSON content: ${sanitizeText(error.message)}`,
        failedChecks: [`valid_json(${targetFile}) = false`],
      };
    }
  }

  if (/^here('| i)?s\b|^i (updated|created|wrote)\b|^it seems like\b|^however\b|^based on your/i.test(cleaned)) {
    return {
      ok: false,
      exactProblem: "Model returned commentary instead of raw file contents.",
      failedChecks: [`raw_file_only(${targetFile}) = false`],
    };
  }

  return { ok: true, content: `${cleaned.replace(/\s+$/g, "")}\n` };
}

function detectModelFileOutputIssues(targetFile, rawText) {
  const issues = [];
  const text = String(rawText || "").trim();
  if (!text) {
    return issues;
  }

  if (/i (?:do not|don't) have direct access to files|can't access your local files|cannot access your local files|however, i can provide guidance|it seems like you're asking/i.test(text)) {
    issues.push("model_apology_or_guidance");
  }
  if (/react native/i.test(text)) {
    issues.push("wrong_framework_reference");
  }
  if (/```[\s\S]*```[\s\S]+\S/.test(text)) {
    issues.push("extra_text_outside_code_block");
  }

  const extension = path.extname(targetFile).toLowerCase();
  const cleaned = extractPreferredContentBlock(text);
  if ((extension === ".tsx" || extension === ".ts" || extension === ".js") && /^\s*(Here|And|In your|This will|Sorry|I('| a)m|Keep in mind)/i.test(cleaned)) {
    issues.push("commentary_in_code_file");
  }

  return uniqueList(issues);
}

function extractPreferredContentBlock(input) {
  const text = String(input || "").trim();
  const fencedMatch = text.match(/```(?:[A-Za-z0-9_-]+)?\s*([\s\S]*?)```/);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }
  return stripMarkdownCodeFences(text);
}

function runLocalWriteVerification(projectRoot) {
  if (!projectRoot || !fs.existsSync(projectRoot)) {
    return {
      ok: false,
      exactProblem: "Project root is missing for local verification.",
      steps: [],
      stdout: "",
      stderr: "",
    };
  }

  const install = runNpmCommand(projectRoot, ["install"]);
  const installStdout = sanitizeText(install.stdout || "");
  const installStderr = sanitizeText(install.stderr || "");
  if (install.error || install.status !== 0) {
    return {
      ok: false,
      exactProblem: install.error
        ? sanitizeText(install.error.message)
        : installStderr || installStdout || `npm install exited ${install.status}`,
      steps: ["npm install"],
      stdout: installStdout,
      stderr: installStderr,
    };
  }

  const build = runNpmCommand(projectRoot, ["run", "build"]);
  const buildStdout = sanitizeText(build.stdout || "");
  const buildStderr = sanitizeText(build.stderr || "");
  if (build.error || build.status !== 0) {
    return {
      ok: false,
      exactProblem: build.error
        ? sanitizeText(build.error.message)
        : buildStderr || buildStdout || `npm run build exited ${build.status}`,
      steps: ["npm install", "npm run build"],
      stdout: `${installStdout}\n${buildStdout}`.trim(),
      stderr: `${installStderr}\n${buildStderr}`.trim(),
    };
  }

  return {
    ok: true,
    steps: ["npm install", "npm run build"],
    stdout: `${installStdout}\n${buildStdout}`.trim(),
    stderr: `${installStderr}\n${buildStderr}`.trim(),
  };
}

function extractRepairTargetsFromVerification(projectRoot, verification, expectedFiles) {
  const stderr = sanitizeText(verification.stderr || verification.exactProblem || "");
  const targets = [];
  const expectedMap = new Map(
    expectedFiles.map((filePath) => [normalizeWindowsPath(filePath).toLowerCase(), filePath]),
  );

  const fileMatches = stderr.match(/\.\/app\/[^\s:]+/g) || [];
  for (const match of fileMatches) {
    const normalized = normalizeWindowsPath(
      path.join(projectRoot, match.replace(/^\.\//, "").replace(/\//g, "\\")),
    ).toLowerCase();
    if (expectedMap.has(normalized)) {
      targets.push(expectedMap.get(normalized));
    }
  }

  if (/can't resolve '\.\/Header'|can't resolve '\.\/Footer'/i.test(stderr)) {
    const layoutTarget = expectedFiles.find((filePath) => /app\\layout\.tsx$/i.test(normalizeWindowsPath(filePath)));
    if (layoutTarget) {
      targets.push(layoutTarget);
    }
  }

  return uniqueList(targets);
}

function buildVerificationRepairPrompt(task, actionPlanText, targetFile, currentContent, verification, expectedFiles) {
  const basename = path.basename(targetFile);
  const workspaceContext = buildWorkspaceContextForTarget(task, targetFile, expectedFiles, currentContent);
  return [
    "Repair the target file so the Next.js build error is resolved.",
    "Return only the complete contents of the target file.",
    "Do not include markdown fences, explanations, apologies, or commentary.",
    `Task: ${sanitizeText(task.title)}`,
    `Target file: ${targetFile}`,
    `Approved root: ${extractApprovedWriteRoots(task)[0] || ""}`,
    "",
    "Current file contents:",
    currentContent || "[missing file]",
    "",
    "Build/runtime error to fix:",
    sanitizeText(verification.stderr || verification.exactProblem || ""),
    "",
    "Expected project file set:",
    ...expectedFiles.map((filePath) => `- ${filePath}`),
    "",
    "Approved task context:",
    ...extractActionPlanHighlights(actionPlanText, 8).map((line) => `- ${line}`),
    "",
    "Framework and file rules:",
    ...getFrameworkRulesForTarget(targetFile).map((line) => `- ${line}`),
    "",
    "Workspace snapshot:",
    workspaceContext,
    "",
    `Fix only ${basename}. If the error mentions imports, correct the import paths to match the approved file footprint exactly.`,
  ].join("\n");
}

function buildWorkspaceContextForTarget(task, targetFile, expectedFiles, currentContentOverride = null) {
  const approvedRoot = extractApprovedWriteRoots(task)[0] || "";
  const sections = [];
  const targetContent =
    currentContentOverride != null ? currentContentOverride : safeReadFile(targetFile);

  sections.push(
    buildContextSection(
      `Current target file (${targetFile})`,
      targetContent || "[missing file]",
      1400,
    ),
  );

  const packageJsonPath = approvedRoot ? path.join(approvedRoot, "package.json") : "";
  if (packageJsonPath && normalizeWindowsPath(packageJsonPath).toLowerCase() !== normalizeWindowsPath(targetFile).toLowerCase()) {
    const packageJson = safeReadFile(packageJsonPath);
    if (packageJson) {
      sections.push(buildContextSection("Project package.json", packageJson, 1200));
    }
  }

  const globalsCssPath = approvedRoot ? path.join(approvedRoot, "app", "globals.css") : "";
  if (
    globalsCssPath &&
    normalizeWindowsPath(globalsCssPath).toLowerCase() !== normalizeWindowsPath(targetFile).toLowerCase()
  ) {
    const globalsCss = safeReadFile(globalsCssPath);
    if (globalsCss) {
      sections.push(buildContextSection("app/globals.css", globalsCss, 900));
    }
  }

  const siblingTargets = expectedFiles
    .filter((filePath) => normalizeWindowsPath(filePath).toLowerCase() !== normalizeWindowsPath(targetFile).toLowerCase())
    .filter((filePath) => shouldIncludeRelatedFile(targetFile, filePath))
    .slice(0, 4);

  for (const sibling of siblingTargets) {
    const content = safeReadFile(sibling);
    sections.push(
      buildContextSection(
        `Related file (${sibling})`,
        content || "[missing file]",
        900,
      ),
    );
  }

  const fileTree = buildMiniFileTree(approvedRoot || path.dirname(targetFile), expectedFiles);
  if (fileTree) {
    sections.push(`Relevant file tree:\n${fileTree}`);
  }

  return sections.filter(Boolean).join("\n\n");
}

function buildContextSection(title, content, maxLength) {
  return `${title}:\n${truncateForLocalExecutor(sanitizeText(content || "").trim() || "[empty]", maxLength)}`;
}

function shouldIncludeRelatedFile(targetFile, candidateFile) {
  const targetNormalized = normalizeWindowsPath(targetFile).toLowerCase();
  const candidateNormalized = normalizeWindowsPath(candidateFile).toLowerCase();
  const targetDir = path.dirname(targetNormalized);
  const candidateDir = path.dirname(candidateNormalized);

  if (targetDir === candidateDir) {
    return true;
  }
  if (/\\app\\layout\.tsx$/i.test(targetNormalized) && /\\app\\\(components\)\\.+\.tsx$/i.test(candidateNormalized)) {
    return true;
  }
  if (/\\app\\\(components\)\\.+\.tsx$/i.test(targetNormalized) && /\\app\\layout\.tsx$/i.test(candidateNormalized)) {
    return true;
  }
  return false;
}

function buildMiniFileTree(root, expectedFiles) {
  const normalizedRoot = normalizeWindowsPath(root);
  if (!normalizedRoot) {
    return "";
  }

  const entries = uniqueList(
    expectedFiles
      .map((filePath) => normalizeWindowsPath(filePath))
      .filter(Boolean)
      .map((filePath) => path.relative(normalizedRoot, filePath))
      .filter((relativePath) => relativePath && !relativePath.startsWith(".."))
      .map((relativePath) => relativePath.replace(/\\/g, "/")),
  );

  return entries.length > 0 ? entries.map((entry) => `- ${entry}`).join("\n") : "";
}

function getFrameworkRulesForTarget(targetFile) {
  const normalized = normalizeWindowsPath(targetFile).toLowerCase();
  const basename = path.basename(normalized);
  const rules = [];

  if (/\\app\\/.test(normalized) && /\.(tsx|ts|jsx|js)$/.test(basename)) {
    rules.push("This project is a Next.js app using React DOM and the app directory.");
    rules.push("Do not use react-native imports, components, or APIs.");
    rules.push("Do not use NextPage in app/ files.");
  }

  if (/\\app\\layout\.tsx$/.test(normalized)) {
    rules.push("Use App Router layout semantics: export metadata and render html/body.");
    rules.push("Do not use next/head inside app/layout.tsx.");
    rules.push("Import Header and Footer from the actual related file paths shown in the workspace snapshot.");
  }

  if (/\\app\\\(components\)\\.+\.tsx$/.test(normalized)) {
    rules.push("Use standard React/Next.js JSX with HTML elements and next/link when navigation is needed.");
    rules.push("Do not include markdown fences, placeholder commentary, or escaped garbage tokens.");
  }

  return rules.length > 0 ? rules : ["Match the approved file contract exactly."];
}

function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return "";
  }
}

function getExecutionActorName(model) {
  const text = sanitizeText(model).trim().toLowerCase();
  if (!text) {
    return "Executor";
  }
  if (text.includes("claude")) {
    return "Claude";
  }
  if (text.includes("deepseek")) {
    return "DeepSeek";
  }
  if (text.includes("qwen")) {
    return "Qwen";
  }
  return sanitizeText(model).trim();
}

function runNpmCommand(projectRoot, args) {
  if (process.platform === "win32") {
    const cmd = process.env.ComSpec || "cmd.exe";
    return spawnSync(cmd, ["/d", "/s", "/c", "npm.cmd", ...args], {
      cwd: projectRoot,
      encoding: "utf8",
      timeout: LOCAL_WRITE_TIMEOUT_MS,
    });
  }

  return spawnSync("npm", args, {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: LOCAL_WRITE_TIMEOUT_MS,
  });
}

function buildLocalWriteOutcome(expectedFiles, verification) {
  const fileCount = expectedFiles.length;
  if (verification.ok) {
    return `Wrote ${fileCount} scaffold files in E:\\Mobiledets and verified with npm install plus npm run build.`;
  }
  return `Wrote ${fileCount} scaffold files in E:\\Mobiledets, but verification failed: ${sanitizeText(verification.exactProblem).slice(0, 120)}.`;
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "artifact";
}

function isPathWithinApprovedRoot(candidatePath, approvedRoot) {
  const candidate = normalizeWindowsPath(candidatePath).toLowerCase();
  const root = normalizeWindowsPath(approvedRoot).toLowerCase();
  return candidate === root || candidate.startsWith(`${root}\\`);
}

function getExecutionRetryLimit(failureCode) {
  return EXECUTION_RETRY_LIMITS[failureCode] || EXECUTION_RETRY_LIMITS.default;
}

function getExecutionRetryMeta(task, failureCode) {
  const retryLimit = getExecutionRetryLimit(failureCode);
  const retryable = task.stage_retry_count < retryLimit;
  return {
    retryLimit,
    retryable,
    nextOwner: retryable ? "qwen" : "operator",
  };
}

function stripMarkdownCodeFences(input) {
  return String(input || "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function extractLikelyJsonObject(input) {
  const text = String(input || "");
  const firstBrace = text.indexOf("{");
  if (firstBrace === -1) {
    return text.trim();
  }

  let inString = false;
  let escaped = false;
  let depth = 0;

  for (let index = firstBrace; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(firstBrace, index + 1).trim();
      }
    }
  }

  const lastBrace = text.lastIndexOf("}");
  return lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1).trim() : text.trim();
}

function repairJsonControlCharacters(input) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      output += char;
      inString = !inString;
      continue;
    }

    if (inString) {
      if (char === "\n") {
        output += "\\n";
        continue;
      }
      if (char === "\r") {
        output += "\\r";
        continue;
      }
      if (char === "\t") {
        output += "\\t";
        continue;
      }
      const code = char.charCodeAt(0);
      if (code < 0x20) {
        output += " ";
        continue;
      }
    }

    output += char;
  }

  return output;
}

function readTask(taskPath) {
  return JSON.parse(fs.readFileSync(taskPath, "utf8"));
}

function readOptionalFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function getQwenExecutorContractText() {
  if (cachedQwenExecutorContract != null) {
    return cachedQwenExecutorContract;
  }

  try {
    cachedQwenExecutorContract = sanitizeText(
      fs.readFileSync(QWEN_EXECUTOR_CONTRACT_PATH, "utf8"),
    ).trim();
  } catch (error) {
    cachedQwenExecutorContract = [
      "Contract purpose: execute only the approved bounded task for the current stage.",
      "Output contract: return one-line JSON only; no markdown; escape newlines as \\n.",
      'Allowed schema: {"body":{"final_outcome":"..."},"reframe_required":false}',
      "If blocked or scope would widen, set reframe_required=true and include failure_reason.",
    ].join("\n");
  }

  return cachedQwenExecutorContract;
}

function ensurePromptPackageArtifact(task) {
  let promptText = readOptionalFile(task.artifacts["prompt-package.md"]).trim();
  if (promptText) {
    return promptText;
  }

  const bodyPromptText = sanitizeText(task.body.prompt_package_for_approval).trim();
  if (bodyPromptText) {
    writeArtifact(task, "prompt-package.md", `${bodyPromptText}\n`);
    const machineTaskJson = sanitizeText(task.body.machine_task_json).trim();
    if (machineTaskJson) {
      writeArtifact(task, "machine-task.json", `${machineTaskJson}\n`);
    }
    return bodyPromptText;
  }

  const machineTask = buildMachineTask(task);
  const template = getTemplateByName(task.current_prompt_template || DEFAULT_PROMPT_TEMPLATE);
  const templateBody = template ? template.body : "";
  promptText = buildPromptPackage(task, templateBody, machineTask);

  writeArtifact(task, "machine-task.json", `${JSON.stringify(machineTask, null, 2)}\n`);
  writeArtifact(task, "prompt-package.md", `${promptText}\n`);
  task.body.machine_task_json = JSON.stringify(machineTask, null, 2);
  task.body.prompt_template_selection = [
    `Template: ${task.current_prompt_template || DEFAULT_PROMPT_TEMPLATE}`,
    `Route target: ${task.route_target}`,
  ].join("\n");
  task.body.prompt_package_for_approval = promptText;
  return promptText;
}

function ensureActionPlanArtifact(task) {
  let actionPlanText = readOptionalFile(task.artifacts["qwen-action-plan.md"]).trim();
  if (actionPlanText) {
    return actionPlanText;
  }

  const bodyActionPlanText = sanitizeText(task.body.qwen_action_plan_for_approval).trim();
  if (bodyActionPlanText) {
    writeArtifact(task, "qwen-action-plan.md", `${bodyActionPlanText}\n`);
    return bodyActionPlanText;
  }

  const gptPlanText =
    readOptionalFile(task.artifacts["gpt-plan.md"]).trim() ||
    sanitizeText(task.body.gpt_plan).trim();
  if (!gptPlanText) {
    return "";
  }

  actionPlanText = buildActionPlan(task, gptPlanText);
  writeArtifact(task, "qwen-action-plan.md", `${actionPlanText}\n`);
  task.body.qwen_action_plan_for_approval = actionPlanText;
  return actionPlanText;
}

function resetWorkflowOutputs(task, scope) {
  if (scope === "prompt") {
    task.body.librarian_validation_notes = "";
    task.body.gpt_plan = "";
    task.body.qwen_action_plan_for_approval = "";
    task.body.failure_report = "";
    task.body.escalation_notes = "";
    task.body.final_outcome = "";
    task.approval_gate = APPROVAL_GATE.PROMPT;
    return;
  }

  if (scope === "action_plan") {
    task.body.failure_report = "";
    task.body.escalation_notes = "";
    task.body.final_outcome = "";
    return;
  }
}

function isPlanningOnlyTask(task) {
  if (task.planning_only === true) {
    return true;
  }

  return sanitizeText(task.current_prompt_template).trim() === "Project intake / planning prompt";
}

function isValidCompletedTaskState(task) {
  if (sanitizeText(task.status).trim() !== STATUS.COMPLETED) {
    return true;
  }

  const finalOutcome = sanitizeText(task.body && task.body.final_outcome).trim();
  if (!finalOutcome) {
    return false;
  }

  if (isPlanningOnlyTask(task)) {
    return true;
  }

  const history = sanitizeText(task.body && task.body.attempt_history).toLowerCase();
  return (
    history.includes("execution completed; running verification.") &&
    history.includes("verification passed:")
  );
}

function repairInvalidCompletedTaskState(task) {
  const resetState = inferResetStateForInvalidCompletion(task);
  clearFailureState(task);
  task.status = resetState.status;
  task.workflow_stage = resetState.workflowStage;
  task.approval_gate = resetState.approvalGate;
  task.sync_status = "Not Synced";
  task.body.final_outcome = "";
  appendAttemptHistory(
    task,
    `Invalid completed state detected; task reset to ${resetState.workflowStage} because execution and verification evidence were incomplete.`,
  );
  log(
    `Reset invalid completed state for ${task.task_id} to ${resetState.status} / ${resetState.workflowStage}.`,
    "WARN",
  );
}

function inferResetStateForInvalidCompletion(task) {
  if (sanitizeText(task.body && task.body.qwen_action_plan_for_approval).trim()) {
    return {
      status: STATUS.PENDING_REVIEW,
      workflowStage: STAGE.ACTION_PLAN_APPROVAL,
      approvalGate: APPROVAL_GATE.ACTION_PLAN,
    };
  }

  if (sanitizeText(task.body && task.body.prompt_package_for_approval).trim()) {
    return {
      status: STATUS.PENDING_REVIEW,
      workflowStage: STAGE.PROMPT_APPROVAL,
      approvalGate: APPROVAL_GATE.PROMPT,
    };
  }

  return {
    status: STATUS.DRAFT,
    workflowStage: STAGE.TASK_INTAKE,
    approvalGate: APPROVAL_GATE.PROMPT,
  };
}

function isImplementationExecutionTask(task) {
  const promptTemplate = sanitizeText(task.current_prompt_template || task.body.current_prompt_template).trim();
  const approvalGate = sanitizeText(task.approval_gate || task.body.approval_gate).trim().toLowerCase();
  return (
    !isPlanningOnlyTask(task) &&
    (promptTemplate === DEFAULT_PROMPT_TEMPLATE || approvalGate === APPROVAL_GATE.ACTION_PLAN)
  );
}

function completePlanningOnlyTask(task) {
  clearFailureState(task);
  task.status = STATUS.COMPLETED;
  task.workflow_stage = STAGE.COMPLETED;
  task.sync_status = "Synced";
  task.execution_allowed = false;
  task.body.final_outcome = [
    "Planning package completed and verified.",
    "Approved outputs now include the project scope, architecture, phased roadmap, open questions, and bounded implementation backlog.",
    "Next step: create reviewable implementation tasks from the approved backlog; no execution phase was required for this planning-only intake.",
  ].join("\n");
  appendAttemptHistory(
    task,
    "Planning-only task completed after validated action plan; execution stage skipped.",
  );
}

function listQueueJsonFiles() {
  return fs
    .readdirSync(QUEUE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(QUEUE_DIR, entry.name))
    .sort();
}

function moveTaskToCompleted(taskPath) {
  const completedPath = path.join(COMPLETED_DIR, path.basename(taskPath));
  fs.mkdirSync(COMPLETED_DIR, { recursive: true });
  if (fs.existsSync(completedPath)) {
    fs.unlinkSync(completedPath);
  }
  if (fs.existsSync(taskPath)) {
    fs.renameSync(taskPath, completedPath);
  }
}

function maybeGenerateNextExecutionOrder(task) {
  const sequence = inferExecutionSequence(task);
  if (!sequence) {
    return;
  }

  const nextItem = sequence.currentItem + 1;
  const existingTaskId = buildGeneratedExecutionTaskId(sequence.projectName, nextItem, sequence.backlog);
  if (generatedTaskExists(existingTaskId)) {
    log(
      `Auto-sequence skipped for ${task.task_id}: next execution order already exists (${existingTaskId}).`,
    );
    return;
  }

  const result = spawnSync(
    process.execPath,
    [
      GENERATE_EXECUTION_ORDERS_SCRIPT,
      "--task-id",
      sequence.planningTaskId,
      "--items",
      String(nextItem),
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120_000,
      env: process.env,
    },
  );

  if (result.status !== 0) {
    log(
      `Auto-sequence failed for ${task.task_id}: ${sanitizeText(
        result.stderr || result.stdout || "unknown error",
      )}`,
      "WARN",
    );
    return;
  }

  log(
    `Auto-generated next execution order for ${task.task_id}: backlog item ${nextItem}.`,
  );
}

function inferExecutionSequence(task) {
  if (sanitizeText(task.status).trim() !== STATUS.COMPLETED) {
    return null;
  }
  if (sanitizeText(task.current_prompt_template).trim() !== "Standard execution prompt") {
    return null;
  }

  const triggerReason = sanitizeText(task.trigger_reason).trim();
  const match = triggerReason.match(/^Approved planning backlog item\s+(\d+)\s+from\s+([a-z0-9-]+)$/i);
  if (!match) {
    return null;
  }

  const currentItem = Number(match[1]);
  const planningTaskId = sanitizeText(match[2]).trim();
  if (!Number.isFinite(currentItem) || !planningTaskId) {
    return null;
  }

  const planningTask = loadTaskById(planningTaskId);
  if (!planningTask) {
    log(`Auto-sequence could not load planning task ${planningTaskId}.`, "WARN");
    return null;
  }

  const backlog = parseImplementationBacklogFromPlan(planningTask.body.gpt_plan);
  if (!Array.isArray(backlog) || backlog.length === 0) {
    return null;
  }
  if (!backlog.some((item) => item.number === currentItem)) {
    return null;
  }
  if (!backlog.some((item) => item.number === currentItem + 1)) {
    return null;
  }

  const projectName = sanitizeText(planningTask.title)
    .replace(/\s*-\s*Project Intake\s*$/i, "")
    .trim();

  return {
    planningTaskId,
    currentItem,
    backlog,
    projectName,
  };
}

function loadTaskById(taskId) {
  const fileName = `task-${sanitizeFileName(taskId)}.json`;
  const candidates = [
    path.join(QUEUE_DIR, fileName),
    path.join(COMPLETED_DIR, fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return normalizeTask(readTask(candidate));
    }
  }
  return null;
}

function generatedTaskExists(taskId) {
  const fileName = `task-${sanitizeFileName(taskId)}.json`;
  return (
    fs.existsSync(path.join(QUEUE_DIR, fileName)) ||
    fs.existsSync(path.join(COMPLETED_DIR, fileName))
  );
}

function parseImplementationBacklogFromPlan(planText) {
  const lines = sanitizeText(planText || "").split(/\r?\n/);
  const start = lines.findIndex((line) => /^Implementation backlog\b/i.test(line.trim()));
  if (start === -1) {
    return [];
  }

  const items = [];
  let current = null;
  let implicitNumber = 0;

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = sanitizeText(lines[index]).trim();
    if (!line) {
      continue;
    }
    if (/^(Verification and review flow|Escalation points|Notes)\b/i.test(line)) {
      break;
    }
    const match = line.match(/^(\d+)[\)\.]\s+(.+)$/);
    if (match) {
      if (current) {
        items.push(current);
      }
      current = {
        number: Number(match[1]),
        title: match[2].trim(),
      };
      continue;
    }
    if (isImplicitBacklogHeading(lines, index, line)) {
      implicitNumber += 1;
      current = {
        number: implicitNumber,
        title: line,
      };
    }
  }

  if (current) {
    items.push(current);
  }
  return items;
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

function buildGeneratedExecutionTaskId(projectName, backlogItemNumber, backlog) {
  const item = Array.isArray(backlog)
    ? backlog.find((entry) => entry.number === backlogItemNumber)
    : null;
  if (!item) {
    return "";
  }
  const backlogTag = String(backlogItemNumber).padStart(2, "0");
  return sanitizeFileName(
    `${sanitizeText(projectName).toLowerCase()}-exec-${backlogTag}-${sanitizeText(
      item.title,
    ).toLowerCase()}`,
  );
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function log(message, level = "INFO") {
  const line = `[${new Date().toISOString()}] [${level}] ${sanitizeText(message)}`;
  console.log(line);
  fs.appendFileSync(LOG_PATH, `${line}\n`, "utf8");
}
