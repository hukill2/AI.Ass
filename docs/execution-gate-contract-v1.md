# Execution Gate Contract v1

## Status note
This document is now historical for the promotion gate only. The repo has since added readonly and write executor layers; use `docs/local-readonly-executor-status-v1.md`, `docs/local-write-executor-contract-v1.md`, and `docs/codex-execution-contract-v1.md` for the current execution reality.
This file remains as archive-level context for how promotion-only reviews were elevated into execution candidates; today, execution candidates and their guardrails are governed by the linked executor-layer docs rather than by the descriptions below, so read this section only to understand the original gate.

## Purpose
Defines how approved decision reviews are elevated to execution candidates within the local workflow.

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
```json
{
  "execution_id": "",
  "review_id": "",
  "decision_id": "",
  "task_id": "",
  "execution_status": "",
  "recommended_next_step": "",
  "files_to_create_or_update": [],
  "reasoning": "",
  "risks_or_guardrails": [],
  "operator_notes": "",
  "created_at": "",
  "updated_at": ""
}
```

## Initial Execution Statuses
- awaiting_execution
- execution_blocked
- execution_prepared
- executed

For the original promotion-only gate, only `awaiting_execution` and `execution_blocked` were expected to be used.

## Initial Rules
- Approved review items may be promoted to execution candidates.
- Promotion is not execution.
- This document does not describe the later executor layers that were added after the promotion gate.
- Malformed or incomplete approved items should become execution_blocked.
- Carry operator notes forward into the execution candidate.

## Guardrails
- No automatic execution in v1.
- No direct Codex handoff in v1.
- No external side effects in v1.
- Execution candidates exist only to make the future execution layer explicit and reviewable.
