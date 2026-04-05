Template: Project intake / planning prompt
Task Summary:
Next.js app for a mobile detailing business with quote/contact flow, image gallery, testimonials, iPhone calendar sync, and possible customer dashboard.
Constraints / Guardrails:
- Keep outputs concise, direct, and machine-usable.
- Do not bypass Notion review or the local mirror.
- Plan first. Do not implement until the project plan is approved.
- Break approved implementation work into bounded tasks small enough for codex-mini to complete safely.
- Do not invent secrets, credentials, legal text, or production-only values.
- Escalate if missing information changes architecture, integrations, auth, real assets, or production readiness.
- All file writes must occur in "E:\Mobiledets".
- Use placeholders only where explicitly allowed.
- Cloud planning does not authorize direct repo writes.
- Any retry or escalation must explain the exact blocker.
Machine Task JSON:
{
  "task_id": "mobile-detailing-app-intake-20260405081002",
  "title": "Mobile Detailing App - Project Intake",
  "planning_only": true,
  "project_id": "OS-V1",
  "route_target": "Architect/GPT",
  "risk": "Medium",
  "summary": "Next.js app for a mobile detailing business with quote/contact flow, image gallery, testimonials, iPhone calendar sync, and possible customer dashboard.",
  "full_context": "Project Name:\nMobile Detailing App\n\nShort Description:\nNext.js app for a mobile detailing business with quote/contact flow, image gallery, testimonials, iPhone calendar sync, and possible customer dashboard.\n\nUsers / Audience:\nMobile detailing customers, repeat clients, and large commercial clients.\n\nCore Goal:\nLaunch a polished single-page mobile detailing site that captures leads, supports quote/contact requests, and lays the groundwork for scheduling and repeat-client account features.\n\nRequired Features:\n- Single-page site\n- Hero section\n- Gallery with image modal\n- Testimonials\n- Quote/contact form\n- Dark theme with light blue accents\n- Hosted on Vercel\n- MongoDB-backed submissions\n\nNice-to-Have Features:\n- Email notifications\n- Sanitized form inputs\n- Placeholder images and testimonials\n- Customer dashboard for repeat or large clients\n- iPhone calendar sync\n\nPreferred Stack:\nNext.js, TypeScript, Tailwind CSS, MongoDB\n\nHosting / Infra:\nVercel, MongoDB Atlas\n\nDesign Direction:\nDark theme with blue highlights, clean premium look, mobile-first.\n\nKnown Constraints:\n- All file writes must occur in \"E:\\Mobiledets\"\n- Do not bypass Notion review or the local mirror\n- Plan first, implementation only after approval\n- Keep implementation tasks small enough for codex-mini to complete safely\n\nUnknowns / Questions:\
n- What calendar sync method should be used for iPhone?\n- Is the customer dashboard required in v1 or only planned?\n- What exact fields should be in the quote/contact form?\n- What real branding assets, testimonials, and gallery images are available?\n\nAllowed Assumptions:\n- Placeholder images are allowed\n- Placeholder testimonials are allowed\n- Placeholder API keys may appear only in env example files\n- Calendar sync and dashboard can be planned but not implemented in v1 unless approved\n\nEscalate To Operator If Missing:\n- Calendar integration method\n- Whether dashboard is in v1\n- Real API keys or MongoDB URI\n- Real branding assets\n- Domain and Vercel project details\n- Whether placeholders are acceptable for first implementation\n\nDefinition of v1 Done:\nA deployable single-page Next.js app on Vercel with hero section, gallery modal, testimonials, quote/contact form, dark theme with blue accents, MongoDB-backed submissions, plus documented plans for calendar sync and dashboard if not included in v1.",
  "proposed_action": "Produce a project plan for Mobile Detailing App.\nReturn product scope, architecture, phased roadmap, open questions, and a bounded implementation backlog sized for codex-mini.",
  "trigger_reason": "Telegram project intake for Mobile Detailing App",
  "constraints": [
    "Keep outputs concise, direct, and machine-usable.",
    "Do not bypass Notion review or the local mirror.",
    "Plan first. Do not implement until the project plan is approved.",
    "Break approved implementation work into bounded tasks small enough for codex-mini to complete safely.",
    "Do not invent secrets, credentials, legal text, or production-only values.",
    "Escalate if missing information changes architecture, integrations, auth, real assets, or prod
uction readiness.",
    "All file writes must occur in \"E:\\Mobiledets\".",
    "Use placeholders only where explicitly allowed."
  ],
  "guardrails": [
    "Cloud planning does not authorize direct repo writes.",
    "Any retry or escalation must explain the exact blocker.",
    "Use the normal Notion -> mirror -> review flow for all approvals.",
    "Treat this as planning-only until implementation tasks are separately approved."
  ],
  "revised_instructions": "",
  "affected_components": "- Frontend: Next.js, TypeScript, Tailwind CSS\n- Hosting / infra: Vercel, MongoDB Atlas\n- v1 feature surface: Single-page site, hero section, gallery with image modal, testimonials, quote/contact form, dark theme with light blue accents, MongoDB-backed submissions\n- Optional or later scope: email notifications, customer dashboard, iPhone calendar sync",
  "operator_notes": "Created from Telegram project intake.",
  "current_prompt_template": "Project intake / planning prompt",
  "workflow_stage": "Prompt Approval",
  "approval_gate": "prompt"
}
Template Body:
Use this when a new project or net-new task has been captured through intake and needs a planning-first response.
Produce a planning package only. Do not implement yet.
Your outputs must cover:
\- product scope
\- architecture / technical approach
\- phased roadmap
\- open questions
\- allowed assumptions actually used
\- escalation points for missing information
\- implementation backlog split into bounded tasks small enough for codex-mini to complete safely
Planning rules:
\- keep the plan direct, specific, and machine-usable
\- do not invent credentials, secrets, legal copy, or production-only values
\- if missing information changes architecture, integrations, auth, real assets, or production readiness, escalate instead of guessing
\- placeholders are only allowed when explicitly permitted by the intake task
\- do not broaden scope beyond the intake brief
Required sections:
\- Scope summary
\- Recommended architecture
\- Key risks and assumptions
\- Open questions for operator review
\- Proposed v1 milestone
\- Implementation backlog
Implementation backlog rules:
\- each task must be independently reviewable
\- each task must be small enough for codex-mini to complete in one bounded pass
\- include expected file footprint and verification notes for each task
