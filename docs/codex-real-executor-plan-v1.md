# Codex Real Executor Plan v1

## Purpose
Defines the first real Codex execution plan once the dry-run chain has been validated end to end.

## Preconditions
Real execution may only occur when:
- a full approved chain exists
- the latest dry-run chain is complete
- the candidate remains `awaiting_execution`
- the handoff packet and invocation preview are present
- the review is still approved
- the operator explicitly authorizes real execution

## Execution Modes
1. **Read-only / inspection-first** ? inspect the payload, handoff, and preview before making changes.
2. **Workspace-write / actual changes** ? perform the real file edits.

Start with the safer read-only mode and proceed to workspace writes once confidence is established.

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
Real execution should produce:
- an execution log entry
- execution_result
- files_changed
- notes
- timestamps
- optional executor metadata

## Status Effects
- Allowed results: `success`, `blocked`, `failed`, `no_change`
- Real execution does not erase approval history.
- Changes to `execution_status` must be explicit and reviewable.
- Guard against duplicate reruns of the same approved candidate.

## Guardrails
- No automatic execution loops.
- No approval bypass.
- No silent file changes.
- Execution must be attributable and logged.
- Start with the smallest safe execution scope.
