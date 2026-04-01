# Execution Handoff Contract v1

## Purpose
This contract captures what must be true before an execution candidate moves toward a future execution layer such as Codex. It keeps the handoff deterministic, reviewable, and free of automatic execution.

## Scope
- Applies to records stored in `runtime/execution-candidates.v1.json`.
- Does not execute anything yet.
- Does not call Codex yet.
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
