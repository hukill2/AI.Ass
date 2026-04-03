# Codex Real Executor Read-Only Plan v1

## Purpose
Defines the first real Codex invocation mode once the full dry-run chain and readonly eligibility check have been validated.

## Scope
- Applies only to execution candidates that are:
  - approval-required
  - approved
  - handoff-eligible
  - previewed
  - execution_prepared
- This mode invokes Codex for real, but only in a read-only / inspection-first manner.
- No repository writes in v1.
- No Telegram.
- No Notion write-back.

## Preconditions
Read-only real execution may only occur when:
- the full approved chain exists
- the candidate is execution_prepared
- a Codex handoff packet exists
- a Codex invocation preview exists
- no prior real Codex execution log already exists for that execution_id in readonly mode

## Inputs
- execution_id
- review_id
- decision_id
- payload_id
- handoff_id
- preview_id
- task_id
- recommended_next_step
- files_to_create_or_update
- reasoning
- risks_or_guardrails
- operator_notes

## Expected Outputs
- a real execution log entry
- executor = "codex-readonly"
- execution_result
- files_changed = []
- notes capturing what Codex reported in readonly mode

## Allowed Result Values
- `success`
- `blocked`
- `failed`
- `no_change`

## Guardrails
- Codex must be invoked in readonly mode only.
- No repository writes.
- No silent file changes.
- Explicit operator invocation only.
- Execution must remain attributable and logged.
- No automatic loops or retries in v1.

## Readonly executor helper
`scripts/execute-codex-readonly-v1.js` is the concrete helper that runs the prepared preview through the Codex readonly executor:
- It requires `--execution-id` and refuses to run if the linked execution candidate, review, payload, handoff, or preview are missing.
- The review must still be `approved` and classified as `approval-required` or `review-required`, and the candidate must already be `execution_prepared`.
- Duplicate readonly runs are blocked: the helper checks `runtime/execution-logs.v1.json` and aborts if a `codex-readonly` log already exists for the execution ID.
- It invokes `ollama run qwen2.5-coder:7b` with the preview prompt text, captures success/failure, and builds a log note that includes truncated stdout plus the model and command metadata.
- On success or failure it appends a log entry to `runtime/execution-logs.v1.json` with `executor = "codex-readonly"`, the request IDs (`review_id`, `decision_id`, `payload_id`, `handoff_id`, `preview_id`), `execution_result`, `files_changed = []`, and `notes`. The helper prints the execution/review/decision IDs, the latest `execution_log_id`, total logs stored, the truncated readonly response, and failure detail (if any) so operators can observe the run.
