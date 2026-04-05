Template: Project intake / planning prompt
Task Summary:
Need to plan a Next.js app for a mobile detailing business with iPhone calendar sync, dark theme with light blue accents, quote/contact form, possible customer dashboard for repeat or large clients, single-page hero, image modal, testimonials, hosted on Vercel with MongoDB.
Constraints / Guardrails:
- Keep outputs concise, direct, and machine-usable.
- Do not bypass Notion review or the local mirror.
- Plan first. Do not implement until the project plan is approved.
Break approved implementation work into bounded tasks small enough for codex-mini to complete safely.
Do not invent secrets, credentials, legal text, or production-only values.
Escalate if missing information changes architecture, integrations, auth, real assets, or production readiness.
All file writes must occur in "E:\Mobiledets". Hosted on Vercel. MongoDB backend. Single-page v1.
Allowed assumptions:
Placeholder images and testimonials are allowed. Placeholder API keys may be used only in env example files until real credentials are provided.
- Created from Telegram project intake.
Open questions:
skip
Definition of v1 done:
- A deployable single-page Next.js app on Vercel with hero section
- gallery modal
- testimonials
- quote/contact form
- dark theme with blue accents
- MongoDB-backed submissions
- and a documented plan for calendar sync and dashboard if not included in v1.
- Created from Telegram project intake.
Open questions:
skip
Definition of v1 done:
- A deployable single-page Next.js app on Vercel with hero section
- gallery modal
- testimonials
- quote/contact form
- dark theme with blue accents
- MongoDB-backed submissions
- and a documented plan for calendar sync and dashboard if not included in v1.
- Cloud planning does not authorize
 direct repo writes.
