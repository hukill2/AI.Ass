# Prompt templates (markdown mirror)

> **Last refreshed:** 2026-04-03

This file mirrors the prompt templates stored in Notion (and currently staged in C:/AI.Ass/AI Prompt Templates.docx for human reference). Run `node scripts/sync-prompt-templates-v1.js` whenever the staged document changes; the script converts that source into the exact `### <name>` / code-block schema the guard and retrieval helpers expect, then prints the full UTC timestamp it recorded. Until synchronization completes, treat the .docx file as the staging area and point readers/scripts at this markdown mirror only after it is refreshed.

## Templates

### New subsystem thread opener
> Template:
```
We are starting a new subsystem thread.

Previous subsystem is closed:
\- <PREVIOUS_SUBSYSTEM_NAME>
\- <PREVIOUS_SUBSYSTEM_STATUS>
\- <OPTIONAL_COMMIT_HASH>

Treat the previous subsystem as closed unless a real defect is discovered.

New subsystem:
\- <NEW_SUBSYSTEM_NAME>

Why this comes next:
\- <REASON_1>
\- <REASON_2>
\- <REASON_3>

Subsystem goal:
<ONE_PARAGRAPH_GOAL>

Expected scope:
\- <SCOPE_ITEM>
\- <SCOPE_ITEM>
\- <SCOPE_ITEM>

Primary files:
\- <PRIMARY_FILE>
\- <PRIMARY_FILE>

Secondary files only if narrowly required:
\- <SECONDARY_FILE>
\- <SECONDARY_FILE>

Out of scope unless explicitly required:
\- Broad refactors
\- Architecture redesign
\- Reporting/storage expansion
\- Approval/routing redesign
\- Reworking prior closed subsystems
\- Touching unrelated untracked files
\- Any broad feature growth beyond this subsystem

Execution instructions:
1. Review the current implementation and current docs first.
2. Identify the real current behavior already present.
3. Define the narrow contract/behavior for this subsystem around the real implementation.
4. Make only the smallest coherent changes needed.
5. Update one canonical doc when the subsystem reaches milestone completeness.
6. Keep the subsystem narrow and self\-contained.
7. Commit only when the subsystem stands on its own.

Definition of done:
\- <DONE_ITEM>
\- <DONE_ITEM>
\- <DONE_ITEM>
\- subsystem is complete enough to stand alone as a milestone

At the end, report:
\- what changed
\- the canonical contract/behavior now in place
\- exact files changed
\- whether the subsystem is complete enough to commit
```

### Alignment review / planning prompt
> Template:
```
Use this before work starts if you want Codex to inspect first and propose the smallest change set.

Before making changes, give me a subsystem alignment review for this subsystem:

Subsystem:
\- <SUBSYSTEM_NAME>

Report:
\- current implementation behavior actually present
\- current doc behavior actually present
\- mismatches or ambiguities between docs and implementation
\- smallest coherent change set you recommend
\- expected file footprint
\- whether this still looks narrow and self\-contained

Constraints:
\- do not make changes yet
\- do not broaden scope
\- ignore unrelated untracked files unless directly required
```

### Standard execution prompt
> Template:
```
Use this after alignment when you want Codex to actually do the subsystem.

Proceed with the subsystem implementation.

Subsystem:
\- <SUBSYSTEM_NAME>

Your task:
1. Review the current implementation and docs first.
2. Make the smallest coherent code/doc changes needed to complete this subsystem.
3. Keep the implementation aligned to actual current behavior unless a narrow corrective change is required.
4. Update the canonical doc for the subsystem milestone.
5. Do not broaden scope.
6. Ignore unrelated untracked files unless directly required.
7. Do not declare completion unless substantive changes were actually made.

At the end, report:
\- files changed
\- exact canonical contract/behavior now in place
\- whether the subsystem is complete enough to commit
```

### “Do not drift / finish the work” prompt
> Template:
```
Use this when Codex asks you unnecessary questions or says “tell me which doc to touch.”

Do not treat the previous reply as subsystem completion.

This subsystem is not done until you actually make the narrow changes and summarize them.

You do not need me to choose the canonical doc. Use the existing subsystem anchor:

\- Primary canonical doc: <PRIMARY_DOC>
\- Secondary alignment doc only if required: <SECONDARY_DOC>

Subsystem:
\- <SUBSYSTEM_NAME>

Your task now:
1. Review the current implementation and current docs.
2. Identify the existing behavior/output/contract already present.
3. Make the smallest coherent implementation/doc changes needed to establish a stable subsystem contract.
4. Update the canonical doc yourself.
5. Only touch the secondary doc if a narrow alignment edit is required.
6. Ignore unrelated untracked files unless directly required.
7. Do not ask me which doc to touch unless there is real ambiguity after reviewing the repo.
8. Do not declare completion unless substantive doc and/or code changes were actually made.

Deliverable at the end:
\- files changed
\- exact canonical contract now in place
\- whether the subsystem is complete enough to commit
```

