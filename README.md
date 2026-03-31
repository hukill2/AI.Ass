# AI Assistant Operating System

This repository is a local-first AI assistant system.

- Notion is the human-readable source of truth for architecture, rules, and approvals.
- The local assistant should attempt tasks first before escalating.
- Claude and Codex are escalation targets when the local effort reaches its practical limits.
- Telegram will later serve as the notification channel that points operators back to approved Notion pages.
- This repository is being built in small, validated steps; start here with the layout and add automation later.

## Configuration
- Keep real secrets in a local .env file that is never committed; use .env.example as the template.
- .env.example lists the required keys for the Reviews / Approvals pull.
- Set Sync Status = Ignore on template/example rows so the pull/export pipeline skips them.
- Run `npm run pull:notion` (after configuring NOTION_API_KEY and NOTION_REVIEWS_DATABASE_ID) to pull the Reviews / Approvals database into `mirror/reviews-approvals-source.v1.json`, rebuild the mirror, and run the status check.
- Run `npm run pull:architecture` (after configuring NOTION_API_KEY and NOTION_AI_OS_PAGE_ID) to pull the architecture/reference pages into `mirror/architecture-pages.v1.json`, run the architecture validator, and run the status report.

