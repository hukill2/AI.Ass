# Execution Handoff Contract v1

## Purpose
This contract captures what must be true before an execution candidate moves toward a future execution layer such as executor. It keeps the handoff deterministic, reviewable, and free of automatic execution.

## Scope
- Applies to records stored in `runtime/execution-candidates.v1.json`.
- Does not execute anything yet.
- Does not call executor yet.
- Does not call Claude.
- Does not send Telegram.
- Does not write back to Notion.

## Minimum Handoff Requirements
An execution candidate is eligible for handoff only when:
- `execution_status` is `awaiting_execution`.
- There is a valid linked approved review record.
- There is a valid linked assistant decision.
- The `recommended_next_step` is concrete.
- The `reasoning` field is reviewable and grounded in the provided task context.
- Any proposed implementation work lists concrete targets in `files_to_create_or_update`.

## Handoff Blocking Rules
Handoff must remain blocked when:
- The linked review is not approved.
- The assistant decision is missing or malformed.
- The next step is explicitly analysis-only.
- The candidate is marked `execution_blocked`.
- Implementation-oriented work lacks the required file targets.

## Payload preparation helper
`scripts/prepare-executor-payload-v1.js` is the helper that translates an eligible candidate into the executor payload ledger. It strictly mirrors the blocking rules:
- It only accepts `execution_id` values whose execution candidate is currently `awaiting_execution`.
- The linked review (`runtime/decision-reviews.v1.json`) must exist, have `classification` = `approval-required` or `review-required`, and `operator_status = approved`.
- The linked decision record must exist in `runtime/assistant-decisions.v1.json` and provide a non-empty `recommended_next_step`.
- Implementation-oriented next steps (detected via verbs such as create/update/modify/implement/write/edit) require at least one entry in `files_to_create_or_update`.
- The helper is idempotent per execution ID; if a payload already exists for that execution the script logs the total count and exits without adding a duplicate.
- Successful runs append a record to `runtime/executor-payloads.v1.json` that captures `payload_id`, `execution_id`, `review_id`, `decision_id`, `task_id`, the decision metadata (`recommended_next_step`, `files_to_create_or_update`, `reasoning`, `risks_or_guardrails`), `operator_notes`, and `prepared_at`. It prints the execution/decision/task/payload IDs plus the running payload total so operators can verify the side effect immediately.

## Future Execution Log Fields
Execution logs created later should follow this shape:
```
{
  "execution_log_id": "",
  "execution_id": "",
  "review_id": "",
  "decision_id": "",
  "executor": "",
  "execution_result": "",
  "files_changed": [],
  "notes": "",
  "created_at": ""
}
```

## Guardrails
- Approval to execute is not the same as execution success.
- Execution must remain explicit and reviewable.
- Execution logs should be written after a future execution actually runs.
- There is no automatic handoff in v1.
- There are no silent file changes in v1; every change goes through a reviewed command.
