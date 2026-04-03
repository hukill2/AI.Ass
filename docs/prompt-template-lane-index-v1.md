# Prompt-Template Lane Index v1

This page is the single entry point for the prompt-template lane. Use it to see each current artifact, where the mirror lives, how the guard runs, and what operator guidance already exists.

## When to open what
- Need the source text? Start with `C:\AI.Ass\AI Prompt Templates.docx` first.
- Looking for the mirror that scripts read? Open `docs/prompt-templates.md` and rerun `scripts/sync-prompt-templates-v1.js` if the lookups are stale.
- Hit the guard in the wrapper? Jump to `docs/prompt-template-guard-quick-reference-v1.md` for the failure line plus commands, then follow the full checklist in `docs/prompt-template-guard-troubleshooting-v1.md` if the issue persists.
- Wondering how the guard fits into the wrapper or runbook? Consult `docs/operator-workflow-wrapper-spec-v1.md` and `docs/operator-runbook-and-usage-layer-v1.md`.
- Want the shared context summary? Use `docs/project-context-master-v1.md` after reviewing this index so future threads know where the lane artifacts live.

## Source & mirror
- `C:\AI.Ass\AI Prompt Templates.docx`: human staging/reference source; update it whenever template text changes.
- `docs/prompt-templates.md`: markdown mirror consumed by prompt scripts; `scripts/sync-prompt-templates-v1.js` regenerates it from the `.docx` source with the canonical heading/code block schema and `> **Last refreshed:** YYYY-MM-DD` metadata.
- **Reminder:** edit the `.docx` file as the single human source and rerun the sync script so the markdown mirror stays current for automation.

## Guard & automation
- `scripts/check-prompt-template-mirror-v1.js`: guard that checks templates for placeholder drift and schema issues and now runs first inside `scripts/operator-workflow-wrapper-v1.js --stage=preflight`.
- `docs/prompt-template-guard-troubleshooting-v1.md`: full checklist for refreshing the mirror, rerunning the guard, and retrying wrapper preflight when the guard fails.
- `docs/prompt-template-guard-quick-reference-v1.md`: compact card summarizing the guard failure line, key commands, staging source reminder, and link to the checklist.

## Operator guidance
- `docs/operator-runbook-and-usage-layer-v1.md`: runbook section now links to both the guard troubleshooting doc and the quick reference, plus interprets the guard-specific wrapper summary line.
- `docs/operator-workflow-wrapper-spec-v1.md`: spec documents the guard-first placement in preflight and the exact success/failure summary wording so the stop line is recognizable.
- `docs/project-context-master-v1.md`: aggregated Drive/GPT context now references the mirror contract, guard run, troubleshooting card, and quick reference to keep external readers aligned.
