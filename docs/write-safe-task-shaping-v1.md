# Write-Safe Task Shaping v1

## Purpose
Explains how to reshape or constrain a broad approved execution candidate into a narrowly scoped, write-safe task before any future write-enabled executor runs.

## What Counts as Write-Safe in v1
Write-safe tasks should be:
- narrowly scoped
- implementation-oriented
- limited to one file or a tightly bounded set of files
- concrete and reviewable
- free of architecture, routing, guardrail, or approval system changes

## What Is Not Write-Safe in v1
The following shapes must be blocked:
- routing changes
- architecture changes
- guardrail changes
- approval workflow changes
- broad refactors
- external integration work
- ambiguous or analysis-only recommendations

## Narrowing Rules
When a candidate is too broad, narrow it by:
- selecting one concrete file target
- reducing the goal to one bounded implementation step
- removing architecture or policy implications
- making the next step explicit and practical

## Examples
- Allowed: add a validator for one existing JSON lane file.
- Allowed: add a single status-report script under `scripts/`.
- Blocked: redesign routing logic.
- Blocked: modify approval rules.
- Blocked: broad integration with external services.

## Operator Rule
- Write eligibility requires both approval and a narrow task shape.
- Approval alone does not justify write mode.
- If a candidate is too broad, reshape it into a narrower follow-up task before allowing future execution.
