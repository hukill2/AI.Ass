# Telegram Project Intake Contract v1

## Purpose
Define the chat-based intake flow that starts from Telegram, gathers a bounded project brief, and files the result into `Reviews / Approvals` so the normal stage-aware approval loop can take over.

## Operator interaction model
- The operator sends a plain-language brief in Telegram to start intake.
- The intake bot asks one follow-up question at a time.
- Supported commands:
  - `/help`
  - `/commands`
  - `/status`
  - `/review`
  - `/edit <field>`
  - `/set <field>: <value>`
  - `/skip`
  - `/done`
  - `/cancel`
- When the required fields are complete, the intake bot creates a new page in `Reviews / Approvals` and returns the Notion link.
- Intake is editable before filing. Earlier answers can be reviewed and changed in the same Telegram chat before `/done`.

## Intake fields
- `Project Name`
- `Short Description`
- `Users / Audience`
- `Core Goal`
- `Required Features`
- `Nice-to-Have Features`
- `Preferred Stack`
- `Hosting / Infra`
- `Design Direction`
- `Known Constraints`
- `Unknowns / Questions`
- `Allowed Assumptions`
- `Escalate To Operator If Missing`
- `Definition of v1 Done`

## Filing contract
- New intake pages are created with:
  - `Status = Draft`
  - `Workflow Stage = Task Intake`
  - `Sync Status = Not Synced`
  - `Route Target = Architect/GPT`
  - `Current Prompt Template = Project intake / planning prompt`
  - `Approval Gate = prompt`
- The mirror and manager then pick up the page and move it into the normal approval workflow.

## Guardrails
- Intake does not authorize implementation.
- Intake must not invent secrets, credentials, legal copy, or production-only values.
- Missing information that changes architecture, integrations, auth, real assets, or production readiness must be surfaced for operator review.
- Intake output must be concise, direct, and machine-usable.
