# Assistant Decision Contract v1

## Purpose
Define the structured decision packet that the local assistant persists once it has consumed the task context. The contract keeps every decision deterministic, reviewable, and actionable for downstream operators or automated executors.

## Canonical persistence
- Decisions live in `runtime/assistant-decisions.v1.json` alongside a `version: "v1"` envelope.
- Each recorded decision must match the schema below exactly; persistence should not invent or omit fields. An empty string/array is acceptable when the model cannot fill a value.
- The `decision_id` must be unique (the runner currently prefixes with `dec-` plus the timestamp) so later systems can track wide-open state.

## Field schema
| Field | Type | Description |
| --- | --- | --- |
| `decision_id` | string | Unique identifier for this decision, typically `dec-<epoch millis>`. |
| `task_id` | string | The `task_id` claimed from the task context (empty string if context omitted one). |
| `model` | string | Exact model name/version that generated the decision (e.g., `qwen2.5-coder:7b`). |
| `recommended_next_step` | string | A concise, deterministic instruction for what should happen next. Never leave this blank. When recommending research or validation, include an explicit phrase such as `analysis-only` or `gather context` so downstream systems know not to treat it as an implementation step. |
| `files_to_create_or_update` | string[] | Implementation recommendations must list at least one path. Entries must live under the known project directories (`docs/`, `mirror/`, `exports/`, `runtime/`, or `scripts/`). Leave empty when no file changes are needed (analysis-only or coordination work). |
| `reasoning` | string | Short justification grounded in the provided context that explains why the next step makes sense. |
| `risks_or_guardrails` | (string | { risk: string, guardrail: string })[] | Array of operational warnings. Each entry should name the risk (can be plain text or an object with `risk`/`guardrail`) and explain how to stay safe. Must be non-empty. |
| `notes` | string | Optional follow-up reminders or relevant context. Keep it brief (a sentence or two). |
| `created_at` | string | ISO 8601 timestamp for when the decision was recorded. |

### Schema rules
- Do not invent new keys or mutate this structure when the decision is persisted; downstream automation relies on the exact names.
- Leave a field blank if the model could not answer it rather than substituting placeholder data.
- When `recommended_next_step` is not analysis-focused, at least one `files_to_create_or_update` entry must exist, and every entry must begin with one of the approved directory prefixes.
- `risks_or_guardrails` entries should cite concrete operational issues (security, integrity, review state, etc.) rather than vague generic language. Prefer the object form when multiple guardrails per risk exist.
- Use `notes` for housekeeping (e.g., reference IDs, follow-up checks) but avoid procedural filler; keep it short.

## Example decision
```json
{
  "decision_id": "dec-1775063730450",
  "task_id": "task-001",
  "model": "qwen2.5-coder:7b",
  "recommended_next_step": "analysis-only – gather context on the approvals reporting requirements",
  "files_to_create_or_update": [],
  "reasoning": "Need to understand the current reporting rules before proposing script updates.",
  "risks_or_guardrails": [
    {
      "risk": "Misreporting",
      "guardrail": "Verify the JSON Export Contract v1 before emitting any new output so the format matches downstream expectations."
    }
  ],
  "notes": "Collect related documentation and sample outputs referenced in lr-002.",
  "created_at": "2026-04-01T17:15:30.450Z"
}
```
