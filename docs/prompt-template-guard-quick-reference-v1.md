# Prompt-Template Guard Quick Reference v1

Use this card when 
ode scripts/operator-workflow-wrapper-v1.js --stage=preflight stops with
Stage  preflight stopped at scripts/check-prompt-template-mirror-v1.js. It is the guard-first failure line that tells you the prompt-template mirror needs attention.

## Key reminder
- Staging source: C:\\AI.Ass\\AI Prompt Templates.docx contains the human templates you must refresh before regenerating the mirror.
- Quick commands:
  1. 
ode scripts/sync-prompt-templates-v1.js (regenerates docs/prompt-templates.md with the required headings/code blocks and the > **Last refreshed:** YYYY-MM-DD metadata line)
  2. 
ode scripts/check-prompt-template-mirror-v1.js (reruns the guard; the wrapper already runs it first but rerun manually to verify the fix)
  3. 
ode scripts/operator-workflow-wrapper-v1.js --stage=preflight (retries the wrapper after the guard passes)

## Troubleshooting follow-up
- If the guard still fails, open docs/prompt-templates.md, compare its sections to the .docx source, fix any placeholder-only templates, save the docx, and repeat the commands above.
- For the full recovery checklist, see docs/prompt-template-guard-troubleshooting-v1.md.
