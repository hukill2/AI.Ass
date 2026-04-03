# Project Context Master v1

This file aggregates the current architecture, roadmap, guardrail/contract, future-plan, and canonical operator-workflow documentation identified during the repo/documentation alignment review.

Update this file whenever any of the source documents below change so the shared Google Drive / GPT reference stays aligned with the repo.

Use the active canonical docs for operator workflow material. Do not add historical duplicates here.

---

## Source: docs/architecture-pages-id-setup-v1.md

# Architecture Pages ID Setup v1

## Purpose
Document the Notion page ID needed to pull the AI Assistant Operating System root page for the architecture-page mirror lane.

## What This ID Is
- NOTION_AI_OS_PAGE_ID refers to the ID of the main **AI Assistant Operating System** page in Notion.
- It is distinct from NOTION_REVIEWS_DATABASE_ID, which points at the Reviews / Approvals database.
- This ID will be used by the future architecture-pages pull lane to locate the hub and its child documents.

## How to Get It
- Open the AI Assistant Operating System page in Notion.
- Copy the page ID from the URL (the UUID portion between / and ? or at the end of the URL).
- Make sure you capture the root AI Assistant Operating System page ID, not the Reviews / Approvals database ID or any other child page ID.

## Configuration Rule
- Real secret values belong in a local .env file that is never committed; keep .env.example as a template.
- Do not commit real tokens or IDs to the repository.


---

## Source: docs/architecture-pages-pull-contract-v1.md

# Architecture Pages Pull Contract v1\n\n## Purpose\nThis defines the first Notion-to-local pull contract for capturing the architecture pages beneath the AI Assistant Operating System hub into a machine-readable mirror.\n\n## Source Scope\n- Source root page: AI Assistant Operating System\n- Include direct child pages that describe the architecture, guardrails, routing, approval flow, memory/learning, JSON mirror mapping, contracts, or other system docs tied to AI.Ass\n- Do not include the Reviews / Approvals database entries in this lane; they have their own pull pipeline\n- Do not pull linked views or unrelated pages unless they are explicitly promoted into scope later\n\n## Initial Included Pages\n- Overview\n- Roles and Responsibilities\n- Guardrails\n- Routing Rules\n- Approval Flow\n- Memory and Learning\n- Mirror Schema Draft\n- Notification Rules\n- JSON Mirror Mapping v1\n- JSON Mirror Examples v1\n- JSON Export Contract v1\n- Notion Pull Contract v1\n- Notion Sync Implementation Plan v1\n- Notion Integration Setup Checklist\n- Routing Decision Contract v1\n- Learning Record Contract v1\n- Reviews / Approvals Required Fields v1\n- Data Lanes Overview v1\n\n## Required Pulled Fields\nEvery pulled page record should include:\n- page ID\n- page URL\n- title\n- parent/root reference\n- created_at\n- updated_at\n- full page content as normalized text or structured sections when possible\n\n## Pull Rules\n- Pull these pages read-only; do not attempt to apply edits back to Notion\n- Preserve each page's title exactly as it appears in Notion\n- Normalize body content consistently (e.g., strip extra whitespace, concat headings and paragraphs). Unknown block types should be ignored rather than crash the pull\n- Report missing or deleted pages clearly so operators can reconcile scope gaps\n- This lane is solely for architecture/reference documentation; do not pull approval state or database rows here\n\n## Local Output Target\n- mirror/architecture-pages.v1.json\n\n## Non-Goals\n- Do not implement push-back to Notion\n- Do not add Telegram notifications\n- Do not execute approval actions\n- Do not pull database rows (those live in the Reviews / Approvals lane)\n- Do not add semantic chunking or embeddings yet\n

---

## Source: docs/architecture-pages-sync-implementation-plan-v1.md

# Architecture Pages Sync Implementation Plan v1\n\n## Goal\nImplement the first real Notion pull into C:\AI.Ass\mirror\architecture-pages.v1.json.\n\n## Scope\n- Only the AI Assistant Operating System root page and its direct child architecture/reference pages.\n- Pull only; no push back to Notion.\n- Do not pull Reviews / Approvals database rows in this lane.\n- No Telegram integration.\n- No approval execution.\n- No semantic chunking or embeddings yet.\n\n## Planned Steps\n1. Read NOTION_API_KEY.\n2. Read NOTION_AI_OS_PAGE_ID.\n3. Retrieve the root page context.\n4. Retrieve direct child pages under the root.\n5. Fetch page metadata.\n6. Fetch page body blocks.\n7. Normalize content into readable text.\n8. Write mirror/architecture-pages.v1.json.\n9. Run 
pm run validate:architecture.\n10. Run 
pm run status:architecture.\n\n## Pull Rules\n- Pages are read-only.\n- Preserve page titles exactly.\n- Normalize body content consistently.\n- Unknown block types should not crash the pull.\n- Report missing pages clearly.\n- This lane is for architecture/reference content, not approval state.\n\n## Failure Handling\n- Missing env vars -> stop with a clear message.\n- Unreadable Notion response -> stop with a clear message.\n- Partial page parse -> log the page issue and only continue if safe to do so.\n- Invalid final output -> fail validation and stop.\n\n## Successful Output\n- mirror/architecture-pages.v1.json refreshed.\n- Validation run.\n- Status report run.\n

---

## Source: docs/assistant-read-order-v1.md

# Assistant Read Order v1\n\n## Purpose\nDefines the priority order in which the local assistant should consume mirrored data before deciding how to respond, execute, or route a task.\n\n## Read Order\n1. mirror/routing-decisions.v1.json\n2. mirror/learning-records.v1.json\n3. exports/reviews-approvals-mirror.v1.json\n4. mirror/architecture-pages.v1.json\n\n## Why This Order\n- Routing decisions have the most direct guidance about which lane (local, Claude, Codex) a new task should follow, so consult them first.\n- Learning records supply recent outcomes, strengths, failures, and lessons that inform how confidently the assistant can move forward.\n- The Reviews / Approvals mirror surfaces current human decision-state, pending approvals, and review context that may block or modify execution.\n- Architecture pages provide broader rules, constraints, and system design guidance when no more specific signal exists.\n\n## Initial Rule\n- Prefer the most specific and recent relevant record for the task, falling back along the read order when nothing applies.\n- If no prior routing or learning record addresses the task, consult the architecture guidance next.\n- Human approval state from the Reviews / Approvals mirror overrides autonomous execution.\n\n## Non-Goals\n- This file does not yet define embeddings, ranking, semantic search, or model-specific prompting.\n- It is only the first deterministic read-order contract for mirrored data.\n

---

## Source: docs/data-lanes-overview-v1.md

# Purpose
This file describes the current machine-readable data lanes in AI.Ass so operators and future automation understand which lane stores what.

# Lane 1 � Reviews / Approvals
This lane covers review items, approval state, the mirror/export pipeline, and the future Notion pull source. The key files are `mirror/reviews-approvals-source.v1.json` and `exports/reviews-approvals-mirror.v1.json`, while the supporting scripts are `scripts/build-reviews-approvals-mirror-v1.js`, `scripts/validate-reviews-approvals-mirror-v1.js`, and `scripts/sync-status-report-v1.js`.

