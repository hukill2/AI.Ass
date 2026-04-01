# Local Write Executor Dry-Run Plan v1

## Purpose
Defines the dry-run rehearsal step before AI.Ass supports a write-enabled local executor.

## Scope
- Applies to candidates that are:
  - approval-required
  - approved
  - execution_prepared
  - readonly-successful
  - write-eligible under docs/write-execution-eligibility-rules-v1.md
- Does not write files yet.
- Does not alter repo state.
- Does not send Telegram.
- Does not write back to Notion.

## Preconditions
Dry-run write preparation may only occur when:
- the full approved chain exists
- a successful qwen-readonly execution log exists
- the candidate remains execution_prepared
- the operator explicitly chooses to test write-enabled readiness

## Expected Behavior
The dry-run write executor should:
- inspect the candidate and its file targets
- verify the scope is narrow enough for v1
- prepare a write-execution preview or log entry
- not modify any files

## Expected Outputs
- A dry-run write-execution log entry
- execution_result
- files_changed = []
- notes describing what the real write mode would do

## Guardrails
- No repo writes in dry-run mode.
- No automatic retries.
- No approval bypass.
- No broad refactors.
- Explicit operator invocation only.
- Logging is required for every dry-run write attempt.

## Relationship to Real Write Mode
- This dry-run mode is the final rehearsal before writing is enabled.
- Success here does not itself authorize real writes.
