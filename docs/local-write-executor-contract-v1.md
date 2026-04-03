# Local Write Executor Contract v1

## Purpose
Defines the first real write-enabled executor mode after readonly success and write dry-run success have both been validated.
See `docs/operator-runbook-and-usage-layer-v1.md` for the executor readiness overview that links readonly, write, and Codex expectations.

## Preconditions
Real write-enabled execution may only occur when:
- a full approved chain exists
- the candidate is execution_prepared
- a successful qwen-readonly execution log exists
- a successful qwen-write-dryrun log exists
- the operator explicitly chooses real write execution

## Allowed v1 Scope
- One concrete target file.
- Tightly bounded implementation work.
- Script- or runtime-level changes only.
- No broad repo change.

## Blocked v1 Scope
- Architecture changes.
- Routing changes.
- Guardrail changes.
- Approval workflow changes.
- External integrations.
- Multi-file refactors.
- Ambiguous or analysis-only tasks.

## Required Inputs
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
Real write-enabled execution must produce:
- an execution log entry
- execution_result
- files_changed
- notes
- timestamps
- optional short change summary

## Guardrails
- Explicit operator invocation only.
- No automatic retries.
- No silent writes.
- All changes must be attributable and logged.
- Execution success is separate from approval.
- Failed execution must still be logged.

## Quality & fidelity expectations
- The write executor enforces a lightweight check before any file mutation: the AI-generated output must mention the target file name and include file-specific keywords (e.g., `handoff`, `payload_id`, etc.) before writing. Failures are recorded as `execution_result: failed` with notes explaining what triggered the check (e.g., “target name not mentioned”), making the blocker obvious.
- When the target file already exists, the same check runs before overwriting so the new text explicitly matches what was requested even if the file previously came from the assistant.

## Readiness helper
- Run `node scripts/validate-local-write-readiness-v1.js --execution-id=<id>` before attempting a write dry run or real write. It confirms:
  * the execution candidate exists and remains `execution_prepared` or `awaiting_execution`
  * the executor payload record exists and provides `payload_id` for traceability
  * a successful qwen-readonly log already exists for this execution
  * a successful qwen-write log already exists for this execution
  * the Codex handoff packet and invocation preview referenced in the latest successful qwen-readonly log are present so the write lane has the required payload data
- On failure the script exits nonzero with a clear message (missing candidate, logs, or artifacts), so you can rebuild the missing pieces and re-run it until it passes.
