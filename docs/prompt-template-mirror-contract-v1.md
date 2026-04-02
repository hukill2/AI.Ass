# Prompt-template mirror contract v1

This document defines how the future prompt-template system should be structured between Notion (living source) and the repo markdown mirror, keeping the operator wrapper/docs aware of the contract and preventing drift before any automation exists.

## Existing references
- `docs/operator-workflow-wrapper-spec-v1.md` currently points to `C:\AI.Ass\AI Prompt Templates.docx` as the placeholder location for the templates. That file should be considered the staging area until the Notion + markdown workflow is formalized.

## Mirror contract

1. **Canonical source (today):** Notion page “AI Prompt Templates” (URL TBD) is the primary, collaborative, editable store for the template text. Contributors edit Notion to craft and approve new prompts.
2. **Markdown mirror:** The repo holds `docs/prompt-templates.md` (this file is currently just the contract, but future iterations will host the exported templates). The markdown mirror is read-only unless updated via an explicit “mirror refresh” commit that pulls from Notion.
3. **Assistant read order:** Assistants consult Notion first when needing a template (because it is canonical and reflects the latest signal); if they cannot reach Notion, they fall back to the markdown mirror while logging or flagging the missing Notion update.
4. **Freshness expectations:** The mirror is considered fresh when the last refresh commit matches the latest Notion state. Until automation exists, include a simple date/timestamp note in the markdown mirror listing when it was last synced.
5. **Future bidirectional-sync intent:** A future subsystem may add a pull process (Notion → markdown) and a guard/check (markdown → Notion warning) so the repo side can stay current automatically. That subsystem must log any divergence and should not allow the repo to become active unless the mirror is up to date.
6. **What is not implemented yet:** No automation reads or writes Notion directly, no automated comparison exists, and no repo script modifies prompts. The current doc-only contract ensures clarity while keeping automation scoped to future work.

## References in other docs
- Keep the “Reference materials” section in `docs/operator-workflow-wrapper-spec-v1.md` pointing to `C:\AI.Ass\AI Prompt Templates.docx` until a more permanent mirror is populated.
- Document that `docs/prompt-templates.md` now holds the current markdown mirror; it should include a last-refreshed note (2026-04-01) and point back to the Notion/canonical source. That mirror exists for offline/automation usage until a sync process keeps it in sync with Notion.
- The helper script `scripts/check-prompt-template-mirror-v1.js` reports whether the mirror exists, that the freshness metadata is present, and whether the date can be parsed. Run it before relying on the mirror; it outputs a success line with the ISO date or an error describing missing/invalid metadata.
- The mirror file now follows a schema where each template section uses `### <Name>` followed by a `> Template:` intro and a fenced code block. That pattern keeps the content consistent and easier to refresh.