### Closeout prompt
> Template:
```
Use this when the subsystem work is done and you want Codex to finish it cleanly.

This subsystem is complete. Close it out fully.

Subsystem:
\- <SUBSYSTEM_NAME>

Confirmed completed work:
\- <CONFIRMED_CHANGE>
\- <CONFIRMED_CHANGE>
\- <CONFIRMED_CHANGE>

Canonical contract now in place:
\- <CONTRACT_POINT>
\- <CONTRACT_POINT>
\- <CONTRACT_POINT>

Required before commit:
\- Run final narrow subsystem\-relevant validation immediately before commit.
\- If code changed, rerun the key affected paths/checks.
\- If docs only changed, verify the docs against actual implementation/behavior.
\- Do not commit without final subsystem\-relevant validation immediately beforehand.

Your tasks:
1. Add any final milestone\-level note to the canonical documentation if still needed.
2. Run the final narrow validation for this subsystem immediately before commit.
3. Stage only the subsystem files relevant to this milestone.
4. Commit the subsystem with an appropriate commit message.
5. Report back with:
\- exact validation run before commit
\- exact files staged
\- commit hash
\- whether the subsystem is now fully closed
6. Then either:
\- suggest the next narrow subsystem, or
\- if there is genuine ambiguity, ask for direction only on the next subsystem choice

Constraints:
\- Do not broaden scope
\- Do not touch unrelated untracked files
\- Do not reopen prior closed subsystems unless a real defect is discovered
\- Keep this thread focused on closing this subsystem and teeing up the next one cleanly

Suggested commit message:
\- \`<COMMIT_MESSAGE>\`
```

### Commit\-only prompt
> Template:
```
Use this when the files are already staged and you just want the commit plus next\-step recommendation.

Proceed with subsystem closeout.

Files staged:
\- <STAGED_FILE>
\- <STAGED_FILE>

Your tasks now:
1. Commit the staged subsystem files with this message:
\- \`<COMMIT_MESSAGE>\`
2. Report back with:
\- the final commit hash
\- confirmation that this subsystem is fully closed
3. Then propose the next narrow subsystem in the same area.
4. For that proposed next subsystem, include:
\- subsystem name
\- why it should come next
\- expected file footprint
\- whether it is likely doc\-only, code\+doc, or code\-heavy

Constraints:
\- Do not modify additional files during this step
\- Do not touch unrelated untracked files
\- Do not broaden scope beyond commit \+ next\-step recommendation
```

### Validation prompt
> Template:
```
Use this when you want Codex to run checks before claiming completion.

Run final narrow subsystem\-relevant validation for this subsystem.

Subsystem:
\- <SUBSYSTEM_NAME>

Required validation:
\- <CHECK_1>
\- <CHECK_2>
\- <CHECK_3>

Instructions:
1. Run only the narrow checks relevant to this subsystem.
2. Report exact commands run.
3. Report exit codes and concise behavior observed.
4. If any validation fails, do not close out the subsystem yet.
5. If validation passes, state that it is ready for closeout.

Do not broaden scope or touch unrelated files.
```

### Commit inconsistency / audit prompt
> Template:
```
Use this when Codex claims code \+ doc changes but only staged or committed one of them.

The closeout is not yet trustworthy as written.

You reported that this subsystem changed:
\- <FILE_A>
\- <FILE_B>

But the staged or committed files do not match that claim.

Your task:
1. Check the exact git status of the relevant subsystem files.
2. Report whether each file is:
\- modified
\- staged
\- already committed
\- unchanged
3. If a claimed subsystem file is not yet committed:
\- stage only that file
\- rerun the narrow relevant validation immediately before commit
\- create a narrow follow\-up commit
4. If the file was already committed earlier, report the exact commit hash that contains it.
5. Restate the subsystem closeout accurately.

Report back with:
\- exact status of each relevant file
\- whether the subsystem is actually fully closed
\- any follow\-up commit hash if needed
```