# Lane 2 � Learning Records
This lane holds completed-task memory, lessons learned, future retrieval support, and inputs for routing improvements. The canonical file is `mirror/learning-records.v1.json`, with supporting validation and reporting provided by `scripts/validate-learning-records-v1.js` and `scripts/learning-status-report-v1.js`.

# Why the Lanes Are Separate
Approvals and learning serve different purposes: reviews/approvals track decision-state before or during work, while learning records capture what should be remembered afterward. Keeping them separate makes the system easier to validate, reason about, and automate later.

# Current State
Both lanes now have documented structure, local JSON files, validation scripts, and status reporting so the machine-readable contracts are observable and testable.

---

## Source: docs/json-export-contract-v1.md

# Purpose
This page defines the exact field-by-field export contract for Reviews / Approvals entries so downstream automation know how every Notion property and narrative block flows into the machine-readable mirror.

# Export Scope
- v1 only includes Reviews / Approvals database entries. Architecture pages and other content remain human-readable until a later version.

# Property-to-JSON Mapping
- Title ? `title`
- Task ID ? `task_id`
- Status ? `status`
- Decision ? `decision`
- Risk ? `risk`
- Route Target ? `route_target`
- Needs Approval ? `needs_approval`
- Execution Allowed ? `execution_allowed`
- Trigger Reason ? `trigger_reason`
- Operator Notes ? `operator_notes`
- Revised Instructions ? `revised_instructions`
- Sync Status ? `sync_status`
- Notion page ID ? `notion_page_id`
- Notion page URL ? `notion_url`
- Created At ? `created_at`
- Updated At ? `updated_at`

# Body Section Mapping
- Summary ? `body.summary`
- Full Context ? `body.full_context`
- Proposed Action ? `body.proposed_action`
- Why This Was Triggered ? `body.why_this_was_triggered`
- Risk Assessment ? `body.risk_assessment`
- Suggested Route ? `body.suggested_route`
- Affected Components ? `body.affected_components`
- Operator Notes section ? `body.operator_notes`
- Revised Instructions section ? `body.revised_instructions`
- Final Outcome ? `body.final_outcome`

# Conflict Rules
- Structured properties override prose when both exist (e.g., `Execution Allowed` controls `execution_allowed` even if the body describes a different intent).
- Body content remains descriptive context and is exported under the `body` object.
- Missing body sections become empty strings in the final export to keep the structure stable.
- Empty select values export as `null` to alert downstream consumers of the missing choice.
- Unchecked checkboxes export as `false` so boolean expectations stay explicit.

# Normalization Rules
- Booleans export as native `true`/`false` values.
- Timestamps export in ISO 8601 format (UTC preferred) as produced by Notion�s Created/Updated fields.
- Select values export as plain strings matching the option label.
- Blank text exports as an empty string.
- `TBD` is only used in this documentation or examples�never emitted by the production export.

# Decision-State Rule
- Approve ? `execution_allowed = true`.
- Deny ? `execution_allowed = false`.
- Modify ? `execution_allowed = false`.
- `decision = null` ? default `execution_allowed = false` for v1 until an operator explicitly approves.

---

## Source: docs/json-mirror-mapping-v1.md

# Purpose
This page defines the first mapping between Notion objects and the machine-readable JSON mirror so the assistant and automation layers can read/write structured state without losing the human-readable source of truth.

# Source Objects
- **AI Assistant Operating System pages** as a source of stable architecture names and guiding context.
- **Reviews / Approvals database** because it stores structured approval state, risk, routing, and metadata that must be mirrored.
- **Review item pages created from the Standard Review Item template** to capture the long-form narrative sections associated with each database row.

# Mapping Rules
- Notion page titles become stable object names wherever possible so automation references a consistent identifier.
- Database properties map directly to JSON keys so the mirror can replay selections and checkboxes deterministically.
- Body sections remain long-form text fields under the `body` object (summary, full context, etc.) so prose is preserved for review.
- Structured fields override prose when both exist. For example, the `Execution Allowed` checkbox controls `execution_allowed` even if the body text describes a different intent.
- Empty or missing fields map consistently to `null` or an empty string depending on the data type so downstream consumers can detect absent data reliably.

# Review Item JSON Shape
```
{
  "task_id": "",
  "title": "",
  "status": "",
  "decision": null,
  "risk": "",
  "route_target": "",
  "needs_approval": false,
  "execution_allowed": false,
  "trigger_reason": "",
  "operator_notes": "",
  "revised_instructions": "",
  "sync_status": "",
  "notion_page_id": "",
  "notion_url": "",
  "created_at": "",
  "updated_at": "",
  "body": {
    "summary": "",
    "full_context": "",
    "proposed_action": "",
    "why_this_was_triggered": "",
    "risk_assessment": "",
    "suggested_route": "",
    "affected_components": "",
    "operator_notes": "",
    "revised_instructions": "",
    "final_outcome": ""
  }
}
```

# Decision Logic
- **Approve** ? `execution_allowed = true` (the system can act once the operator approves).
- **Deny** ? `execution_allowed = false` (no automated work should proceed).
- **Modify** ? `execution_allowed = false` until the operator explicitly approves the revised request.

# Initial Export Scope
- Limit v1 export to Reviews / Approvals database entries only.
- Do not export all architecture pages yet; they remain human-readable references until the mirror matures.

---

## Source: docs/notion-integration-setup-checklist.md

# Purpose
This checklist covers the manual Notion setup required before enabling the real Notion pull sync.

# Required Notion Setup
- Create a Notion internal integration for the workspace that contains the AI Assistant Operating System.  
- Copy the integration token from Notion.  
- Locate the original Reviews / Approvals database.  
- Share that database with the integration.  
- Confirm the database is not just a linked view (it must be the canonical source).  
- Capture the database ID from the shared database settings.  
- When ready, place `NOTION_API_KEY` and `NOTION_REVIEWS_DATABASE_ID` into a local `.env` file (do not commit it).

# Important Notes
- Do not commit real secrets.  
- `.env.example` remains a template only.  
- Real Notion pull is not implemented yet.  
- The current pull script is only a stub.  
- The future pull target is `mirror/reviews-approvals-source.v1.json`.

# Ready-to-Implement Criteria
- Integration exists.  
- Token exists.  
- Database is shared with the integration.  
- Database ID is known.  
- `.env` is populated locally.

---

## Source: docs/notion-pull-contract-v1.md

# Purpose
This document defines the first Notion-to-local pull contract for the Reviews / Approvals workspace so operators know exactly which properties and narrative sections must land in the local mirror before a sync is built.

# Scope
- v1 pulls only from the Reviews / Approvals database.  
- Architecture pages and other docs remain human-readable and are not pulled yet.

# Required Pulled Properties
- Page ID
- Page URL
- Title
- Task ID
- Status
- Decision
- Risk
- Route Target
- Needs Approval
- Execution Allowed
- Trigger Reason
- Operator Notes
- Revised Instructions
- Sync Status
- Created At
- Updated At

# Required Body Sections
- Summary
- Full Context
- Proposed Action
- Why This Was Triggered
- Risk Assessment
- Suggested Route
- Affected Components
- Operator Notes
- Revised Instructions
- Final Outcome

