# Narrowed Follow-Up Promotion Flow v1

## Purpose
Ensures narrowed follow-up tasks become fresh downstream chains rather than overwriting their broad source candidates.

## Rule
- A narrowed follow-up task does not replace the original execution candidate.
- It becomes a new active task input.
- It must generate a new assistant decision.
- That new decision must go through its own review/approval/execution-candidate flow.

## Why
- The original broad candidate should remain intact for historical traceability.
- The narrowed task is a separate, safer path toward write-enabled execution.
- Write eligibility should evaluate the narrowed chain, not the original broad chain.

## Minimal Flow
1. Promote the follow-up to `runtime/task-input.v1.json`.
2. Build task context.
3. Run the structured assistant decision.
4. Refresh assistant decisions.
5. Classify the newly created decision.
6. Review/approve the new review item.
7. Promote the approved review to a new execution candidate.
8. Evaluate write eligibility on that new candidate.

## Guardrails
- Do not overwrite historical broad candidates.
- Keep the lineage clear between the source execution and the narrowed follow-up.
- Write eligibility must consider only the new narrowed chain once it is in place.
