# executor Handoff Dry Run Contract v1

## Purpose
Defines the structure for a future executor handoff packet while keeping the workflow non-executing in v1.

## Scope
- Applies to prepared payloads in `runtime/executor-payloads.v1.json`.
- Does not invoke executor yet.
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
- `executor_target` should name the intended executor (for example, `executor`).
- Creating a handoff packet is not execution.
- Handoff packets must remain reviewable and deterministic.
- No automatic executor handoff occurs in v1.

## Guardrails
- Do not invoke any executor yet.
- Do not write files beyond the handoff packet store.
- Do not make silent project changes.
- Do not bypass approvals.
- Fail clearly if the payload is missing or invalid before creating a handoff packet.

## Payload preparation helper
`scripts/prepare-executor-handoff-dry-run-v1.js` is the helper that builds the handoff packet from a prepared executor payload:
- It accepts `--payload-id` and fails if the payload cannot be found in `runtime/executor-payloads.v1.json`.
- The payload must expose the string fields `execution_id`, `review_id`, `decision_id`, `task_id`, `recommended_next_step`, and `prepared_at`; missing or empty fields cause the helper to abort.
- Only one handoff packet per `payload_id` is allowed; rerunning the helper for the same payload logs the existing packet count and exits without duplication.
- Successful runs append a packet to `runtime/executor-handoff-packets.v1.json` using the payload metadata plus the generated `handoff_id` and `executor_target = "executor"`.
- The helper prints the payload/execution/decision/handoff IDs and the total packet count so operators can verify the result immediately.