# Pull Rules
- Structured properties (selects, checkboxes, metadata) are authoritative; the body only adds narrative context.  
- Body sections are exported verbatim under the `body` object; missing text becomes an empty string.  
- Empty selects become `null`, unchecked checkboxes become `false`, and text fields default to `""` so the mirror stays predictable.  
- Timestamps normalize to ISO 8601 (UTC), using the Created/Updated fields from Notion.  
- Unknown or missing headings in the template content should not crash the pull; simply emit empty strings for the expected sections.

# Output Target
- The pull writes or refreshes `C:/AI.Ass/mirror/reviews-approvals-source.v1.json` so the exporter/scripted mirror layer reads a consistent local source before building the final export.

# Non-Goals
- Telegram notifications are out of scope.  
- Approval actions or enforcement are not part of the pull.  
- Pushing state back to Notion is not implemented yet.  
- Architecture page synchronization is deferred to future versions.  
- Webhook listeners are not included in v1.

---

## Source: docs/codex-real-executor-plan-v1.md

# Codex Real Executor Plan v1

## Purpose
Defines the first real Codex execution plan once the dry-run chain has been validated end to end.

## Preconditions
Real execution may only occur when:
- a full approved chain exists
- the latest dry-run chain is complete
- the candidate remains `awaiting_execution`
- the handoff packet and invocation preview are present
- the review is still approved
- the operator explicitly authorizes real execution

## Execution Modes
1. **Read-only / inspection-first** ? inspect the payload, handoff, and preview before making changes.
2. **Workspace-write / actual changes** ? perform the real file edits.

Start with the safer read-only mode and proceed to workspace writes once confidence is established.

## Required Inputs
- execution_id
- review_id
- decision_id
- payload_id
- handoff_id
- preview_id
- task_id
- recommended_next_step
- files_to_create_or_update
- reasoning
- risks_or_guardrails
- operator_notes

## Expected Outputs
Real execution should produce:
- an execution log entry
- execution_result
- files_changed
- notes
- timestamps
- optional executor metadata

## Status Effects
- Allowed results: `success`, `blocked`, `failed`, `no_change`
- Real execution does not erase approval history.
- Changes to `execution_status` must be explicit and reviewable.
- Guard against duplicate reruns of the same approved candidate.

## Guardrails
- No automatic execution loops.
- No approval bypass.
- No silent file changes.
- Execution must be attributable and logged.
- Start with the smallest safe execution scope.

---

## Source: docs/codex-real-executor-readonly-plan-v1.md

# Codex Real Executor Read-Only Plan v1

## Purpose
Defines the first real Codex invocation mode once the full dry-run chain and readonly eligibility check have been validated.

## Scope
- Applies only to execution candidates that are:
  - approval-required
  - approved
  - handoff-eligible
  - previewed
  - execution_prepared
- This mode invokes Codex for real, but only in a read-only / inspection-first manner.
- No repository writes in v1.
- No Telegram.
- No Notion write-back.

## Preconditions
Read-only real execution may only occur when:
- the full approved chain exists
- the candidate is execution_prepared
- a Codex handoff packet exists
- a Codex invocation preview exists
- no prior real Codex execution log already exists for that execution_id in readonly mode

## Inputs
- execution_id
- review_id
- decision_id
- payload_id
- handoff_id
- preview_id
- task_id
- recommended_next_step
- files_to_create_or_update
- reasoning
- risks_or_guardrails
- operator_notes

## Expected Outputs
- a real execution log entry
- executor = "codex-readonly"
- execution_result
- files_changed = []
- notes capturing what Codex reported in readonly mode

## Allowed Result Values
- `success`
- `blocked`
- `failed`
- `no_change`

## Guardrails
- Codex must be invoked in readonly mode only.
- No repository writes.
- No silent file changes.
- Explicit operator invocation only.
- Execution must remain attributable and logged.
- No automatic loops or retries in v1.

---

## Source: docs/local-write-executor-dryrun-plan-v1.md

# Local Write Executor Dry-Run Plan v1

## Purpose
Defines the dry-run rehearsal step before AI.Ass supports a write-enabled local executor.

## Scope
- Applies to candidates that are:
  - approval-required
  - approved
  - execution_prepared
  - readonly-successful
  - write-eligible under docs/write-execution-eligibility-rules-v1.md
- Does not write files yet.
- Does not alter repo state.
- Does not send Telegram.
- Does not write back to Notion.

## Preconditions
Dry-run write preparation may only occur when:
- the full approved chain exists
- a successful qwen-readonly execution log exists
- the candidate remains execution_prepared
- the operator explicitly chooses to test write-enabled readiness

## Expected Behavior
The dry-run write executor should:
- inspect the candidate and its file targets
- verify the scope is narrow enough for v1
- prepare a write-execution preview or log entry
- not modify any files

## Expected Outputs
- A dry-run write-execution log entry
- execution_result
- files_changed = []
- notes describing what the real write mode would do

## Guardrails
- No repo writes in dry-run mode.
- No automatic retries.
- No approval bypass.
- No broad refactors.
- Explicit operator invocation only.
- Logging is required for every dry-run write attempt.

## Relationship to Real Write Mode
- This dry-run mode is the final rehearsal before writing is enabled.
- Success here does not itself authorize real writes.

---

## Source: docs/local-write-executor-plan-v1.md

# Local Write Executor Plan v1

## Purpose
Defines the first write-enabled execution mode now that the readonly executor run has been validated.

## Preconditions
Write-enabled execution may only occur when:
- a full approved chain exists
- the candidate remains `execution_prepared`
- a readonly real executor run has already succeeded for the same execution_id
- the operator explicitly authorizes write-enabled execution

## Initial Scope
- Prefer single-file or tightly bounded changes.
- Avoid broad multi-file refactors.
- Avoid touching architecture, routing, guardrail, or approval system rules.
- Do not introduce external integrations or side effects.

## Required Inputs
- execution_id
- review_id
- decision_id
- payload_id
- handoff_id
- preview_id
- task_id
- recommended_next_step
- files_to_create_or_update
- reasoning
- risks_or_guardrails
- operator_notes

## Expected Outputs
- A real execution log entry.
- execution_result.
- files_changed.
- notes and timestamps.
- Optional diff or change summary when available.

## Guardrails
- Explicit operator invocation only.
- No automatic retries or loops.
- All writes must be attributable and logged.
- Execution success remains separate from prior approval.
- Failed execution must not silently alter state.
- Start with the smallest safe write scope.

## Non-Goals
- No autonomous broad repo changes.
- No approval bypass.
- No Telegram or Notion write-back yet.

---

## Source: docs/model-selection-plan-v1.md

# Model Selection Plan v1\n\n## Purpose\nDefines the first local model selection process for AI.Ass.\n\n## Timing\n- Model selection should begin now that the local mirrored data lanes and read-order contract are defined.\n- Treat the first chosen model as a benchmark candidate, not a permanent commitment.\n\n## Initial Shortlist\n- Qwen2.5-Coder 7B\n- DeepSeek-Coder-V2 Lite\n- One general-purpose fallback model to be chosen later, based on hardware and planning needs.\n\n## Initial Recommendation\nRecommend testing Qwen2.5-Coder 7B first as the local coding assistant candidate. Code Llama 7B is older and should not be the initial default.\n\n## Evaluation Criteria\n- Ability to follow the assistant read order.\n- Code-task quality.\n- Routing and planning usefulness.\n- Latency on local hardware.\n- Memory footprint.\n- Reliability on repeated structured tasks.\n\n## Decision Rule\n- Do not lock in a permanent default until benchmark tasks have been run against the shortlist.\n- Choose the smallest model that performs reliably on the real workflow.\n

