# Codex Execution Contract v1

## Purpose
Defines the minimum conditions and data required before AI.Ass can invoke Codex for a real execution run while keeping everything explicit and reviewable.

## Scope
- Applies only to candidates that already have:
  - an approved review
  - an execution candidate
  - a prepared executor payload
  - a Codex handoff packet
  - a Codex invocation preview
- Does not implement execution yet.
- Does not send Telegram.
- Does not write back to Notion yet.

## Minimum Execution Preconditions
Real Codex execution may only occur when:
- review classification = approval-required
- operator_status = approved
- execution_status = awaiting_execution
- a prepared payload exists
- a prepared Codex handoff packet exists
- a prepared Codex invocation preview exists
- the candidate remains valid and reviewable

## Minimum Executor Inputs
The executor must receive:
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

## Minimum Execution Result Fields
```
{
  "execution_log_id": "",
  "execution_id": "",
  "review_id": "",
  "decision_id": "",
  "payload_id": "",
  "handoff_id": "",
  "preview_id": "",
  "executor": "",
  "execution_result": "",
  "files_changed": [],
  "notes": "",
  "created_at": ""
}
```

## Allowed Result Values
- `success`
- `blocked`
- `failed`
- `no_change`

## Guardrails
- Codex execution must stay explicit and reviewable.
- Do not execute without the full reviewed chain.
- Execution success is separate from prior approval.
- Record logs after every real run.
- Blocked or failed executions must not silently alter state.
- No automatic re-execution loops in v1.
