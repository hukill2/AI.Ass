# Stage-Aware Approval Loop Contract v1

## Purpose
Define the stage-aware Notion approval loop that keeps one task page moving through prompt assembly, prompt approval, Librarian validation, Architect/GPT planning, action-plan approval, Librarian validation, execution, verification, retry, escalation, and completion.

## Canonical workflow
- One Notion task page remains the source of operator interaction for the full lifecycle.
- The local mirror remains the machine-readable proxy for that page.
- `Architect/GPT` is the canonical planning route; legacy `Codex` values remain readable as aliases.
- Any retry or escalation must include exact failure detail for both Qwen and the operator.
- Telegram only fires when operator action is required.

## Required task properties
- `Workflow Stage`
- `Attempt Count`
- `Stage Retry Count`
- `Last Failure Stage`
- `Last Failure Actor`
- `Last Failure Code`
- `Last Failure Summary`
- `Escalation Reason`
- `Current Prompt Template`

## Required body sections
- `Constraints / Guardrails`
- `Machine Task JSON`
- `Prompt Template Selection`
- `Prompt Package For Approval`
- `Librarian Validation Notes`
- `GPT Plan`
- `Qwen Action Plan For Approval`
- `Failure Report`
- `Attempt History`
- `Escalation Notes`
- `Final Outcome`

## Failure semantics
- Every active stage returns one of `pass`, `retry`, `escalate_operator`, or `fail_terminal`.
- Every non-pass result must populate `failure-report.json` in the attempt artifact folder.
- Librarian retry is automatic up to 3 attempts; after that, or at any non-retryable failure, the task escalates to the operator on the same page.
- Execution failures retry at most once when the failure is local and retryable; otherwise they escalate immediately.

## Artifact contract
- Artifacts live at `runtime/task-artifacts/<task_id>/attempt-<n>/`.
- Each attempt may contain `machine-task.json`, `prompt-package.md`, `librarian-prompt-check.json`, `gpt-plan.md`, `qwen-action-plan.md`, `librarian-action-plan-check.json`, and `failure-report.json`.

## Notification rule
- Notify only when the page is ready for prompt approval, ready for action-plan approval, escalated, or failed.