---

## Source: docs/notion-sync-implementation-plan-v1.md

# Goal
Implement the first real Notion pull so the Reviews / Approvals mirror writes directly into `C:/AI.Ass/mirror/reviews-approvals-source.v1.json`.

# Scope
- Only the Reviews / Approvals database.  
- Pull only (no pushback to Notion).  
- No Telegram integration.  
- No approval execution.  
- No architecture page synchronization.

# Planned Steps
- Read `NOTION_API_KEY`.  
- Read `NOTION_REVIEWS_DATABASE_ID`.  
- Query the Reviews / Approvals database.  
- Retrieve page properties.  
- Retrieve page body content.  
- Extract the required sections (Summary ? Final Outcome).  
- Normalize fields per `docs/notion-pull-contract-v1.md`.  
- Write `mirror/reviews-approvals-source.v1.json`.  
- Run the build script.  
- Run the validator.  
- Run the status report.

# Extraction Rules
- Structured properties remain authoritative.  
- Page headings map into the body fields defined in the contract.  
- Missing sections become empty strings.  
- Empty select values become `null`.  
- Unchecked checkboxes become `false`.

# Failure Handling
- Missing environment variables should stop the pull with a clear message.  
- Unreadable or malformed Notion responses should stop with a descriptive error.  
- Partial item parsing issues should be logged and skipped only if they do not corrupt the mirror.  
- Invalid final output should fail validation and halt the pipeline.

# Successful Output
- `mirror/reviews-approvals-source.v1.json` is refreshed.  
- `exports/reviews-approvals-mirror.v1.json` is rebuilt.  
- Validator runs successfully.  
- Status report runs successfully.

---

## Source: docs/post-write-verification-plan-v1.md

# Post Write Verification Plan v1

## Purpose
Explain that this file defines how AI.Ass should verify a written artifact immediately after a real write-enabled execution.

## Scope
- Applies to successful real write-enabled executions.
- Verification must stay narrow and file-type specific.
- Verification does not replace execution logging or widen the write scope.
- No Telegram or Notion write-back yet.

## Verification Rule
- A file write is not fully trusted until a dedicated verification step runs.
- Choose verification based on the written file type and intended behavior.
- Keep verification deterministic, reviewable, and minimal.

## Initial v1 Verification Types
- JavaScript syntax or runtime checks (e.g., node --check).
- Validator scripts should run known-valid and known-invalid samples.
- Simple exit-code assertions that match the file’s purpose.
- Confirm the file exists and has expected contents.

## Logging Expectations
- Record that verification was attempted and whether it passed or failed.
- Capture concise verification notes and the command(s) used.
- State whether verification alters the interpretation of the write result.

## Result Handling
- Track write success and verification success separately.
- A successful write may still fail verification; do not hide it.
- Log verification outcomes so they remain attributable.

## Guardrails
- Verification must not introduce broad side effects.
- Keep verification within the narrow v1 write scope.
- Verification commands should be explicit, deterministic, and minimal.
- Operator review remains authoritative.


---

## Source: docs/task-context-builder-plan-v1.md

# Task Context Builder Plan v1\n\n## Purpose\nDefines the first deterministic task-context builder for AI.Ass.\n\n## Goal\nAssemble a compact local task context packet from the existing mirrored files without building a full assistant runtime yet.\n\n## Read Order\n1. mirror/routing-decisions.v1.json\n2. mirror/learning-records.v1.json\n3. exports/reviews-approvals-mirror.v1.json\n4. mirror/architecture-pages.v1.json\n\n## Proposed Output\nCreate a small JSON packet containing:\n- 	ask_id\n- 	ask_summary\n- 
elevant_routing_examples\n- 
elevant_learning_records\n- 
elevant_review_state\n- 
elevant_architecture_context\n- 
otes\n\n## Why This Step Comes Next\n- It is smaller than building a full runtime.\n- It tests whether the mirrored files are usable.\n- It prepares clean inputs for local model benchmarking.\n- It stays aligned with the assistant read-order contract.\n\n## Guardrails\n- Deterministic only.\n- No embeddings yet.\n- No semantic search yet.\n- No long-running daemon.\n- No direct model integration yet.\n

---

## Source: docs/assistant-decision-contract-v1.md

# Assistant Decision Contract v1

## Purpose
Defines the schema and persistence rules for structured local assistant decisions emitted by the default model.

