Template: Standard execution prompt
Task Summary:
Repo scaffold: Initialize Next.js (App Router, TS) project structure.
Constraints / Guardrails:
- Keep outputs concise, direct, and machine-usable.
- Do not bypass Notion review or the local mirror.
- - Execute only this bounded backlog item.
- Do not broaden scope beyond the approved planning task.
- All file writes must occur in "E:\Mobiledets".
- Do not invent secrets, credentials, legal text, or production-only values.
- Escalate if blocked by calendar method, dashboard scope, missing real assets, or missing deployment credentials.
- Respect the Notion review and local mirror flow before any deploy.
- Generated from approved planning task mobile-detailing-app-intake-20260405081002.
Backlog item 1: Repo scaffold.
- Source plan URL: https://www.notion.so/Mobile-Detailing-App-Project-Intake-3390f0280c2b81dfb162d5f025d83478
Backlog item 1 selected for execution.
- Cloud planning does not authorize direct repo writes.
- Any retry or escalation must explain the exact blocker.
- - Execute only this bounded backlog item.
- Do not broaden scope beyond the approved planning task.
- All file writes must occur in "E:\Mobiledets".
- Do not invent secrets, credentials, legal text, or production-only values.
- Escalate if blocked by calendar method, dashboard scope, missing real assets, or missing deployment credentials.
- Respect the Notion review and local mirror flow before any deploy.
- Medium. Narrow execution task generated from an approved plan.
- E:\Mobiledets\package.json, next.config.js, tsconfig.json, app\layout.tsx, app\page.tsx, app\globals.css, .gitignore, README.md
Machine Task JSON:
{
"task_id": "mobile-detailing-app-exec-01-repo-scaffold",
"title": "Mobile Detailing App - Repo scaffold",
"planning_only": false,
"project_id": "OS-V1",
"route_target": "Architect/GPT",
"risk": "Medium",
"summary": "Repo scaffold: Initialize Next.js (App Router, TS) project structure.",
"full_context": "Source planning task: Mobile Detailing App - Project Intake (mobile-detailing-app-intake-20260405081002)\nApproved project summary:\nNext.js app for a mobile detailing business with quote/contact flow, image gallery, testimonials, iPhone calendar sync, and possible customer dashboard.\nBounded backlog item:\n1) Repo scaffold\nAction: Initialize Next.js (App Router, TS) project structure.\nFiles: E:\\Mobiledets\\package.json, next.config.js, tsconfig.json, app\\layout.tsx, app\\page.tsx, app\\globals.css, .gitignore, README.md\nVerification: npm run build succeeds locally; default page renders.",
"proposed_action": "Implement backlog item 1: Repo scaffold.\nInitialize Next.js (App Router, TS) project structure.\nExpected file footprint: E:\\Mobiledets\\package.json, next.config.js, tsconfig.json, app\\layout.tsx, app\\page.tsx, app\\globals.css, .gitignore, README.md",
"trigger_reason": "Approved planning backlog item 1 from mobile-detailing-app-intake-20260405081002",
"constraints": [
"Keep outputs concise, direct, and machine-usable.",
"Do not bypass Notion review or the local mirror.",
"- Execute only this bounded backlog item.\n- Do not broaden scope beyond the approved planning task.\n- All file writes must occur in \"E:\\Mobiledets\".\n- Do not invent secrets, credentials, legal text, or production-only values.\n- Escalate if blocked by calendar method, dashboard scope, missing real assets, or missing deployment credentials.\n- Respect the Notion review and local mirror flow before any deploy.",
"Generated from approved planning task mobile-detailing-app-intake-20260405081002.\nBacklog item 1: Repo scaffold.",
"Source plan URL: https://www.notion.so/Mobile-Detailing-App-Project-Intake-3390f0280c2b81dfb162d5f025d83478\nBacklog item 1 selected for execution."
],
"guardrails": [
"Cloud planning does not authorize direct repo writes.",
"Any retry or escalation must explain the exact blocker.",
"- Execute only this bounded backlog item.\n- Do not broaden scope beyond the approved planning task.\n- All file writes must occur in \"E:\\Mobiledets\".\n- Do not invent secrets, credentials, legal text, or production-only values.\n- Escalate if blocked by calendar method, dashboard scope, missing real assets, or missing deployment credentials.\n- Respect the Notion review and local mirror flow before any deploy.",
"Medium. Narrow execution task generated from an approved plan.",
"E:\\Mobiledets\\package.json, next.config.js, tsconfig.json, app\\layout.tsx, app\\page.tsx, app\\globals.css, .gitignore, README.md"
],
"revised_instructions": "",
"affected_components": "E:\\Mobiledets\\package.json, next.config.js, tsconfig.json, app\\layout.tsx, app\\page.tsx, app\\globals.css, .gitignore, README.md",
"operator_notes": "Generated from approved planning task mobile-detailing-app-intake-20260405081002.\nBacklog item 1: Repo scaffold.",
"current_prompt_template": "Standard execution prompt",
"workflow_stage": "Prompt Package Assembly",
"approval_gate": "prompt"
}
Template Body:
Use this after alignment when you want executor to actually do the subsystem.
Proceed with the subsystem implementation.
Subsystem:
\- <SUBSYSTEM_NAME>
Your task:
Review the current implementation and docs first.
Make the smallest coherent code/doc changes needed to complete this subsystem.
Keep the implementation aligned to actual current behavior unless a narrow corrective change is required.
Update the canonical doc for the subsystem milestone.
Do not broaden scope.
Ignore unrelated untracked files unless directly required.
Do not declare completion unless substantive changes were actually made.
At the end, report:
\- files changed
\- exact canonical contract/behavior now in place
\- whether the subsystem is complete enough to commit