- Any retry or escalation must explain the exact blocker.
- Plan first. Do not implement until the project plan is approved.
Break approved implementation work into bounded tasks small enough for codex-mini to complete safely.
Do not invent secrets, credentials, legal text, or production-only values.
Escalate if missing information changes architecture, integrations, auth, real assets, or production readiness.
All file writes must occur in "E:\Mobiledets". Hosted on Vercel. MongoDB backend. Single-page v1.
Allowed assumptions:
Placeholder images and testimonials are allowed. Placeholder API keys may be used only in env example files until real credentials are provided.
- Medium. Integrations, data, deployment, or account-sensitive decisions affect scope and require explicit review.
- Preferred stack: next.js
Hosting / infra: vercel
Core features: email server built in, sanitized inputs from forms and submittals to db, place holder modal and testimonies
Machine Task JSON:
{
  "task_id": "mobiledets-intake-20260405072823",
  "title": "Mobiledets - Project Intake",
  "project_id": "OS-V1",
  "route_target": "Architect/GPT",
  "risk": "Medium",
  "summary": "Need to plan a Next.js app for a mobile detailing business with iPhone calendar sync, dark theme with light blue accents, quote/contact form, possible customer dashboard for repeat or large clients, single-page hero, image modal, testimonials, hosted on Vercel with MongoDB.",
  "full_context": "Initial Prompt:\nNeed to plan a Next.js app for a mobile detailing business with iPhone calendar sync, dark theme with light blue accents, quote/contact form, possible customer dashboard for repeat or large clients, single-page hero, image modal, testimonials, hosted on Vercel with MongoDB.\nShort Description
:\nNeed to plan a Next.js app for a mobile detailing business with iPhone calendar sync, dark theme with light blue accents, quote/contact form, possible customer dashboard for repeat or large clients, single-page hero, image modal, testimonials, hosted on Vercel with MongoDB.\nUsers / Audience:\nwebsite for mobile detailer Miguel\nCore Goal:\niPhone calender sync, dark theme with light blue accents, qoute/contact form, possible customer dashboard for repeat/large clients. Single page, hero, image modal, testimonies. Hosted on vercel with Mongodb\nRequired Features:\nemail server built in, sanitized inputs from forms and submittals to db, place holder modal and testimonies\nNice-to-Have Features:\niPhone calender sync, dark theme with light blue accents, qoute/contact form, possible customer dashboard for repeat/large clients. Single page, hero, image modal, testimonies. Hosted on vercel with Mongodb\nPreferred Stack:\nnext.js\nHosting / Infra:\nvercel\nDesign Direction:\nd
ark theme blue highlights\nKnown Constraints:\nAll file writes must occur in \"E:\\Mobiledets\". Hosted on Vercel. MongoDB backend. Single-page v1.\nUnknowns / Questions:\nskip\nDefinition of v1 Done:\nA deployable single-page Next.js app on Vercel with hero section, gallery modal, testimonials, quote/contact form, dark theme with blue accents, MongoDB-backed submissions, and a documented plan for calendar sync and dashboard if not included in v1.",
  "proposed_action": "Produce a project plan for Mobiledets.\nReturn product scope, architecture, phased roadmap, open questions, and a bounded implementation backlog sized for codex-mini.",
  "trigger_reason": "Need to plan a Next.js app for a mobile detailing business with iPhone calendar sync, dark theme with light blue accents, quote/contact form, pos
sible customer dashboard for repeat or large clients, single-page hero, image modal, testimonials, hosted on Vercel with MongoDB.",
  "constraints": [
    "Keep outputs concise, direct, and machine-usable.",
    "Do not bypass Notion review or the local mirror.",
    "Plan first. Do not implement until the project plan is approved.\nBreak approved implementation work into bounded tasks small enough for codex-mini to complete safely.\nDo not invent secrets, credentials, legal text, or production-only values.\nEscalate if missing information changes architecture, integrations, auth, real assets, or production readiness.\nAll file writes must occur in \"E:\\Mobiledets\". Hosted on Vercel. MongoDB backend. Single-page v1.\nAllowed assumptions:\nPlaceholder images and testimonials are allowed. Placeholder API keys may be used only in env example files until real credentials are provided.",
    "Created from Telegram project intake.\n\nOpen questions:\nskip\n\nDefinition of v1 don
e:\n- A deployable single-page Next.js app on Vercel with hero section\n- gallery modal\n- testimonials\n- quote/contact form\n- dark theme with blue accents\n- MongoDB-backed submissions\n- and a documented plan for calendar sync and dashboard if not included in v1.",
    "Created from Telegram project intake.\nOpen questions:\nskip\nDefinition of v1 done:\n- A deployable single-page Next.js app on Vercel with hero section\n- gallery modal\n- testimonials\n- quote/contact form\n- dark theme with blue accents\n- MongoDB-backed submissions\n- and a documented plan for calendar sync and dashboard if not included in v1."
  ],
  "guardrails": [
    "Cloud planning does not authorize direct repo writes.",
    "Any retry or escalation must explain the exact blocker.",
    "Plan first. Do not implement unt
il the project plan is approved.\nBreak approved implementation work into bounded tasks small enough for codex-mini to complete safely.\nDo not invent secrets, credentials, legal text, or production-only values.\nEscalate if missing information changes architecture, integrations, auth, real assets, or production readiness.\nAll file writes must occur in \"E:\\Mobiledets\". Hosted on Vercel. MongoDB backend. Single-page v1.\nAllowed assumptions:\nPlaceholder images and testimonials are allowed. Placeholder API keys may be used only in env example files until real credentials are provided.",
    "Medium. Integrations, data, deployment, or account-sensitive decisions affect scope and require explicit review.",
    "Preferred stack: next.js\nHosting / infra: vercel\nCore features: email server built in, sanitized inputs from forms and submittals to db, place holder modal and testimonies"
  ],
  "revised_instructions": "",
  "affected_components": "Preferred stack: next.js\nHostin
g / infra: vercel\nCore features: email server built in, sanitized inputs from forms and submittals to db, place holder modal and testimonies",
  "operator_notes": "Created from Telegram project intake.\n\nOpen questions:\nskip\n\nDefinition of v1 done:\n- A deployable single-page Next.js app on Vercel with hero section\n- gallery modal\n- testimonials\n- quote/contact form\n- dark theme with blue accents\n- MongoDB-backed submissions\n- and a documented plan for calendar sync and dashboard if not included in v1.",
  "current_prompt_template": "Project intake / planning prompt",
  "workflow_stage": "Prompt Package Assembly",
  "approval_gate": "prompt"
}
Template Body:
Use this when a new project or net-new task has been captured through intake and needs a planning-first response.
Produce a plannin
g package only. Do not implement yet.
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
