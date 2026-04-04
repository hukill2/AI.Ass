# Project Context Master v1

This document now functions as the milestone-level navigator for the validated v1 chain. It points operators and future automation to the canonical contracts, highlights what is completed, and clearly flags the historical artifacts that should _not_ be treated as source of truth. The large embedded snapshots that once lived below have been removed in favor of direct references.

## V1 closeout summary (2026-04-03)
- **Completed lanes:** assistant decisions → reviews → execution candidates → executor payloads → Codex handoff/preview → qwen-readonly → qwen-write dry run → qwen-write real execution → post-write verification logging and reporting.
- **Remaining blockers:** none; the original doc drift issues have been resolved and every required lane now points to a canonical contract.
- **Optional cleanup:** rename legacy `codex-*` artifacts, shrink this index further if desired, expand verification rules beyond JS syntax checks when needed.

## Canonical doc index for the validated chain
- [`docs/assistant-decision-contract-v1.md`](docs/assistant-decision-contract-v1.md) – decision schema persistence.
- [`docs/decision-review-gate-contract-v1.md`](docs/decision-review-gate-contract-v1.md) – classification heuristics and review insertion.
- [`docs/decision-review-status-rules-v1.md`](docs/decision-review-status-rules-v1.md) – operator status transitions and guardrails.
- [`docs/execution-gate-contract-v1.md`](docs/execution-gate-contract-v1.md) – promotion rules from approved review to execution candidate.
- [`docs/execution-handoff-contract-v1.md`](docs/execution-handoff-contract-v1.md) – executor payload requirements before handoff.
- [`docs/codex-handoff-dry-run-contract-v1.md`](docs/codex-handoff-dry-run-contract-v1.md) – Codex packet shape and preparation helper.
- [`docs/codex-invocation-preview-contract-v1.md`](docs/codex-invocation-preview-contract-v1.md) – preview payload shape and derivation.
- [`docs/codex-real-executor-readonly-plan-v1.md`](docs/codex-real-executor-readonly-plan-v1.md) – real executor guardrails and logging.
- [`docs/local-write-executor-dryrun-plan-v1.md`](docs/local-write-executor-dryrun-plan-v1.md) – nondestructive rehearsal.
- [`docs/local-write-executor-contract-v1.md`](docs/local-write-executor-contract-v1.md) – write guardrails, readiness contract, and verification.
- [`docs/post-write-verification-plan-v1.md`](docs/post-write-verification-plan-v1.md) – verification expectations and logging.
- [`docs/operator-workflow-wrapper-spec-v1.md`](docs/operator-workflow-wrapper-spec-v1.md) – wrapper invocation, stages, guardrail telemetry.
- [`docs/operator-runbook-and-usage-layer-v1.md`](docs/operator-runbook-and-usage-layer-v1.md) – operator-facing flow, stage outputs, and executor readiness overview.

## Historical or archival references
- [`docs/operator-workflow-runbook-v1.md`](docs/operator-workflow-runbook-v1.md) – kept for history only; the wrapper runbook moved to a separate canonical doc.
- [`docs/first-real-write-run-checklist-v1.md`](docs/first-real-write-run-checklist-v1.md) and [`docs/first-real-write-success-v1.md`](docs/first-real-write-success-v1.md) – milestone artifacts that describe earlier proof-of-concept runs. Do not treat them as the current contract.
- [`docs/codex-execution-contract-v1.md`](docs/codex-execution-contract-v1.md) – future work/Conceptual Codex executor; not required for v1 closeout.

## Navigation reminders
- Always consult the canonical doc listed above before touching implementation or automation.
- When adding a new doc, ensure this index is updated so downstream tooling (e.g., Google Drive mirror) stays aligned.