## Required Fields
- decision_id`n- 	ask_id`n- model`n- 
ecommended_next_step`n- iles_to_create_or_update`n- 
easoning`n- 
isks_or_guardrails`n- 
otes`n- created_at`n
## Output JSON Shape
`json
{
  " decision_id\: \\,
 \task_id\: \\,
 \model\: \\,
 \recommended_next_step\: \\,
 \files_to_create_or_update\: [],
 \reasoning\: \\,
 \risks_or_guardrails\: [],
 \notes\: \\,
 \created_at\: \\
}
` 

## Rules
- Persist only valid structured outputs that exactly match the schema above.
- Do not invent or default missing fields during persistence; leave them empty if the model left them empty.
- Suggested filenames remain recommendations; writing them to storage does not automatically create project files.
- Stored decisions must remain deterministic and reviewable by humans and automation alike.

---

## Source: docs/assistant-decision-prompt-tightening-v1.md

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

---

## Source: docs/codex-execution-contract-v1.md

# Codex Execution Contract v1

## Purpose
Defines the minimum conditions and data required before AI.Ass can invoke Codex for a real execution run while keeping everything explicit and reviewable.

## Scope
- Applies only to candidates that already have:
  - an approved review
  - an execution candidate
  - a prepared executor payload
  - a Codex handoff packet
  - a Codex invocation preview
- Does not implement execution yet.
- Does not send Telegram.
- Does not write back to Notion yet.

## Minimum Execution Preconditions
Real Codex execution may only occur when:
- review classification = approval-required
- operator_status = approved
- execution_status = awaiting_execution
- a prepared payload exists
- a prepared Codex handoff packet exists
- a prepared Codex invocation preview exists
- the candidate remains valid and reviewable

## Minimum Executor Inputs
The executor must receive:
- execution_id
- review_id
- decision_id
- payload_id
- handoff_id
- preview_id
- task_id
- recommended_next_step
- files_to_create_or_update
- reasoning
- risks_or_guardrails
- operator_notes

## Minimum Execution Result Fields
```
{
  "execution_log_id": "",
  "execution_id": "",
  "review_id": "",
  "decision_id": "",
  "payload_id": "",
  "handoff_id": "",
  "preview_id": "",
  "executor": "",
  "execution_result": "",
  "files_changed": [],
  "notes": "",
  "created_at": ""
}
```

## Allowed Result Values
- `success`
- `blocked`
- `failed`
- `no_change`

## Guardrails
- Codex execution must stay explicit and reviewable.
- Do not execute without the full reviewed chain.
- Execution success is separate from prior approval.
- Record logs after every real run.
- Blocked or failed executions must not silently alter state.
- No automatic re-execution loops in v1.

---

## Source: docs/codex-handoff-dry-run-contract-v1.md

# Codex Handoff Dry Run Contract v1

## Purpose
Defines the structure for a future Codex handoff packet while keeping the workflow non-executing in v1.

## Scope
- Applies to prepared payloads in `runtime/executor-payloads.v1.json`.
- Does not invoke Codex yet.
- Does not execute anything.
- Does not change files.
- Does not write back to Notion.
- Does not send Telegram.

## Minimum Handoff Packet Fields
```
{
  "handoff_id": "",
  "payload_id": "",
  "execution_id": "",
  "review_id": "",
  "decision_id": "",
  "task_id": "",
  "executor_target": "",
  "recommended_next_step": "",
  "files_to_create_or_update": [],
  "reasoning": "",
  "risks_or_guardrails": [],
  "operator_notes": "",
  "prepared_at": ""
}
```

## Rules
- Each handoff packet is derived directly from a prepared executor payload.
- `executor_target` should name the intended executor (for example, `codex`).
- Creating a handoff packet is not execution.
- Handoff packets must remain reviewable and deterministic.
- No automatic Codex handoff occurs in v1.

## Guardrails
- Do not invoke any executor yet.
- Do not write files beyond the handoff packet store.
- Do not make silent project changes.
- Do not bypass approvals.
- Fail clearly if the payload is missing or invalid before creating a handoff packet.

---

## Source: docs/codex-invocation-preview-contract-v1.md

# Codex Invocation Preview Contract v1

## Purpose
Defines how the workspace should build the exact instruction payload that will be sent to Codex in the future, without actually invoking any executor in v1.

## Scope
- Applies to Codex handoff packets stored in `runtime/codex-handoff-packets.v1.json`.
- Does not invoke Codex.
- Does not execute anything.
- Does not write code or modify files.
- Does not send Telegram or call external services.

## Required Preview Fields
Each preview must capture:
- `preview_id`
- `handoff_id`
- `payload_id`
- `execution_id`
- `decision_id`
- `task_id`
- `executor_target`
- `prompt_text`
- `files_to_create_or_update`
- `risks_or_guardrails`
- `operator_notes`
- `prepared_at`

`prompt_text` should represent the exact instruction that Codex will eventually receive when this packet is executed.

## Rules
- Previews are derived from Codex handoff packets; no additional inference occurs.
- Do not duplicate previews for the same `handoff_id`.
- Creating a preview is not execution.
- Keep previews reviewable and deterministic.

## Guardrails
- No Codex invocation yet.
- No file writes beyond `runtime/codex-invocation-previews.v1.json`.
- No silent project changes.
- Do not bypass approvals.
- Fail clearly if the handoff packet is missing or malformed.

---

## Source: docs/decision-review-gate-contract-v1.md

# Decision Review Gate Contract v1\n\n## Purpose\nDefines how structured assistant decisions are classified for local review before any execution or Codex handoff occurs.\n\n## Scope\n- Applies to decisions stored in 
untime/assistant-decisions.v1.json.\n- Does not execute code.\n- Does not call Codex.\n- Does not call Claude.\n- Does not send Telegram yet.\n- Does not push to Notion yet.\n\n## Decision Classes\n- **Informational** � observations or analysis-only guidance.\n- **Review-required** � proposals that involve meaningful repository, documentation, or process changes.\n- **Approval-required** � impacts execution, external actions, guardrails, routing policy, or sensitive data/state.\n\n## Initial Classification Rules\n- If the decision is explicitly analysis-only and proposes no file changes, classify it as informational.\n- If iles_to_create_or_update names project files, treat it at least as review-required.\n- If the decision proposes changing rules, architecture, approval flows, routing, or external integrations, escalate it to approval-required.\n\n## Required Review Record Fields\nEach review record should include:\n- 
eview_id\n- decision_id\n- 	ask_id\n- classification\n- 
ecommended_action\n- operator_status\n- operator_notes\n- created_at\n- updated_at\n\n## Guardrails\n- No execution happens in v1.\n- Storing a decision is not the same as approving it.\n- Operator review remains authoritative.\n- Future Notion/Telegram integrations should route through this gate, not bypass it.\n

---

## Source: docs/decision-review-status-rules-v1.md

# Decision Review Status Rules v1\n\n## Purpose\nDefines how review records transition through operator statuses in 
untime/decision-reviews.v1.json.\n\n## Allowed Statuses\n- pending\n- reviewed\n- approved\n- rejected\n\n## Allowed Transitions\n- pending -> reviewed\n- reviewed -> approved\n- reviewed -> rejected\n\n## Rules\n- Only the operator may change a review status.\n- Approved does not execute anything yet in v1.\n- Rejected means the proposal is not accepted in its current form.\n- Approval must be explicit for approval-required items.\n- Reviewed means the operator has seen the item but has not yet approved it.\n\n## Guardrails\n- Storing a decision is not approval.\n- Classification is not approval.\n- Reviewed is not approval.\n- Execution remains blocked in v1 even after approval until a later execution layer is added.\n

---

## Source: docs/execution-gate-contract-v1.md

# Execution Gate Contract v1

  ## Status note
This document is now historical for the promotion gate only. The repo has since added readonly and write executor layers; use `docs/local-readonly-executor-status-v1.md`, `docs/local-write-executor-contract-v1.md`, and `docs/codex-execution-contract-v1.md` for the current execution reality.
**Tooling note:** we still need to plumb in OLLama APIs so the executor docs and their supporting scripts can choose/report the live inference model dynamically rather than hard-coding the current qwen variant.

## Purpose
Defines how approved decision reviews are elevated to execution candidates within the local workflow.

## Scope
- Applies to review records in runtime/decision-reviews.v1.json.
- Applies to matching assistant decisions in runtime/assistant-decisions.v1.json.
- Does not execute code.
- Does not call Codex yet.
- Does not call Claude.
- Does not send Telegram.
- Does not write back to Notion.

## Execution Candidate Definition
An item is eligible to become an execution candidate only when:
- classification =  approval-required.
- operator_status = approved.
- The associated assistant decision exists.
- The assistant decision is structurally valid.

## Required Execution Candidate Fields
```json
{
  "execution_id": "",
  "review_id": "",
  "decision_id": "",
  "task_id": "",
  "execution_status": "",
  "recommended_next_step": "",
  "files_to_create_or_update": [],
  "reasoning": "",
  "risks_or_guardrails": [],
  "operator_notes": "",
  "created_at": "",
  "updated_at": ""
}
```

## Initial Execution Statuses
- awaiting_execution
- execution_blocked
- execution_prepared
- executed

For the original promotion-only gate, only `awaiting_execution` and `execution_blocked` were expected to be used.

## Initial Rules
- Approved review items may be promoted to execution candidates.
- Promotion is not execution.
- This document does not describe the later executor layers that were added after the promotion gate.
- Malformed or incomplete approved items should become execution_blocked.
- Carry operator notes forward into the execution candidate.

## Guardrails
- No automatic execution in v1.
- No direct Codex handoff in v1.
- No external side effects in v1.
- Execution candidates exist only to make the future execution layer explicit and reviewable.

---

## Source: docs/execution-handoff-contract-v1.md

# Execution Handoff Contract v1

## Purpose
This contract captures what must be true before an execution candidate moves toward a future execution layer such as Codex. It keeps the handoff deterministic, reviewable, and free of automatic execution.

## Scope
- Applies to records stored in `runtime/execution-candidates.v1.json`.
- Does not execute anything yet.
- Does not call Codex yet.
- Does not call Claude.
- Does not send Telegram.
- Does not write back to Notion.

## Minimum Handoff Requirements
An execution candidate is eligible for handoff only when:
- `execution_status` is `awaiting_execution`.
- There is a valid linked approved review record.
- There is a valid linked assistant decision.
- The `recommended_next_step` is concrete.
- The `reasoning` field is reviewable and grounded in the provided task context.
- Any proposed implementation work lists concrete targets in `files_to_create_or_update`.

## Handoff Blocking Rules
Handoff must remain blocked when:
- The linked review is not approved.
- The assistant decision is missing or malformed.
- The next step is explicitly analysis-only.
- The candidate is marked `execution_blocked`.
- Implementation-oriented work lacks the required file targets.

## Future Execution Log Fields
Execution logs created later should follow this shape:
```
{
  "execution_log_id": "",
  "execution_id": "",
  "review_id": "",
  "decision_id": "",
  "executor": "",
  "execution_result": "",
  "files_changed": [],
  "notes": "",
  "created_at": ""
}
```

## Guardrails
- Approval to execute is not the same as execution success.
- Execution must remain explicit and reviewable.
- Execution logs should be written after a future execution actually runs.
- There is no automatic handoff in v1.
- There are no silent file changes in v1; every change goes through a reviewed command.

---

## Source: docs/executor-invocation-contract-v1.md

# Executor Invocation Contract v1

## Purpose
This file defines what a future execution layer must receive and return when acting on a handoff-eligible execution candidate so the entire pipeline stays explicit and reviewable.

## Scope
- Applies only to handoff-eligible items from `runtime/execution-candidates.v1.json`.
- Does not execute anything yet.
- Does not call Codex yet.
- Does not call Claude.
- Does not send Telegram.
- Does not write back to Notion.

## Minimum Invocation Inputs
Before handing work to an executor, the system must provide:
- `execution_id`
- `review_id`
- `decision_id`
- `task_id`
- `recommended_next_step`
- `files_to_create_or_update`
- `reasoning`
- `risks_or_guardrails`
- `operator_notes`

## Minimum Execution Result Fields
The executor must return a structured result that looks like:
```
{
  "execution_log_id": "",
  "execution_id": "",
  "review_id": "",
  "decision_id": "",
  "task_id": "",
  "executor": "",
  "execution_result": "",
  "files_changed": [],
  "notes": "",
  "created_at": ""
}
```

## Result Meanings
- `success`: the executor completed the requested work.
- `blocked`: execution could not proceed due to an external issue (missing data, permission, etc.).
- `failed`: the executor attempted the work but encountered a failure.
- `no_change`: the work was already done or the candidate was no longer applicable.

## Guardrails
- Executor input must originate only from handoff-eligible candidates.
- Execution must remain explicit and reviewable; no automatic handoffs.
- Execution results must be recorded after a future run.
- No silent file changes are allowed.
- Executions must never bypass approvals.

---

## Source: docs/learning-record-contract-v1.md

# Purpose
This file defines what the system should remember after a task or escalation completes so future routing, execution, and mirror logic can learn from concrete outcomes.

# What Should Be Recorded
- Task ID  
- Title  
- Task type  
- Risk  
- Route used  
- Whether the task was attempted locally first  
- Whether approval was required  
- Approval outcome  
- Final outcome  
- Whether the result was accepted, revised, or rejected  
- Summary of what worked  
- Summary of what failed  
- Lesson learned  
- Follow-up recommendation

# What Counts as a Good Learning Record
Records should be concise, factual, reviewable, grounded in actual outcomes, and useful for shaping future routing or execution decisions.

# What Should Not Be Stored
Avoid vague praise, invented success claims, hidden failures, bloated summaries, or repeated narration when a short lesson will do.

# Per-Route Notes
- Local: note whether the assistant handled it correctly without escalation.  
- Claude: note whether the reasoning or planning proved useful.  
- Codex: note whether the implementation result was correct and usable.

# Output JSON Shape
```
{
  "record_id": "",
  "task_id": "",
  "title": "",
  "task_type": "",
  "risk": "",
  "route_used": "",
  "attempted_locally_first": false,
  "required_approval": false,
  "approval_outcome": "",
  "final_outcome": "",
  "result_quality": "",
  "worked": "",
  "failed": "",
  "lesson_learned": "",
  "follow_up_recommendation": "",
  "created_at": ""
}
```

# Rules
- Only store records after meaningful task completion or failure.  
- Records must reflect actual outcomes.  
- `lesson_learned` should be short and actionable.  
- `follow_up_recommendation` should suggest what to do next time.  
- Records should stay easy to mirror into JSON later.

---

## Source: docs/local-write-executor-contract-v1.md

# Local Write Executor Contract v1

## Purpose
Defines the first real write-enabled executor mode after readonly success and write dry-run success have both been validated.

## Preconditions
Real write-enabled execution may only occur when:
- a full approved chain exists
- the candidate is execution_prepared
- a successful qwen-readonly execution log exists
- a successful qwen-write-dryrun log exists
- the operator explicitly chooses real write execution

## Allowed v1 Scope
- One concrete target file.
- Tightly bounded implementation work.
- Script- or runtime-level changes only.
- No broad repo change.

## Blocked v1 Scope
- Architecture changes.
- Routing changes.
- Guardrail changes.
- Approval workflow changes.
- External integrations.
- Multi-file refactors.
- Ambiguous or analysis-only tasks.

## Required Inputs
- execution_id
- review_id
- decision_id
- payload_id
- handoff_id
- preview_id
- task_id
- recommended_next_step
- files_to_create_or_update
- reasoning
- risks_or_guardrails
- operator_notes

## Expected Outputs
Real write-enabled execution must produce:
- an execution log entry
- execution_result
- files_changed
- notes
- timestamps
- optional short change summary

## Guardrails
- Explicit operator invocation only.
- No automatic retries.
- No silent writes.
- All changes must be attributable and logged.
- Execution success is separate from approval.
- Failed execution must still be logged.

---

## Source: docs/narrowed-followup-task-contract-v1.md

# Narrowed Follow-Up Task Contract v1

## Purpose
Defines how to capture a narrower write-safe follow-up task derived from a broad approved candidate without altering the original candidate.

## Required Fields
Each follow-up task record must include:
- `followup_id`
- `source_execution_id`
- `source_review_id`
- `source_decision_id`
- `task_id`
- `narrowed_task_summary`
- `target_files`
- `reason_for_narrowing`
- `operator_notes`
- `created_at`

## Output JSON Shape
```
{
  "followup_id": "",
  "source_execution_id": "",
  "source_review_id": "",
  "source_decision_id": "",
  "task_id": "",
  "narrowed_task_summary": "",
  "target_files": [],
  "reason_for_narrowing": "",
  "operator_notes": "",
  "created_at": ""
}
```

## Rules
- Follow-up tasks must be narrower than the source candidate.
- `target_files` must be concrete existing paths.
- Follow-up tasks do not modify the original candidate or authorize execution.
- Follow-up tasks are advisory, guiding future write-enabled work.

---

## Source: docs/operator-workflow-wrapper-spec-v1.md

# Operator Workflow Wrapper Specification v1

This spec defines a minimal “operator workflow wrapper” that coordinates the existing scripts in the reporting/validation/meta stack. Its job is to give operators one consistent entrypoint for the preflight → readiness → execution-prep → post-verification flow described elsewhere. The latest spec iteration describes the eligible-candidate readonly-log guard chain (payload → decision → execution_id → handoff/preview → timestamp) so all stakeholders see the same canonical data-integrity sequence before the remaining validators run.

The preflight checklist now includes the newly added `validate-eligible-candidate-readonly-log-execution-id-match-v1.js` guard, so the wrapper explicitly confirms a successful `qwen-readonly` log shares the same execution identity as the chosen candidate before continuing through the handoff/review validation chain.
The preceding `validate-eligible-candidate-payload-existence-v1.js` guard makes that chain more deterministic by ensuring the eligible candidate’s `payload_id` actually resolves to one of the executor payload records before the readonly log matching runs.
The newest `validate-eligible-candidate-payload-schema-v1.js` guard now enforces the minimum executor payload metadata (review_id, decision_id, task_id, prepared_at, and files_to_create_or_update) before the remaining readonly and handoff validators rely on that record.
The subsequent `validate-eligible-candidate-readonly-log-timestamp-guard-v1.js` now insists the eligible candidate exposes a valid `updated_at` timestamp before comparing freshness, so missing or invalid timestamps stop preflight rather than producing an ambiguous comparison.

## Purpose
- Provide a single command that runs the documented preflight checklist, tooling readiness checks, validator suite, meta health reports, and alignment validations.
- Surface clear pass/fail outcomes, stop conditions, and resulting artifacts without re-implementing the core scripts.
- Keep scope thin: the wrapper orchestrates, not replaces, the scripts already documented in `operator-workflow-script-inventory-v1.md`, `operator-workflow-canonical-flow-v1.md`, and `operator-workflow-preflight-checklist-v1.md`.

## Invocation
`node scripts/operator-workflow-wrapper-v1.js [--stage=<stage>]`

- `--stage` (optional): `preflight`, `readiness`, `prep`, `post`, or `all` (default). Each stage runs the scripts tied to that phase, in the canonical order.
- Without `--stage`, the wrapper runs the whole flow: preflight → readiness → execution prep → post-run verification.

## Help output
- Run `node scripts/operator-workflow-wrapper-v1.js --help` (or `-h`) to print the supported stages, usage line, and a reminder that omitting `--stage` runs all stages sequentially.
- The help text mirrors the documented stage names so operators can discover them without diving into the spec.

## Inputs
- Environment must point to the repo root (scripts expect standard runtime/*.json files).
- The wrapper currently accepts only `--stage` plus `--help` / `-h`. It does not implement `--candidate-id` filtering.

## Reference materials
- The AI prompt templates for Codex, Claude, and Claude Code live at `C:\AI.Ass\AI Prompt Templates.docx`. Treat it as the human staging/reference source and rerun `node scripts/sync-prompt-templates-v1.js` after edits so the script regenerates the markdown mirror with the canonical `### <Template Name>` heading, fenced code-block schema, normalized uppercase-underscore placeholders, and the `> **Last refreshed:** YYYY-MM-DD` metadata line that downstream scripts expect.
- The repo mirror for those prompts lives at `C:\AI.Ass\docs\prompt-templates.md` and is what prompt scripts consume. The wrapper's preflight stage now runs `scripts/check-prompt-template-mirror-v1.js` before any other validators; a guard failure halts preflight and prints `Prompt-template mirror guard failed. Refresh AI Prompt Templates.docx, rerun node scripts/sync-prompt-templates-v1.js, then rerun this wrapper stage.` so operators know to refresh the staging source, regenerate the mirror, and rerun the guard before continuing. See `docs/operator-runbook-and-usage-layer-v1.md` for the remediation steps.
- A compact quick-reference card for guard failures now lives at `docs/prompt-template-guard-quick-reference-v1.md`, summarizing the failure line and commands so operators can act quickly without hunting through longer notes.
- A prompt-template lane index page (`docs/prompt-template-lane-index-v1.md`) now serves as the single entry point for the source, mirror, sync, guard, troubleshooting, quick-reference, runbook, wrapper spec, and aggregate context artifacts.
- **Milestone note:** Treat that index as the stable operator-facing entrypoint for the entire prompt-template lane so new threads can start there when locating the source, mirror, guard, or documentation.

