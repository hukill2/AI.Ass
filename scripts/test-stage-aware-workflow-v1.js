#!/usr/bin/env node

const assert = require("assert");
const {
  normalizeTask,
  buildMachineTask,
  buildPromptPackage,
  buildActionPlan,
  buildFailureReport,
  createEmptyBody,
} = require("./reviews-approvals-workflow-v1");
const { validateWorkflowArtifact } = require("./executor-librarian-v1");

function main() {
  const task = normalizeTask({
    task_id: "test-stage-aware",
    title: "Stage-aware workflow test",
    route_target: "Codex",
    body: {
      ...createEmptyBody(),
      summary: "Validate the stage-aware workflow helper.",
      full_context: "The pipeline should normalize legacy route targets.",
      proposed_action: "Create a prompt package and validate it.",
      constraints_guardrails: "Do not bypass Notion review.",
    },
    metadata: { project: "OS-V1" },
  });

  assert.equal(task.route_target, "Architect/GPT");
  assert.equal(task.workflow_stage, "Task Intake");

  const machineTask = buildMachineTask(task);
  assert.equal(machineTask.project_id, "OS-V1");
  assert.equal(machineTask.route_target, "Architect/GPT");

  const promptPackage = buildPromptPackage(
    task,
    "Template body placeholder",
    machineTask,
  );
  assert.ok(promptPackage.includes("Task Summary:"));
  assert.ok(promptPackage.includes("Machine Task JSON:"));
  assert.ok(promptPackage.includes("project_id"));

  const promptVerdict = validateWorkflowArtifact(task, "prompt", promptPackage);
  assert.equal(promptVerdict.verdict, "pass");

  const invalidActionPlan = "Action Plan:\n1. Do work.\nGPT Plan Reference:\n- missing verification";
  const actionVerdict = validateWorkflowArtifact(task, "action_plan", invalidActionPlan);
  assert.equal(actionVerdict.verdict, "retry");
  assert.equal(actionVerdict.failure_code, "action_plan_guardrail_violation");

  const actionPlan = buildActionPlan(task, "Plan text\nVerification:\n- check result");
  assert.ok(actionPlan.includes("Verification:"));

  const report = buildFailureReport({
    task,
    workflowStage: "Qwen Execution",
    failingActor: "Qwen",
    failureCode: "execution_blocked",
    failureSummary: "Execution was blocked.",
    exactProblem: "A required command failed.",
    failedChecks: ["command returned non-zero"],
    requiredChanges: ["Fix the command and retry."],
    nextOwner: "operator",
    retryable: false,
    escalateToOperator: true,
  });
  assert.equal(report.escalate_to_operator, true);
  assert.equal(report.failure_code, "execution_blocked");

  console.log("stage-aware workflow smoke test passed");
}

main();
