# Prompt templates (markdown mirror)

> **Last refreshed:** 2026-04-01

This file mirrors the prompt templates stored in Notion (and currently staged in `C:\AI.Ass\AI Prompt Templates.docx` for human reference). Until synchronized, refer to the source document for the authoritative text, but this markdown version is what the wrapper’s documentation and any scripts should read if Notion is unavailable.

## Templates

### New subsystem thread opener
> Template:
```
We are starting a new subsystem thread.

Previous subsystem is closed:
- <PREVIOUS SUBSYSTEM NAME>
- <PREVIOUS SUBSYSTEM STATUS>
- <OPTIONAL COMMIT HASH>

Treat the previous subsystem as closed unless a real defect is discovered.

New subsystem:
- <NEW SUBSYSTEM NAME>

Why this comes next:
- <REASON 1>
- <REASON 2>
- <REASON 3>

Subsystem goal:
<ONE PARAGRAPH GOAL>

Expected scope:
- <SCOPE ITEM>
- <SCOPE ITEM>
- <SCOPE ITEM>

Primary files:
- <PRIMARY FILE>
- <PRIMARY FILE>

Secondary files only if narrowly required:
- <SECONDARY FILE>
- <SECONDARY FILE>

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
- <DONE ITEM>
- <DONE ITEM>
- <DONE ITEM>
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
<Insert the full alignment review / planning prompt text here from the template pack>
```

### Standard execution prompt
> Template:
```
Proceed with the subsystem implementation.

Subsystem:
- <SUBSYSTEM NAME>

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
<Insert the full "Do not drift / finish the work" prompt text from the pack>
```

### Closeout prompt
> Template:
```
This subsystem is complete. Close it out fully.

Subsystem:
- <SUBSYSTEM NAME>

Confirmed completed work:
- <CONFIRMED CHANGE>
- <CONFIRMED CHANGE>
- <CONFIRMED CHANGE>

Canonical contract now in place:
- <CONTRACT POINT>
- <CONTRACT POINT>
- <CONTRACT POINT>

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
- `<COMMIT MESSAGE>`
```

### Commit-only prompt
> Template:
```
<Include the commit-only prompt content from the prompt pack>
```

### Validation prompt
> Template:
```
<Insert the validation prompt from the pack>
```

### Commit inconsistency / audit prompt
> Template:
```
<Insert the commit inconsistency / audit prompt text here>
```

### Next subsystem suggestion prompt
> Template:
```
<Insert the next subsystem suggestion prompt text here>
```

### Doc-only subsystem prompt
> Template:
```
<Insert the doc-only subsystem prompt text here>
```

### Code + doc subsystem prompt
> Template:
```
<Insert the code + doc subsystem prompt text here>
```

### Standard one-line rules
> Template:
```
<Insert standard one-line rules text here>
```

### Recommended flow
> Template:
```
<Insert the recommended flow text here>
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
