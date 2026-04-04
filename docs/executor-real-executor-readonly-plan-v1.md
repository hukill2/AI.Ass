# executor Real Executor Read-Only Plan v1

## Purpose
Defines the first real executor invocation mode once the full dry-run chain and readonly eligibility check have been validated.

## Scope
- Applies only to execution candidates that are:
  - approval-required
  - approved
  - handoff-eligible
  - previewed
  - execution_prepared
- This mode invokes executor for real, but only in a read-only / inspection-first manner.
- No repository writes in v1.
- No Telegram.
- No Notion write-back.

## Preconditions
Read-only real execution may only occur when:
- the full approved chain exists
- the candidate is execution_prepared
- a executor handoff packet exists
- a executor invocation preview exists
- no prior real executor execution log already exists for that execution_id in readonly mode

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
- executor = "qwen-readonly"
- execution_result
- files_changed = []
- notes capturing what executor reported in readonly mode

## Allowed Result Values
- `success`
- `blocked`
- `failed`
- `no_change`

## Guardrails
- executor must be invoked in readonly mode only.
- No repository writes.
- No silent file changes.
- Explicit operator invocation only.
- Execution must remain attributable and logged.
- No automatic loops or retries in v1.

## Readonly executor helper
`scripts/execute-executor-readonly-v1.js` is the concrete helper that runs the prepared preview through the executor readonly executor:
- It requires `--execution-id` and refuses to run if the linked execution candidate, review, payload, handoff, or preview are missing.
- The review must still be `approved` and classified as `approval-required` or `review-required`, and the candidate must already be `execution_prepared`.
- Duplicate readonly runs are blocked: the helper checks `runtime/execution-logs.v1.json` and aborts if a `qwen-readonly` log already exists for the execution ID.
- It invokes `ollama run qwen2.5-coder:7b` with the preview prompt text, captures success/failure, and builds a log note that includes truncated stdout plus the model and command metadata.
- The helper retries once after a short delay if Ollama returns `500 Internal Server Error` so transient runner faults do not permanently block the readonly lane, and it sanitizes ANSI escape sequences in stdout/stderr so the logged notes and console output remain readable even when Ollama emits spinner or status characters. Any remaining 500 error is noted in `runtime/execution-logs.v1.json` with the sanitized stderr so operators can clearly see the upstream issue.
- On success or failure it appends a log entry to `runtime/execution-logs.v1.json` with `executor = "qwen-readonly"`, the request IDs (`review_id`, `decision_id`, `payload_id`, `handoff_id`, `preview_id`), `execution_result`, `files_changed = []`, and `notes`. The helper prints the execution/review/decision IDs, the latest `execution_log_id`, total logs stored, the truncated readonly response, and failure detail (if any) so operators can observe the run.
