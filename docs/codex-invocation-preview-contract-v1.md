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
