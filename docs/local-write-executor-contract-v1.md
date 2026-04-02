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
