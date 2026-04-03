# Prompt-template Guard Troubleshooting v1

This short checklist guides operators through the exact recovery steps whenever the prompt-template mirror guard fails during wrapper preflight. Treat the guard-failure message (Prompt-template mirror guard failed. Refresh AI Prompt Templates.docx, rerun node scripts/sync-prompt-templates-v1.js, then rerun this wrapper stage.) as the trigger for this checklist.

## Troubleshooting steps
1. **Verify the staged source** – open C:\AI.Ass\AI Prompt Templates.docx, confirm the template sections contain real content (not placeholder text), and save any edits. The .docx file is the human staging source for the markdown mirror.
2. **Regenerate the mirror** – run 
ode scripts/sync-prompt-templates-v1.js. It rebuilds docs/prompt-templates.md with the required ### <Template Name> headings, fenced code blocks, normalized uppercase-underscore placeholders, and the > **Last refreshed:** YYYY-MM-DD metadata line that the guard and other prompt scripts expect.
3. **Re-run the guard** – execute 
ode scripts/check-prompt-template-mirror-v1.js manually to make sure the mirror now satisfies every schema check; this mirrors the automatic preflight guard step.
4. **Retry the wrapper** – run 
ode scripts/operator-workflow-wrapper-v1.js --stage=preflight again. Since the guard runs first, this ensures the remaining preflight validators only execute once the mirror passes.
5. **If the guard still fails**:
   - Inspect docs/prompt-templates.md for headings missing template names, code blocks missing the placeholder schema, or a stale > **Last refreshed:** line.
   - Confirm the guard failure message does not report missing templates (remove any empty placeholder sections or update them with real content).
   - Re-open the .docx source, reapply the corrected template text, and repeat steps 2–4.
   - If repeated regeneration still fails, compare the guard output against scripts/check-prompt-template-mirror-v1.js expectations and open a follow-up subsystem thread if the schema drift persists.

Once the checklist clears, the guard should succeed and you can continue with the remaining wrapper stages.
