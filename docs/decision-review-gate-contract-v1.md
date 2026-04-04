# Decision Review Gate Contract v1

## Purpose
Defines how structured assistant decisions are classified before the operator review gate records them in runtime/decision-reviews.v1.json.

## Scope
- Reads the latest decision from runtime/assistant-decisions.v1.json (version v1).
- The runner is scripts/classify-assistant-decision-v1.js; it does not execute code, call executor/Claude, send Telegram, or push to Notion.
- Each classification appends a review record to runtime/decision-reviews.v1.json (version v1).

## Classification heuristics implemented in scripts/classify-assistant-decision-v1.js
1. If the decision's recommended_next_step is marked as analysis-only (keywords such as  analysis, analysis-only, gather context, review, research, or investigate) and no files are listed, it becomes informational.
2. If the recommendation or reasoning mentions system rules, guardrails, routing, approvals, architecture, integration, or execution, the decision escalates to approval-required.
3. If implementation files are named in files_to_create_or_update, it becomes at least review-required.
4. When none of the prior heuristics fire, the gate defaults to review-required so operators can examine the proposal before any next step.

## Required review record schema
Each persisted review record contains the following fields.
- review_id: Unique identifier (review-<epoch millis>).
- decision_id: The originating decision ID.
- task_id: The task claimed by the decision (blank if missing).
- classification: One of informational, review-required, or approval-required.
- recommended_action: Derived from the classification (store-only, review-before-execution, or explicit-approval-required).
- operator_status: Starts as pending; see docs/decision-review-status-rules-v1.md for the allowed transitions.
- operator_notes: Empty by default and filled later by the operator when reviewing.
- created_at / updated_at: ISO 8601 timestamps (the same value on initial creation).

## Guardrails
- Classification is not approval. Only the operator may change operator_status (see the status rules doc).
- Informational records are stored for visibility only; they do not trigger execution or executor calls.
- Approval-required classifications should be handled explicitly by operators; they are flagged as explicit-approval-required in recommended_action.
- Future automation must route through this gate so decisions remain human-reviewable before any downstream execution layer runs.
