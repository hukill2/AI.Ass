# Assistant Decision Prompt Tightening v1

## Purpose
Defines how to tighten the structured local assistant decision prompt so outputs become more actionable.

## Current Problem
- The structured decision output is valid JSON but sometimes too vague.
- iles_to_create_or_update may be empty even when the decision suggests implementation work.
- Some decisions are safe but not actionable enough for follow-up work.

## Prompt Tightening Goals
- Require a more concrete 
ecommended_next_step.
- Populate iles_to_create_or_update only when actual file changes are proposed.
- Distinguish between analysis-only decisions and implementation-oriented decisions.
- Keep outputs concise and deterministic.
- Avoid invented filenames outside the known project structure.

## Proposed Output Rules
- If implementation work is proposed, the model should name at least one existing or plausible project file path.
- If only analysis is recommended, state that explicitly (e.g., nalysis-only or gather context).
- 
easoning must stay short and be grounded in the provided task context.
- 
isks_or_guardrails should list practical operational warnings, not generic filler.
- 
otes should stay brief and reference only necessary follow-up actions.

## Next Implementation Target
Update scripts/run-local-assistant-qwen-v2.js once this prompt-tightening spec has been reviewed.
