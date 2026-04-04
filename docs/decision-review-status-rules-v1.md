# Decision Review Status Rules v1

## Purpose
Defines how review records transition through operator statuses in `runtime/decision-reviews.v1.json`.

## Allowed statuses
- `pending`
- `reviewed`
- `approved`
- `rejected`

## Allowed transitions
- `pending -> reviewed`
- `reviewed -> approved`
- `reviewed -> rejected`

## Rules
- Only the operator may change a review status.
- `approved` does not execute anything by itself in v1.
- `rejected` means the proposal is not accepted in its current form.
- Approval must be explicit for `approval-required` items.
- `reviewed` means the operator has seen the item but has not yet approved it.

## Guardrails
- Storing a decision is not approval.
- Classification is not approval.
- `reviewed` is not approval.
- Execution remains blocked in v1 after approval until the downstream execution layers are invoked explicitly.