## Steps & Script Mapping
1. **Preflight stage**: run `validate-execution-candidate-anomalies-v1.js`, `validate-all-review-lanes-state-v1.js`, `validate-execution-candidate-coverage-buckets-v1.js`, `validate-execution-candidate-view-coverage-v1.js`, and `validate-unreviewed-execution-state-v1.js`.
2. **Readiness stage**: run `summarize-execution-candidate-coverage-buckets-v1.js`, `summarize-execution-candidate-tooling-manifest-v1.js`, `summarize-execution-candidate-tooling-inventory-v1.js`, `summarize-execution-candidate-tooling-catalog-v1.js`, `summarize-execution-candidate-health-report-v1.js`, `summarize-execution-candidate-health-report-markdown-v1.js`, `summarize-execution-candidate-handoff-brief-v1.js`, `validate-execution-candidate-health-report-v1.js`, `validate-execution-candidate-health-report-markdown-v1.js`, `validate-execution-candidate-handoff-brief-v1.js`, and `validate-execution-candidate-handoff-output-alignment-v1.js`.
3. **Execution prep stage**: run the validator suite summaries (`summarize-execution-candidate-validator-suite-status-v1.js` / Markdown / JSON), the ops status summary (`summarize-execution-candidate-ops-status-v1.js`), and corresponding validators (alignment, ops status, etc.).
4. **Post stage**: re-run `summarize-execution-candidate-health-report-v1.js`, `summarize-execution-candidate-health-report-markdown-v1.js`, `summarize-execution-candidate-handoff-brief-v1.js`, `summarize-execution-candidate-meta-report-v1.js`, `summarize-execution-candidate-meta-report-markdown-v1.js`, their validators, and the alignment validators `validate-execution-candidate-health-report-output-alignment-v1.js` and `validate-execution-candidate-meta-report-output-alignment-v1.js`.

