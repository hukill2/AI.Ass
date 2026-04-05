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
const EXECUTION_RETRY_LIMITS = Object.freeze({
  execution_scope_self_check_invalid_json: 2,
  execution_scope_self_check_failed: 2,
  execution_runtime_error: 3,
  execution_invalid_json: 3,
  execution_missing_outcome: 3,
  verification_missing_artifacts: 2,
  verification_missing_expected_files: 2,
  verification_missing_outcome: 2,
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
      return { changed: true, stop: false };
    }
    if (decision === "deny") {
      task.status = STATUS.DENIED;
      task.sync_status = "Not Synced";
      return { changed: true, stop: true, notifyOperator: true, notifyReason: "Task denied." };
    }
    if (decision === "modify") {
      task.status = STATUS.NEEDS_EDIT;
      task.sync_status = "Synced";
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
    appendAttemptHistory(task, "Operator requested edits after escalation.");
    return { changed: true, stop: false };
  }

  if (decision === "deny") {
    task.status = STATUS.DENIED;
    task.sync_status = "Not Synced";
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
  const prompt = buildExecutionPrompt(task, actionPlanText);
  const runResult = invokeOllama(prompt);
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
      failureSummary: "Qwen execution failed before producing a usable result.",
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
        failureSummary: "Qwen execution output was not valid JSON.",
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
      failureSummary: "Qwen execution did not provide a final outcome summary.",
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
  appendAttemptHistory(task, "Qwen execution completed; running verification.");

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

function verifyExecution(task) {
  const artifactDir = getTaskArtifactDir(task);
  const exists = fs.existsSync(artifactDir);
  const outcome = sanitizeText(task.body.final_outcome).trim();
  const expectedFiles = extractExpectedFiles(task);
  if (!exists) {
    return {
      ok: false,
      failureCode: "verification_missing_artifacts",
      failureSummary: "Execution artifacts are missing.",
      exactProblem: `Artifact directory not found: ${artifactDir}`,
      failedChecks: [`artifact_dir_exists(${artifactDir}) = false`],
      requiredChanges: ["Re-run execution so artifacts are written before verification."],
      operatorMessage: `Why it failed: execution artifacts are missing.\nWhat is wrong now: ${artifactDir} does not exist.\nWhat Qwen/Librarian already tried: execution completed without a usable artifact bundle.\nWhat decision or edit is needed from you: review the task artifacts or request a rerun.`,
    };
  }
  if (!outcome) {
    return {
      ok: false,
      failureCode: "verification_missing_outcome",
      failureSummary: "Final outcome summary is missing after execution.",
      exactProblem: "body.final_outcome is empty.",
      failedChecks: ["final_outcome_present = false"],
      requiredChanges: ["Re-run execution and ensure a final outcome is recorded."],
      operatorMessage: "Why it failed: final outcome summary is missing.\nWhat is wrong now: the task page has no final outcome.\nWhat Qwen/Librarian already tried: execution completed but did not persist the result cleanly.\nWhat decision or edit is needed from you: request a rerun or update the task outcome manually.",
    };
  }
  if (expectedFiles.length > 0) {
    const missingFiles = expectedFiles.filter((filePath) => !fs.existsSync(filePath));
    if (missingFiles.length > 0) {
      return {
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
      };
    }
  }
  return {
    ok: true,
    command:
      expectedFiles.length > 0
        ? `fs-check ${expectedFiles.join(", ")}`
        : `artifact-check ${artifactDir}`,
  };
}

function handleExecutionFailure(task, failure) {
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
    "If execution is review-only, return a final_outcome that says exactly what review artifact or report was produced.",
    "Unless the approved task explicitly authorizes version-control actions, do not run git init, git add, git commit, git push, create branches, or open pull requests.",
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

function getPrimaryOllamaModel() {
  return sanitizeText(process.env.OLLAMA_MODEL || "qwen2.5-coder:7b").trim();
}

function getFallbackOllamaModel(primaryModel) {
  const fallback = sanitizeText(
    process.env.OLLAMA_FALLBACK_MODEL || "deepseek-coder:6.7b",
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

  const repairResult = invokeOllama(repairPrompt);
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
  const sections = [
    `Task summary: ${sanitizeText(task.body.summary || task.title).trim()}`,
    task.body.proposed_action
      ? `Approved action: ${sanitizeText(task.body.proposed_action).trim()}`
      : "",
    approvedRoots.length > 0 ? `Allowed write roots: ${approvedRoots.join(", ")}` : "",
    formatListSection("Expected files", extractExpectedFiles(task)),
    formatListSection("Verification targets", extractVerificationTargets(task)),
    formatListSection("Critical constraints", extractConstraintLines(task)),
    formatListSection("Execution notes", extractActionPlanHighlights(actionPlanText)),
  ].filter(Boolean);

  return truncateForLocalExecutor(sections.join("\n\n"), 3600);
}

function buildCompactScopeBrief(task, actionPlanText) {
  const approvedRoots = extractApprovedWriteRoots(task);
  const sections = [
    `Task summary: ${sanitizeText(task.body.summary || task.title).trim()}`,
    approvedRoots.length > 0 ? `Allowed write roots: ${approvedRoots.join(", ")}` : "",
    formatListSection("Expected files", extractExpectedFiles(task)),
    formatListSection("Critical constraints", extractConstraintLines(task)),
    formatListSection("Execution notes", extractActionPlanHighlights(actionPlanText, 4)),
  ].filter(Boolean);

  return truncateForLocalExecutor(sections.join("\n\n"), 2200);
}

function extractExpectedFiles(task) {
  const source = [
    sanitizeText(task.body.full_context),
    sanitizeText(task.body.proposed_action),
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
    if (!/^(Files:|Expected file footprint:|- )/i.test(line)) {
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
  const absoluteMatches = cleanedLine.match(/[A-Z]:\\[^,\r\n]+/g) || [];
  for (const match of absoluteMatches) {
    const clean = normalizeWindowsPath(match.replace(/[;,.]+$/g, "").trim());
    if (clean) {
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
    if (!/[\\/]/.test(segment) && !/\.[A-Za-z0-9]+$/.test(segment)) {
      continue;
    }
    candidates.push(normalizeWindowsPath(path.join(normalizedRoot, segment)));
  }

  return candidates;
}

function extractVerificationTargets(task) {
  const lines = sanitizeText(
    [task.body.full_context, task.body.proposed_action].filter(Boolean).join("\n"),
  )
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
    sanitizeText(task.body.full_context),
    sanitizeText(task.body.proposed_action),
    sanitizeText(task.body.affected_components),
    sanitizeText(task.body.machine_task_json),
  ]
    .filter(Boolean)
    .join("\n");

  const explicitRoots = [];
  const explicitPattern = /All file writes must occur in\s+"([^"]+)"/gi;
  let explicitMatch;
  while ((explicitMatch = explicitPattern.exec(text))) {
    explicitRoots.push(normalizeWindowsPath(explicitMatch[1]));
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
  const normalized = normalizeWindowsPath(filePath);
  const match = normalized.match(/^([A-Z]:\\[^\\]+)(?:\\.*)?$/i);
  return match ? match[1] : normalized;
}

function normalizeWindowsPath(value) {
  return sanitizeText(value).trim().replace(/\//g, "\\").replace(/\\+$/, "");
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
    }
  }

  if (current) {
    items.push(current);
  }
  return items;
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
