# Execution Gate Contract v1

## Purpose
Defines how approved decision reviews are elevated to execution candidates within the local workflow while execution itself remains blocked.

## Scope
- Applies to review records in runtime/decision-reviews.v1.json.
- Applies to matching assistant decisions in runtime/assistant-decisions.v1.json.
- Does not execute code.
- Does not call Codex yet.
- Does not call Claude.
- Does not send Telegram.
- Does not write back to Notion.

## Execution Candidate Definition
An item is eligible to become an execution candidate only when:
- classification =  approval-required.
- operator_status = approved.
- The associated assistant decision exists.
- The assistant decision is structurally valid.

## Required Execution Candidate Fields
`json
{
  execution_id: ,
 review_id: ,
  decision_id: ,
 task_id: ,
  execution_status: ,
 recommended_next_step: ,
  files_to_create_or_update: [],
  reasoning: ,
 risks_or_guardrails: [],
 operator_notes: ,
  created_at: ,
 updated_at: 
}
`

## Initial Execution Statuses
- waiting_execution
- execution_blocked
- execution_prepared
- executed

For v1, only waiting_execution and execution_blocked are expected to be used.

## Initial Rules
- Approved review items may be promoted to execution candidates.
- Promotion is not execution.
- Execution remains blocked until a future execution layer is added.
- Malformed or incomplete approved items should become execution_blocked.
- Carry operator notes forward into the execution candidate.

## Guardrails
- No automatic execution in v1.
- No direct Codex handoff in v1.
- No external side effects in v1.
- Execution candidates exist only to make the future execution layer explicit and reviewable.