Each stage stops if its scripts flag errors.

## Outputs
- Per-stage logs (console pass/fail statuses).
- The meta report JSON & Markdown, tooling manifest, validator suite summaries, and health brief serve as artifacts for downstream notes or tickets.
- Exit code `0` means all invoked scripts passed; nonzero indicates the first stage failure.

## Result contract & exit semantics
- `0`: stage completed successfully; wrapper logs `Stage "<name>" completed successfully.` and either continues or prints `Operator workflow wrapper completed successfully.` when the run finishes.
- `1`: a stage aborted because one of its scripts failed or an invalid `--stage` was provided; the wrapper logs the failing script and stage so operators can fix the blocker before rerunning.
- Operators rely on these exit codes to determine whether to move ahead, rerun a stage, or stop for troubleshooting without needing additional wrappers.

## Stage summary & final status wording
- Each stage now logs `Stage "<name>" starting...` at the beginning and either `Stage "<name>" completed successfully.` when all scripts pass or `Stage "<name>" stopped at "<script>".` when a script fails.
- When the requested stages finish, the wrapper prints `Summary: stages completed - "stage1", "stage2", ... .` followed by `Operator workflow wrapper completed successfully.` on success.
- On failure from an invalid stage name it prints `Summary: <reason>` plus `Operator workflow wrapper failed.`.
- On failure from a stage script it prints `Summary: stage "<stage>" failed while running "<script>".` plus `Operator workflow wrapper failed.`.

