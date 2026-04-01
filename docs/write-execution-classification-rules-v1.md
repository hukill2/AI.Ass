# Write Execution Classification Rules v1

## Purpose
Defines how review classification affects write-enabled execution eligibility in AI.Ass.

## Current Problem
Narrowed, one-file, write-safe follow-up tasks may still be classified as review-required instead of approval-required, meaning the current write-eligibility screen may block them even when they are narrow and operator-approved.

## Recommended Rule
- `approval-required` items may be write-eligible when operator-approved and otherwise meet all eligibility criteria.
- `review-required` items may also be write-eligible when operator-approved, but only if they are narrow, write-safe, and pass all standard checks.
- Broad or risky tasks should remain in the `approval-required` path.

## Narrow Write-Safe Criteria
- One-file or tightly bounded scope.
- Concrete target files.
- Implementation-oriented next step.
- No routing, architecture, guardrail, approval, or integration changes.
- Successful readonly execution check completed.

## Guardrails
- `review-required` does not automatically mean write-eligible.
- Operator approval is still required.
- All write-safety rules still apply.
- Broad tasks remain blocked until they are narrowed or reclassified.
