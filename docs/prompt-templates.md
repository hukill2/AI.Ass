# Prompt templates (markdown mirror)

> **Last refreshed:** 2026-04-01

This file mirrors the prompt templates stored in Notion (and currently staged in `C:\AI.Ass\AI Prompt Templates.docx` for human reference). Until synchronized, refer to the source document for the authoritative text, but this markdown version is what the wrapper’s documentation and any scripts should read if Notion is unavailable.

## Templates

### New subsystem thread opener
> Template:
```
We are starting a new subsystem thread.

Previous subsystem is closed:
- <PREVIOUS_SUBSYSTEM_NAME>
- <PREVIOUS_SUBSYSTEM_STATUS>
- <OPTIONAL_COMMIT_HASH>

Treat the previous subsystem as closed unless a real defect is discovered.

New subsystem:
- <NEW_SUBSYSTEM_NAME>

Why this comes next:
- <REASON_1>
- <REASON_2>
- <REASON_3>

Subsystem goal:
<GOAL_DESCRIPTION>

Expected scope:
- <SCOPE_ITEM>
- <SCOPE_ITEM>
- <SCOPE_ITEM>

Primary files:
- <PRIMARY_FILE>
- <PRIMARY_FILE>

Secondary files only if narrowly required:
- <SECONDARY_FILE>
- <SECONDARY_FILE>

Out of scope unless explicitly required:
- Broad refactors
- Architecture redesign
- Reporting/storage expansion
- Approval/routing redesign
- Reworking prior closed subsystems
- Touching unrelated untracked files
- Any broad feature growth beyond this subsystem

Execution instructions:
1. Review the current implementation and current docs first.
2. Identify the real current behavior already present.
3. Define the narrow contract/behavior for this subsystem around the real implementation.
4. Make only the smallest coherent changes needed.
5. Update one canonical doc when the subsystem reaches milestone completeness.
6. Keep the subsystem narrow and self-contained.
7. Commit only when the subsystem stands on its own.

Definition of done:
- <DONE_ITEM>
- <DONE_ITEM>
- <DONE_ITEM>
- subsystem is complete enough to stand alone as a milestone

At the end, report:
- what changed
- the canonical contract/behavior now in place
- exact files changed
- whether the subsystem is complete enough to commit
```

### Alignment review / planning prompt
> Template:
```
<ALIGNMENT_REVIEW_PROMPT_TEXT>
```

### Standard execution prompt
> Template:
```
Proceed with the subsystem implementation.

Subsystem:
- <SUBSYSTEM_NAME>

Your task:
1. Review the current implementation and docs first.
2. Make the smallest coherent code/doc changes needed to complete this subsystem.
3. Keep the implementation aligned to actual current behavior unless a narrow corrective change is required.
4. Update the canonical doc for the subsystem milestone.
5. Do not broaden scope.
6. Ignore unrelated untracked files unless directly required.
7. Do not declare completion unless substantive changes were actually made.

At the end, report:
- files changed
- exact canonical contract/behavior now in place
- whether the subsystem is complete enough to commit
```

### Do not drift / finish the work prompt
> Template:
```
<DO_NOT_DRIFT_PROMPT_TEXT>
```

### Closeout prompt
> Template:
```
This subsystem is complete. Close it out fully.

Subsystem:
- <SUBSYSTEM_NAME>

Confirmed completed work:
- <CONFIRMED_CHANGE>
- <CONFIRMED_CHANGE>
- <CONFIRMED_CHANGE>

Canonical contract now in place:
- <CONTRACT_POINT>
- <CONTRACT_POINT>
- <CONTRACT_POINT>

Required before commit:
- Run final narrow subsystem-relevant validation immediately before commit.
- If code changed, rerun the key affected paths/checks.
- If docs only changed, verify the docs against actual implementation/behavior.
- Do not commit without final subsystem-relevant validation immediately beforehand.

Your tasks:
1. Add any final milestone-level note to the canonical documentation if still needed.
2. Run the final narrow validation for this subsystem immediately before commit.
3. Stage only the subsystem files relevant to this milestone.
4. Commit the subsystem with an appropriate commit message.
5. Report back with:
   - exact validation run before commit
   - exact files staged
   - commit hash
   - whether the subsystem is now fully closed
6. Then either:
   - suggest the next narrow subsystem, or
   - if there is genuine ambiguity, ask for direction only on the next subsystem choice

Constraints:
- Do not broaden scope
- Do not touch unrelated untracked files
- Do not reopen prior closed subsystems unless a real defect is discovered
- Keep this thread focused on closing this subsystem and teeing up the next one cleanly

Suggested commit message:
- `<COMMIT_MESSAGE>`
```

### Commit-only prompt
> Template:
```
<COMMIT_ONLY_PROMPT_TEXT>
```

### Validation prompt
> Template:
```
<VALIDATION_PROMPT_TEXT>
```

### Commit inconsistency / audit prompt
> Template:
```
<COMMIT_INCONSISTENCY_PROMPT_TEXT>
```

### Next subsystem suggestion prompt
> Template:
```
<NEXT_SUBSYSTEM_SUGGESTION_PROMPT_TEXT>
```

### Doc-only subsystem prompt
> Template:
```
<DOC_ONLY_SUBSYSTEM_PROMPT_TEXT>
```

### Code + doc subsystem prompt
> Template:
```
<CODE_DOC_SUBSYSTEM_PROMPT_TEXT>
```

### Standard one-line rules
> Template:
```
<STANDARD_ONE_LINE_RULES_TEXT>
```

### Recommended flow
> Template:
```
<RECOMMENDED_FLOW_TEXT>
```

### Minimal reusable skeleton
> Template:
```
New subsystem:
- <NAME>

Goal:
- <GOAL>

Primary files:
- <FILE>
- <FILE>

Out of scope:
- broad refactors
- unrelated files
- architecture redesign

Instructions:
1. Review current code/docs first.
2. Make the smallest coherent changes needed.
3. Update the canonical doc.
4. Run final narrow validation immediately before commit.
5. Stage only subsystem files.
6. Commit when complete enough to stand alone.

Report back with:
- what changed
- files changed
- validation run
- commit hash
- whether closed
- suggested next narrow subsystem
```
