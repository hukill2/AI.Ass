# Executor Invocation Contract v1

## Purpose
This file defines what a future execution layer must receive and return when acting on a handoff-eligible execution candidate so the entire pipeline stays explicit and reviewable.

## Scope
- Applies only to handoff-eligible items from `runtime/execution-candidates.v1.json`.
- Does not execute anything yet.
- Does not call Codex yet.
- Does not call Claude.
- Does not send Telegram.
- Does not write back to Notion.

## Minimum Invocation Inputs
Before handing work to an executor, the system must provide:
- `execution_id`
- `review_id`
- `decision_id`
- `task_id`
- `recommended_next_step`
- `files_to_create_or_update`
- `reasoning`
- `risks_or_guardrails`
- `operator_notes`

## Minimum Execution Result Fields
The executor must return a structured result that looks like:
```
{
  "execution_log_id": "",
  "execution_id": "",
  "review_id": "",
  "decision_id": "",
  "task_id": "",
  "executor": "",
  "execution_result": "",
  "files_changed": [],
  "notes": "",
  "created_at": ""
}
```

## Result Meanings
- `success`: the executor completed the requested work.
- `blocked`: execution could not proceed due to an external issue (missing data, permission, etc.).
- `failed`: the executor attempted the work but encountered a failure.
- `no_change`: the work was already done or the candidate was no longer applicable.

## Guardrails
- Executor input must originate only from handoff-eligible candidates.
- Execution must remain explicit and reviewable; no automatic handoffs.
- Execution results must be recorded after a future run.
- No silent file changes are allowed.
- Executions must never bypass approvals.
