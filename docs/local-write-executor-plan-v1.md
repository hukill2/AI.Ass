# Local Write Executor Plan v1

## Purpose
Defines the first write-enabled execution mode now that the readonly executor run has been validated.

## Preconditions
Write-enabled execution may only occur when:
- a full approved chain exists
- the candidate remains `execution_prepared`
- a readonly real executor run has already succeeded for the same execution_id
- the operator explicitly authorizes write-enabled execution

## Initial Scope
- Prefer single-file or tightly bounded changes.
- Avoid broad multi-file refactors.
- Avoid touching architecture, routing, guardrail, or approval system rules.
- Do not introduce external integrations or side effects.

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
- A real execution log entry.
- execution_result.
- files_changed.
- notes and timestamps.
- Optional diff or change summary when available.

## Guardrails
- Explicit operator invocation only.
- No automatic retries or loops.
- All writes must be attributable and logged.
- Execution success remains separate from prior approval.
- Failed execution must not silently alter state.
- Start with the smallest safe write scope.

## Non-Goals
- No autonomous broad repo changes.
- No approval bypass.
- No Telegram or Notion write-back yet.