## Out-of-scope
- No new modeling or execution logic: the wrapper runs existing scripts only.
- No workflow branching beyond stage selection and candidate focus.
- No direct Notion/Telegram integration—operators still manage external handoffs manually.

This wrapper spec keeps the operator workflow predictable while letting the documented scripts do the heavy lifting.

## Milestone: operator workflow integration layer
- **Docs produced:** script inventory, canonical flow, preflight checklist, wrapper spec, milestone summary notes, and health/meta docs now describe the layer end-to-end.
- **Wrapper implemented:** `scripts/operator-workflow-wrapper-v1.js` supports `--stage` (`preflight`, `readiness`, `prep`, `post`, `all`) and runs the documented scripts in order, stopping on the first failure while summarizing results.
- **Supported stages:** Each stage maps to the scripts listed in the preflight checklist and canonical flow sections, so operators can focus on coverage, tooling, suite status, and health alignment before moving forward.
- **Validation:** Existing validators (coverage, tooling inventory/manifest/catalog, health reports, suite status outputs, alignment checks, meta reports) already prove the layer is stable—refer to the checklist doc for explicit stop conditions.
- **Operator value:** Operators can now treat this thin wrapper as the canonical entrypoint for in-house handoffs. It ensures every script in the reporting/validation stack runs in sequence, surfaces failures immediately, and produces the documented artifacts without extra orchestration.

## Milestone: wrapper stage-summary and final-status output layer
- **Code:** `scripts/operator-workflow-wrapper-v1.js` now logs `Stage "<name>" starting...`, `Stage "<name>" completed successfully.`, or `Stage "<name>" stopped at "<script>".` per stage and emits a standardized success or failure summary aligned with the documented exit codes.
- **Docs:** The spec now defines the stage-summary wording, final success summary, and failure reason text so the printed output contract is predictable.
- **Operator value:** Operators can read the console output to know exactly where the wrapper is, whether it stopped, and what to do next without needing extra translation.

## Milestone: operator wrapper help/usage polish
- **Code:** `scripts/operator-workflow-wrapper-v1.js` exposes `--help`/`-h` to print the usage line and the stage list sourced directly from the stage map, along with guidance for running a single stage versus the full flow.
- **Docs:** A “Help output” section now documents the built-in usage guidance so operators can discover the invocation shape and supported stages without diving into other docs.
- **Operator value:** Operators can grab the CLI help and immediately see the correct stage names and invocation breakpoints, making the wrapper more discoverable out of the box.

---

## Source: docs/operator-runbook-and-usage-layer-v1.md

# Operator Runbook & Usage Layer v1

This runbook is the canonical operator reference for `scripts/operator-workflow-wrapper-v1.js`.

Treat `docs/operator-workflow-runbook-v1.md` as historical context only. This file is the active operator-facing runbook for the wrapper.

## Milestone note
The wrapper, its supporting docs (inventory, flow, checklist, runbook), and the validated stage scripts together complete the operator workflow integration layer. No additional wrapper polish or new stages are required; the operator UX is already clear and documented, so this subsystem stands as its own milestone.

## Purpose & scope
- Operate the thin wrapper documented in `docs/operator-workflow-wrapper-spec-v1.md`.
- Run the wrapper instead of calling individual scripts directly unless a targeted rerun is required.
- Surface clear outputs, stop points, and verified artifacts without expanding the existing reporting suite.

## Invocation
```
node scripts/operator-workflow-wrapper-v1.js [--stage=<preflight|readiness|prep|post|all>]
```
- Default (`--stage=all`) runs preflight -> readiness -> prep -> post in canonical order.
- Use `--stage=` to rerun specific slices after fixing issues.
- `--help` and `-h` print the built-in usage line, supported stages, example command, and the reminder that omitting `--stage` runs all stages in order.

## Supported stages
1. **Preflight** runs the foundational validators to ensure each candidate and review is well-formed. Next action on failure: fix the reported data before restarting.
2. **Readiness** runs tooling manifest/inventory/catalog scripts plus health summaries and their validators. Next action on failure: restore missing tooling or regenerate consistent health artifacts.
3. **Prep** runs ops/status summaries and the validator suite because preparation must succeed before execution. Next action on failure: inspect the failing validator output and resolve data or suite inconsistencies.
4. **Post** reruns health/meta reports plus alignment validators after an execution. Next action on failure: update or rerun the health reports until the wrapper finishes cleanly.

## Expected outcome
- Each requested stage starts with `Stage "<name>" starting...`.
- A successful stage ends with `Stage "<name>" completed successfully.`.
- When all requested stages pass, the wrapper prints `Summary: stages completed - "stage1", "stage2", ... .` followed by `Operator workflow wrapper completed successfully.`.
- Each stage produces the documented artifacts (coverage buckets, tooling manifests, validator summaries, meta reports) for operator review.

## Handling failures
- If a stage script fails, the wrapper logs `Stage "<name>" stopped at "<script>".`, then prints `Summary: stage "<stage>" failed while running "<script>".` and exits `1`.
- If an invalid stage name is supplied, the wrapper prints `Summary: Unknown stage '<name>'. Valid stages: preflight, readiness, prep, post, all.` followed by `Operator workflow wrapper failed.` and exits `1`.
- Example failures:
  * `validate-execution-candidate-coverage-buckets-v1.js` fails -> coverage mismatch; fix input data.
  * Tooling manifest or inventory validators fail -> restore missing scripts before rerunning.
  * Ops/status validators fail -> investigate validator logs and fix the data before rerunning.
  * Health-report alignment fails -> rerun the health reports to reconcile coverage, tooling, and suite counts.

## Next steps by outcome
- **Pass**: proceed to the next stage or document the run results in handoff notes.
- **Fail**: fix the reported issue and rerun the relevant `--stage`.
- **Early exit**: inspect the script output, resolve the blocker, rerun that stage, then optionally rerun `--stage=all` to continue the workflow.

Operators should treat this runbook as the primary reference for using the wrapper. The milestone docs remain supporting context, not the primary instruction source.

---

## Source: docs/prompt-templates.md

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
