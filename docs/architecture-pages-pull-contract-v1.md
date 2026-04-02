# Architecture Pages Pull Contract v1

## Purpose
This defines the first Notion-to-local pull contract for capturing the architecture pages beneath the AI Assistant Operating System hub into a machine-readable mirror.

## Source Scope
- Source root page: AI Assistant Operating System
- Include direct child pages that describe the architecture, guardrails, routing, approval flow, memory/learning, JSON mirror mapping, contracts, or other system docs tied to AI.Ass
- Do not include the Reviews / Approvals database entries in this lane; they have their own pull pipeline
- Do not pull linked views or unrelated pages unless they are explicitly promoted into scope later

## Initial Included Pages
- Overview
- Roles and Responsibilities
- Guardrails
- Routing Rules
- Approval Flow
- Memory and Learning
- Mirror Schema Draft
- Notification Rules
- JSON Mirror Mapping v1
- JSON Mirror Examples v1
- JSON Export Contract v1
- Notion Pull Contract v1
- Notion Sync Implementation Plan v1
- Notion Integration Setup Checklist
- Routing Decision Contract v1
- Learning Record Contract v1
- Reviews / Approvals Required Fields v1
- Data Lanes Overview v1

## Required Pulled Fields
Every pulled page record should include:
- page ID
- page URL
- title
- parent/root reference
- created_at
- updated_at
- full page content as normalized text or structured sections when possible

## Pull Rules
- Pull these pages read-only; do not attempt to apply edits back to Notion
- Preserve each page's title exactly as it appears in Notion
- Normalize body content consistently (e.g., strip extra whitespace, concat headings and paragraphs). Unknown block types should be ignored rather than crash the pull
- Report missing or deleted pages clearly so operators can reconcile scope gaps
- This lane is solely for architecture/reference documentation; do not pull approval state or database rows here

## Local Output Target
- mirror/architecture-pages.v1.json

## Root pull verification
- Operator entry: 
ode scripts/pull-architecture-pages-v1.js
- Requires NOTION_API_KEY and NOTION_AI_OS_PAGE_ID (loadable from .env).
- Validates the configured root-page identifier and fetches that page from Notion, emitting a JSON payload with oot_page_id, 	itle, and url when successful.
- Missing configuration or fetch failures exit with code 1 so operators can fix the sync before progressing.

## Child metadata schema
- The script's success payload includes a child_pages array where each entry follows the schema { page_id, 	itle, url, status, error?, level, parent_id } so downstream tooling can rely on stable keys and hierarchy metadata.
- Entries use status: 'fetched' when the child API returned a page and status: 'failed' plus error details when a fetch error occurred.
- A child_failures list repeats the failed entries to simplify filtering without scanning stderr logs.

## Snapshot persistence
- Provide an optional --output=PATH (or -o PATH) flag so the same JSON payload can be written to disk in addition to the stdout dump.
- When provided, the file is overwritten with the payload and a confirmation message is logged; write failures exit with code 1 and a descriptive error.

## Recursive traversal
- The script now walks child_page descendants up to depth 2 (root level = 0) and annotates entries with level and parent_id so downstream tooling can reconstruct the hierarchy.
- Traversal remains read-only; failures at any depth appear inside child_pages/child_failures with status: 'failed' and error details.

## Snapshot validation
- Provide `node scripts/validate-architecture-snapshot-v1.js <baseline.json> <comparison.json>` for comparing two previously captured snapshots.
- The validator ensures both files exist, parse as JSON, and contain a `child_pages` array, then compares entries by `page_id` and reports added, removed, and changed entries.
- Each changed entry lists the fields that drifted (`title`, `url`, `status`, `level`, `parent_id`) plus summaries of the snapshot differences; matching snapshots exit 0, diffs exit 2, and validation errors exit 1.

## Non-Goals
- Do not implement push-back to Notion
- Do not add Telegram notifications
- Do not execute approval actions
- Do not pull database rows (those live in the Reviews / Approvals lane)
- Do not add semantic chunking or embeddings yet
