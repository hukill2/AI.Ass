# Execution Gate Contract v1

## Purpose
Documents how operator-reviewed decisions are elevated into execution candidates so downstream executor layers can consume a deterministic, reviewable handoff.

## Scope
- Covers the promotion logic implemented in `scripts/promote-approved-review-to-execution-candidate-v1.js`.
- Depends on `runtime/decision-reviews.v1.json` (version `v1`), `runtime/assistant-decisions.v1.json` (version `v1`), and `runtime/execution-candidates.v1.json` (version `v1`).
- Does not execute code, call executor/Claude, send Telegram, or write to Notion; it only records the candidate data that later executor layers consume.

## Promotion heuristics
1. Only reviews with `operator_status = approved` and a classification of either `approval-required` or `review-required` are considered.
2. Reviews that already have an execution candidate are skipped so each review promotes at most once.
3. The associated assistant decision must exist; if it is missing or incomplete, the resulting candidate is marked `execution_blocked` so operators know to return to the review.
4. Once promoted, the candidate gets assigned a unique `execution_id` (`exec-<epoch>-<seq>`) and both `created_at` and `updated_at` timestamps.

## Required execution candidate schema
The stored candidate contains the following fields; downstream automation reads these verbatim.

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

- `execution_status` is `awaiting_execution` when the associated decision meets the completeness check (`recommended_next_step`, `reasoning`, and arrays for `files_to_create_or_update` and `risks_or_guardrails`) and `execution_blocked` otherwise.
- `operator_notes` is copied directly from the review so the candidate preserves the operator rationale.

## Execution status guardrails
- Approved reviews may become candidates, but promotion itself is not execution.
- Promotion does not change operator status; operators retain ultimate authority and may revise reviews even after promotion.
- Candidates marked `execution_blocked` signal that the decision packet needs correction before any executor layer should run.
- Once a candidate exists, later layers can change `execution_status` (for example to `execution_prepared`) as they move through readiness checks, but this contract only governs the initial promotion step.

## Observability
- The script prints which reviews it promoted and the total count of execution candidates so operators can confirm a successful run.
- Invalid or missing source stores halt the promotion with a clear error message, preventing partial or duplicate candidates.
