# executor Contract Quick Reference v1

Keep this card near the wrapper when evaluating the executor lane. It distills the existing contract docs so operators can confirm readiness artifacts and expected outcomes before touching the executor commands.

## Key readiness artifacts
- `docs/executor-handoff-dry-run-contract-v1.md` – every executor execution must derive from a prepared handoff packet (`handoff_id`, `payload_id`, `execution_id`, etc.).
- `docs/executor-invocation-preview-contract-v1.md` – ensure the invocation preview for that handoff contains the exact `prompt_text`, file list, and guardrail notes the future executor will receive.
- `docs/executor-execution-contract-v1.md` – summarizes the overall conditions, inputs, result fields, and guardrails that the wrapper will enforce when executor runs for real.

## Preconditions to double-check
- review classification = `approval-required`
- operator status = approved
- execution status = `awaiting_execution`
- prepared payload, handoff packet, and invocation preview exist and reference the same IDs
- the candidate remains valid and reviewable; approvals are still in place

## Minimum executor inputs (confirm these fields are populated before invoking executor commands)
- `execution_id`, `review_id`, `decision_id`, `payload_id`
- `handoff_id`, `preview_id`, `task_id`
- `recommended_next_step`, `files_to_create_or_update`
- `reasoning`, `risks_or_guardrails`, `operator_notes`

## Expected execution results
- Every executor run writes a record with `execution_log_id`, `execution_id`, `review_id`, `decision_id`, `payload_id`, `handoff_id`, `preview_id`, `executor`, `execution_result`, `files_changed`, `notes`, `created_at`.
- Allowed result values: `success`, `blocked`, `failed`, `no_change`.

## Guardrails reminder
- executor execution must always be explicit, reviewable, and logged; no silent fails or retries.
- Do not invoke executor until the full approved chain and prepared artifacts exist and pass the guard checks.
- Blocked or failed executions must not modify state; log the issue, fix the underlying cause, and rerun once everything is in place.

Refer to the full contracts for detail before making the final call, but use this card when you need a fast sanity check on the executor readiness path.