### Next subsystem suggestion prompt
> Template:
```
Use this when you want Codex to recommend what comes next.

Suggest the next narrow subsystem from here.

Current closed subsystem:
\- <CURRENT_SUBSYSTEM_NAME>

Context:
\- <SHORT_CONTEXT>
\- <SHORT_CONTEXT>

Your response must include:
\- subsystem name
\- why it should come next
\- subsystem goal
\- expected file footprint
\- likely type: doc\-only, code\+doc, or code\-heavy
\- what is explicitly out of scope
\- why it is narrow enough to stand alone

Prefer the next subsystem to stay adjacent to the current implementation area and avoid broad architecture growth.
```

### Doc\-only subsystem prompt
> Template:
```
Use this when the next subsystem should be documentation only.

We are starting a new doc\-only subsystem thread.

Previous subsystem is closed:
\- <PREVIOUS_SUBSYSTEM>

New subsystem:
\- <DOC\-ONLY_SUBSYSTEM_NAME>

Goal:
Complete a narrow documentation\-only subsystem that clarifies the current stable implementation and operator behavior without changing code.

Primary file:
\- <PRIMARY_DOC>

Secondary doc only if narrowly required:
\- <SECONDARY_DOC>

Instructions:
1. Review the current implementation and current docs first.
2. Update the canonical documentation to reflect actual stable behavior.
3. Do not change code unless a real defect is discovered.
4. Keep the subsystem narrow and milestone\-oriented.
5. Commit only when the doc update stands on its own.

Definition of done:
\- canonical doc updated
\- doc accurately reflects current implementation
\- no unnecessary file churn
\- subsystem stands alone as a milestone

At the end, report:
\- what changed
\- exact files changed
\- whether it is complete enough to commit
```

### Code \+ doc subsystem prompt
> Template:
```
Use this when the next subsystem should include both behavior and documentation.

We are starting a new code\+doc subsystem thread.

Previous subsystem is closed:
\- <PREVIOUS_SUBSYSTEM>

New subsystem:
\- <CODE\+DOC_SUBSYSTEM_NAME>

Goal:
Complete a narrow subsystem that makes a small implementation change and codifies the resulting behavior in the canonical documentation.

Primary files:
\- <CODE_FILE>
\- <DOC_FILE>

Secondary files only if narrowly required:
\- <OPTIONAL_FILE>

Instructions:
1. Review the current implementation and docs first.
2. Make the smallest coherent implementation change needed.
3. Update the canonical doc to match the resulting behavior.
4. Run final narrow subsystem\-relevant validation before commit.
5. Keep the subsystem narrow and self\-contained.

Definition of done:
\- implementation behavior is explicit and stable
\- canonical doc is aligned
\- validation passes
\- subsystem stands alone as a milestone

At the end, report:
\- what changed
\- exact files changed
\- validation run
\- whether it is complete enough to commit
```

### Your standard one\-line validation rule
> Template:
```
Paste this inside execution and closeout prompts:

Do not commit without final subsystem\-relevant validation immediately beforehand.
```

### Your standard one\-line anti\-drift rule
> Template:
```
Paste this when needed:

Ignore unrelated untracked files unless they are directly required for this subsystem.
```

### Your standard one\-line milestone rule
> Template:
```
Require a doc update when the subsystem reaches a meaningful milestone, not for every individual file.
```

### Recommended flow
> Template:
```
This is the practical order to use these prompts:

1. New subsystem thread opener
2. Alignment review prompt
3. Standard execution prompt
4. Validation prompt if needed
5. Closeout prompt
6. Commit\-only prompt if files are already staged
7. Next subsystem suggestion prompt
```

### Minimal reusable skeleton
> Template:
```
If you want one very short template you can adapt quickly:

New subsystem:
\- <NAME>

Goal:
\- <GOAL>

Primary files:
\- <FILE>
\- <FILE>

Out of scope:
\- broad refactors
\- unrelated files
\- architecture redesign

Instructions:
1. Review current code/docs first.
2. Make the smallest coherent changes needed.
3. Update the canonical doc.
4. Run final narrow validation immediately before commit.
5. Stage only subsystem files.
6. Commit when complete enough to stand alone.

Report back with:
\- what changed
\- files changed
\- validation run
\- commit hash
\- whether closed
\- suggested next narrow subsystem
```

