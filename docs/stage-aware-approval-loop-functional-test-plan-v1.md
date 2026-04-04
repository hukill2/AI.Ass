# Stage-Aware Approval Loop Functional Test Plan

## Purpose
Validate the stage-aware Notion approval loop end to end without introducing ambiguity about expected behavior, retry handling, escalation, or operator visibility.

## Test Environment
- Use a dedicated test task page in the `Reviews / Approvals` database.
- Use unique `Task ID` values for each scenario.
- Route Telegram notifications to a test destination.
- Clear `runtime/queue`, `runtime/completed`, and `runtime/task-artifacts/<task_id>/` before each scenario.
- Run the local services with `npm run start` or run the mirror and manager separately.

## Script-Level Validation
1. Run `node scripts/test-stage-aware-workflow-v1.js`.
2. Run `node --check` on the modified workflow scripts.
3. Run `node scripts/build-reviews-approvals-mirror-v1.js`.
4. Confirm the mirror export validates cleanly.

## Functional Scenarios
### 1. New Task Intake
- Create a new Notion task in `Draft`.
- Confirm the mirror captures the page after edit.
- Confirm Qwen generates:
  - `machine-task.json`
  - `prompt-package.md`
- Confirm Notion updates to:
  - `Status = Pending Review`
  - `Workflow Stage = Prompt Approval`
- Confirm Telegram sends one approval notification.

### 2. Prompt Approval Happy Path
- Set `Decision = Approve` and `Status = Approved`.
- Confirm Notion shows:
  - `Processing`
  - `Librarian Prompt Validation`
  - `Architect/GPT Planning`
- Confirm these artifacts are created:
  - `librarian-prompt-check.json`
  - `gpt-plan.md`
  - `qwen-action-plan.md`
- Confirm Notion returns to:
  - `Status = Pending Review`
  - `Workflow Stage = Action Plan Approval`
- Confirm Telegram sends one approval notification.

### 3. Action Plan Approval Happy Path
- Set `Decision = Approve` and `Status = Approved`.
- Confirm Notion shows:
  - `Processing`
  - `Librarian Action Plan Validation`
  - `Qwen Execution`
- Confirm execution completes.
- Confirm final state is:
  - `Status = Completed`
  - `Workflow Stage = Completed`

## Retry and Escalation Scenarios
### 4. Librarian Prompt Retry
- Force a bad prompt package by removing a required section.
- Confirm `failure-report.json` is written.
- Confirm Notion shows:
  - `Status = Retrying`
  - exact failure details in `Failure Report`
- Confirm the failure text states exactly:
  - what failed
  - which section or field is wrong
  - what must be changed

### 5. Librarian Prompt Escalation After Retry Limit
- Keep the prompt invalid until the retry limit is reached.
- Confirm Notion shows:
  - `Status = Escalated`
  - `Workflow Stage = Escalated To Operator`
  - populated `Escalation Reason`
- Confirm Telegram sends an escalation notification.

### 6. Immediate Escalation
- Force a non-retryable Librarian failure.
- Confirm the task escalates immediately without consuming all retries.

### 7. GPT Planning Failure
- Force malformed or empty GPT output.
- Confirm Qwen records the exact blocker.
- Confirm operator escalation occurs if the output cannot be normalized safely.

### 8. Action Plan Retry and Escalation
- Remove the verification step from the Qwen action plan.
- Confirm the task retries first.
- Confirm repeated failure escalates to operator on the same page.

### 9. Execution Failure
- Force a local execution blocker such as a runtime or dependency issue.
- Confirm one automatic retry if the failure is retryable.
- Confirm escalation occurs on repeated or non-retryable failure.

### 10. Post-Execution Verification Failure
- Simulate execution success but verification failure.
- Confirm the task is not marked complete.
- Confirm Notion shows:
  - `Status = Escalated`
  - `Workflow Stage = Post-Execution Verification`
- Confirm the failure report includes the exact command or check that failed.

## Operator Decision Scenarios
### 11. Modify at Prompt Approval
- Set `Decision = Modify`, `Status = Needs Edit`, and add `Revised Instructions`.
- Confirm Qwen rebuilds the prompt package and returns the task to `Pending Review`.

### 12. Modify at Action Plan Approval
- Set `Decision = Modify`, `Status = Needs Edit`.
- Confirm Qwen regenerates the action plan and returns the task to `Pending Review`.

### 13. Deny at Any Approval Checkpoint
- Set `Decision = Deny`, `Status = Denied`.
- Confirm the task stops progressing and is not re-queued.

### 14. Approve After Escalation
- From `Escalated To Operator`, set `Decision = Approve`, `Status = Approved`.
- Confirm the task resumes from the correct approval gate instead of restarting incorrectly.

## Data Integrity Checks
- Confirm the same Notion page is reused for all retries and escalations.
- Confirm `Attempt Count`, `Stage Retry Count`, `Last Failure Stage`, `Last Failure Actor`, `Last Failure Code`, `Last Failure Summary`, and `Escalation Reason` remain consistent between:
  - Notion
  - queue JSON
  - export mirror
- Confirm `Route Target = Codex` is normalized locally to `Architect/GPT`.
- Confirm every retry or escalation creates `failure-report.json`.
- Confirm artifacts are written under `runtime/task-artifacts/<task_id>/attempt-<n>/`.

## Pass Criteria
- Every workflow stage is visible in Notion.
- Every retry or escalation explains exactly what failed and what must change.
- Telegram fires only when operator action is required.
- No duplicate task pages are created for retries or escalations.
- Completed tasks move to `runtime/completed` with final outcome synced back to Notion.

## Execution Record Template
For each scenario, record:
- Scenario name
- Task ID
- Start time
- Expected outcome
- Actual outcome
- Notion page URL
- Telegram received: yes or no
- Artifacts created
- Pass or fail
- Follow-up notes
