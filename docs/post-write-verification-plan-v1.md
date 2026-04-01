# Post Write Verification Plan v1

## Purpose
Explain that this file defines how AI.Ass should verify a written artifact immediately after a real write-enabled execution.

## Scope
- Applies to successful real write-enabled executions.
- Verification must stay narrow and file-type specific.
- Verification does not replace execution logging or widen the write scope.
- No Telegram or Notion write-back yet.

## Verification Rule
- A file write is not fully trusted until a dedicated verification step runs.
- Choose verification based on the written file type and intended behavior.
- Keep verification deterministic, reviewable, and minimal.

## Initial v1 Verification Types
- JavaScript syntax or runtime checks (e.g., node --check).
- Validator scripts should run known-valid and known-invalid samples.
- Simple exit-code assertions that match the file’s purpose.
- Confirm the file exists and has expected contents.

## Logging Expectations
- Record that verification was attempted and whether it passed or failed.
- Capture concise verification notes and the command(s) used.
- State whether verification alters the interpretation of the write result.

## Result Handling
- Track write success and verification success separately.
- A successful write may still fail verification; do not hide it.
- Log verification outcomes so they remain attributable.

## Guardrails
- Verification must not introduce broad side effects.
- Keep verification within the narrow v1 write scope.
- Verification commands should be explicit, deterministic, and minimal.
- Operator review remains authoritative.

