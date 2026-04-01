# Second Write Task Candidate Criteria v1

## Purpose
Define how to select the next narrow write-capable task after the first verified real write.

## Required Criteria
- Narrowly scoped
- One-file only
- Implementation-oriented
- Easy to verify after writing
- Low risk
- Free of architecture, routing, guardrail, approval, or external integration changes

## Preferred File Types
- One validator script
- One status-report script
- One list/reporting script
- One small runtime helper
- One narrowly scoped documentation helper with clear verification

## Blocked Candidates
- Multi-file changes
- Architecture updates
- Routing or approval logic changes
- Execution-control changes
- Integration work
- Ambiguous improve or refactor tasks

## Selection Rule
- Prefer tasks similar in risk and scope to the first verified write.
- Prefer targets under scripts/ or runtime/.
- Prefer work with a straightforward verification command.

## Operator Guidance
- The second task should prove repeatability, not broaden scope.
- Choose the smallest useful next task.
- Keep lineage and logging intact.

