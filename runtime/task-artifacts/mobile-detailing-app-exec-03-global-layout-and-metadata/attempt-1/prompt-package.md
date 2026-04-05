Template: Standard execution prompt

Task Summary:
Global layout and metadata: Define site metadata, font, header/footer shells.

Constraints / Guardrails:
- Keep outputs concise, direct, and machine-usable.
- Do not bypass Notion review or the local mirror.
- - Execute only this bounded backlog item.
- Do not broaden scope beyond the approved planning task.
- All file writes must occur in "E:\Mobiledets".
- Local file writes inside the approved path are allowed only for this approved task.
- Do not run git init, git add, git commit, git push, create branches, or open PRs unless the task explicitly authorizes version-control actions.
- Do not invent secrets, credentials, legal text, or production-only values.
- Escalate if blocked by calendar method, dashboard scope, missing real assets, or missing deployment credentials.
- Respect the Notion review and local mirror flow before any deploy.
- Generated from approved planning task mobile-detailing-app-intake-20260405081002.
Backlog item 3: Global layout and metadata.
- Source plan URL: https://www.notion.so/Mobile-Detailing-App-Project-Intake-3390f0280c2b81dfb162d5f025d83478
Backlog item 3 selected for execution.
- Cloud planning does not authorize direct repo writes.
- Any retry or escalation must explain the exact blocker.
- - Execute only this bounded backlog item.
- Do not broaden scope beyond the approved planning task.
- All file writes must occur in "E:\Mobiledets".
- Local file writes inside the approved path are allowed only for this approved task.
- Do not run git init, git add, git commit, git push, create branches, or open PRs unless the task explicitly authorizes version-control actions.
- Do not invent secrets, credentials, legal text, or production-only values.
- Escalate if blocked by calendar method, dashboard scope, missing real assets, or missing deployment credentials.
- Respect the Notion review and local mirror flow before any deploy.
- Low. Narrow execution task generated from an approved plan.
- app\layout.tsx, app\(components)\Header.tsx, app\(components)\Footer.tsx

Machine Task JSON:
{
  "task_id": "mobile-detailing-app-exec-03-global-layout-and-metadata",
  "title": "Mobile Detailing App - Global layout and metadata",
  "planning_only": false,
  "project_id": "OS-V1",
  "route_target": "Architect/GPT",
  "risk": "Low",
  "summary": "Global layout and metadata: Define site metadata, font, header/footer shells.",
  "full_context": "Source planning task: Mobile Detailing App - Project Intake (mobile-detailing-app-intake-20260405081002)\nApproved project summary:\nNext.js app for a mobile detailing business with quote/contact flow, image gallery, testimonials, iPhone calendar sync, and possible customer dashboard.\nBounded backlog item:\n3) Global layout and metadata\nAction: Define site metadata, font, header/footer shells.\nFiles: app\\layout.tsx, app\\(components)\\Header.tsx, app\\(components)\\Footer.tsx\nVerification: Title/description present; header/footer render on all pages.",
  "proposed_action": "Implement backlog item 3: Global layout and metadata.\nDefine site metadata, font, header/footer shells.\nExpected file footprint: app\\layout.tsx, app\\(components)\\Header.tsx, app\\(components)\\Footer.tsx",
  "trigger_reason": "Approved planning backlog item 3 from mobile-detailing-app-intake-20260405081002",
  "constraints": [
    "Keep outputs concise, direct, and machine-usable.",
    "Do not bypass Notion review or the local mirror.",
    "- Execute only this bounded backlog item.\n- Do not broaden scope beyond the approved planning task.\n- All file writes must occur in \"E:\\Mobiledets\".\n- Do not invent secrets, credentials, legal text, or production-only values.\n- Escalate if blocked by calendar method, dashboard scope, missing real assets, or missing deployment credentials.\n- Respect the Notion review and local mirror flow before any deploy.",
    "Generated from approved planning task mobile-detailing-app-intake-20260405081002.\nBacklog item 3: Global layout and metadata.",
    "Source plan URL: https://www.notion.so/Mobile-Detailing-App-Project-Intake-3390f0280c2b81dfb162d5f025d83478\nBacklog item 3 selected for execution."
  ],
  "guardrails": [
    "Cloud planning does not authorize direct repo writes.",
    "Any retry or escalation must explain the exact blocker.",
    "- Execute only this bounded backlog item.\n- Do not broaden scope beyond the approved planning task.\n- All file writes must occur in \"E:\\Mobiledets\".\n- Do not invent secrets, credentials, legal text, or production-only values.\n- Escalate if blocked by calendar method, dashboard scope, missing real assets, or missing deployment credentials.\n- Respect the Notion review and local mirror flow before any deploy.",
    "Low. Narrow execution task generated from an approved plan.",
    "app\\layout.tsx, app\\(components)\\Header.tsx, app\\(components)\\Footer.tsx"
  ],
  "revised_instructions": "",
  "affected_components": "app\\layout.tsx, app\\(components)\\Header.tsx, app\\(components)\\Footer.tsx",
  "operator_notes": "Generated from approved planning task mobile-detailing-app-intake-20260405081002.\nBacklog item 3: Global layout and metadata.",
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
1. Review the current implementation and docs first.
2. Make the smallest coherent code/doc changes needed to complete this subsystem.
3. Keep the implementation aligned to actual current behavior unless a narrow corrective change is required.
4. Update the canonical doc for the subsystem milestone.
5. Do not broaden scope.
6. Ignore unrelated untracked files unless directly required.
7. Do not run git init, git add, git commit, git push, create branches, or open PRs unless the approved task explicitly authorizes version-control actions.
8. Do not declare completion unless substantive changes were actually made.

At the end, report:
\- files changed
\- exact canonical contract/behavior now in place
\- whether the subsystem is complete enough to review
