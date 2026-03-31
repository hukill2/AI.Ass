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

