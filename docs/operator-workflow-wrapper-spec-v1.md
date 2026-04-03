# Operator Workflow Wrapper Specification v1

This spec defines a minimal “operator workflow wrapper” that coordinates the existing scripts in the reporting/validation/meta stack. Its job is to give operators one consistent entrypoint for the preflight → readiness → execution-prep → post-verification flow described elsewhere.

## Purpose
- Provide a single command that runs the documented preflight checklist, tooling readiness checks, validator suite, meta health reports, and alignment validations.
- Surface clear pass/fail outcomes, stop conditions, and resulting artifacts without re-implementing the core scripts.
- Keep scope thin: the wrapper orchestrates, not replaces, the scripts already documented in `operator-workflow-script-inventory-v1.md`, `operator-workflow-canonical-flow-v1.md`, and `operator-workflow-preflight-checklist-v1.md`.

## Invocation
`node scripts/operator-workflow-wrapper-v1.js [--stage=<stage>]`

- `--stage` (optional): `preflight`, `readiness`, `prep`, `post`, or `all` (default). Each stage runs the scripts tied to that phase, in the canonical order.
- Without `--stage`, the wrapper runs the whole flow: preflight → readiness → execution prep → post-run verification.

## Help output
- Run `node scripts/operator-workflow-wrapper-v1.js --help` (or `-h`) to print the supported stages, usage line, and a reminder that omitting `--stage` runs all stages sequentially.
- The help text mirrors the documented stage names so operators can discover them without diving into the spec.

## Inputs
- Environment must point to the repo root (scripts expect standard runtime/*.json files).
- The wrapper currently accepts `--stage`, an optional `--execution-id=<id>` (used by select scripts described below), plus `--help` / `-h`.
  * When `--execution-id` is provided, the preflight stage runs the local write readiness checker before the standard preflight validators so operators catch missing write-lane artifacts early.
  * When the flag is absent, the wrapper inspects `runtime/execution-candidates.v1.json` to see if exactly one candidate is `awaiting_execution` or `execution_prepared`. If such a single eligible candidate exists, the wrapper auto-selects that execution ID and runs the readiness checker; otherwise it logs `Skipping local write readiness check: ...` (zero or multiple eligible candidates) and proceeds with the remaining validators without failing. Operators can rerun `node scripts/list-write-ready-candidates-v1.js` to view the current eligible set and use `node scripts/validate-execution-candidates-schema-v1.js` after manually updating the ledger to ensure the expected fields/statuses exist before relying on auto-selection.

## Reference materials
- The AI prompt templates for Codex, Claude, and Claude Code live at `C:\AI.Ass\AI Prompt Templates.docx`. Refer to that document when gathering standardized wording or context before having the assistant reach out to Codex/Claude. No automation currently consumes it yet; the doc simply centralizes the text for future use.
- The current repo mirror for those prompts lives at `C:\AI.Ass\docs\prompt-templates.md`. Prompt-related scripts read the markdown mirror, while the `.docx` file remains a human reference/staging source.

## Steps & Script Mapping
1. **Preflight stage**: before touching the prompt-template guard, run `validate-execution-candidates-schema-v1.js` so the wrapper ensures the candidate ledger exposes the required IDs, statuses, and context the auto-selection logic just relies on, then run `validate-execution-candidates-uniqueness-v1.js` so duplicate IDs cannot produce non-deterministic selection, `validate-eligible-candidate-logs-v1.js` to confirm the candidate has a successful `qwen-readonly` log, `validate-eligible-candidate-payloads-v1.js` to verify that same candidate already links to an executor payload with a non-empty `payload_id`, `validate-eligible-candidate-handoff-preview-v1.js` to ensure those referenced handoff/preview artifacts exist, `validate-eligible-candidate-review-v1.js` to confirm the candidate links to an existing decision review, `validate-eligible-candidate-review-link-v1.js` to ensure the linked review has operator_status="approved" before readiness continues, `validate-eligible-candidate-review-status-v1.js` to block candidates whose linked review reports an explicit rejecting status (e.g., `rejected`, `denied`), `validate-eligible-candidate-task-context-v1.js` to ensure the candidate's `task_id` points to a recorded task context (otherwise the guard stops the stage before the decision checks), `validate-eligible-candidate-decision-linkage-v1.js` to ensure that `decision_id` matches the linked review, `validate-eligible-candidate-decision-exists-v1.js` to confirm that referenced decision record is present, `validate-eligible-candidate-decision-files-v1.js` to verify that the same decision exposes a non-empty `files_to_create_or_update`, and `validate-eligible-candidate-no-prior-write-v1.js` to stop when a prior successful `qwen-write` already exists. Next, if `--execution-id=<id>` was provided, run `validate-local-write-readiness-v1.js --execution-id=<id>` to confirm the write-lane prerequisites for that execution. After that, run `check-prompt-template-mirror-v1.js`, followed by `validate-execution-candidate-anomalies-v1.js`, `validate-all-review-lanes-state-v1.js`, `validate-execution-candidate-coverage-buckets-v1.js`, `validate-execution-candidate-view-coverage-v1.js`, and `validate-unreviewed-execution-state-v1.js`. When the flag is omitted, the wrapper auto-selects a single awaiting/prepared execution candidate (if one exists) for the readiness check; if zero or multiple eligible candidates are present it logs the skip reason and proceeds with the same script order.
   - Because this guard runs before every other preflight validator, the first stage summary you see on success is `Stage "preflight" completed successfully.` and on failure you see `Stage "preflight" stopped at "scripts/check-prompt-template-mirror-v1.js".` followed by the standard `Summary: stage "preflight" failed while running "scripts/check-prompt-template-mirror-v1.js".` so operators immediately know the failure is prompt-template–specific.
   - The new `validate-eligible-candidate-review-classification-v1.js` guard runs immediately after the review-status check so auto-selection only proceeds when the linked review classification is actionable (e.g., `review-required` or `approval-required`) while explicitly blocking informational classifications.
   - Immediately following that, `validate-eligible-candidate-review-status-non-pending-v1.js` stops the auto-selection path if the linked review’s `operator_status` remains `pending`, while letting `reviewed` and `approved` continue.
2. **Readiness stage**: run `summarize-execution-candidate-coverage-buckets-v1.js`, `summarize-execution-candidate-tooling-manifest-v1.js`, `summarize-execution-candidate-tooling-inventory-v1.js`, `summarize-execution-candidate-tooling-catalog-v1.js`, `summarize-execution-candidate-health-report-v1.js`, `summarize-execution-candidate-health-report-markdown-v1.js`, `summarize-execution-candidate-handoff-brief-v1.js`, `validate-execution-candidate-health-report-v1.js`, `validate-execution-candidate-health-report-markdown-v1.js`, `validate-execution-candidate-handoff-brief-v1.js`, and `validate-execution-candidate-handoff-output-alignment-v1.js`.
3. **Execution prep stage**: run the validator suite summaries (`summarize-execution-candidate-validator-suite-status-v1.js` / Markdown / JSON), the ops status summary (`summarize-execution-candidate-ops-status-v1.js`), and corresponding validators (alignment, ops status, etc.).
4. **Post stage**: re-run `summarize-execution-candidate-health-report-v1.js`, `summarize-execution-candidate-health-report-markdown-v1.js`, `summarize-execution-candidate-handoff-brief-v1.js`, `summarize-execution-candidate-meta-report-v1.js`, `summarize-execution-candidate-meta-report-markdown-v1.js`, their validators, and the alignment validators `validate-execution-candidate-health-report-output-alignment-v1.js` and `validate-execution-candidate-meta-report-output-alignment-v1.js`.

Each stage stops if its scripts flag errors.

## Outputs
- Per-stage logs (console pass/fail statuses).
- The meta report JSON & Markdown, tooling manifest, validator suite summaries, and health brief serve as artifacts for downstream notes or tickets.
- Exit code `0` means all invoked scripts passed; nonzero indicates the first stage failure.

## Result contract & exit semantics
- `0`: stage completed successfully; wrapper logs `Stage "<name>" completed successfully.` and either continues or prints `Operator workflow wrapper completed successfully.` when the run finishes.
- `1`: a stage aborted because one of its scripts failed or an invalid `--stage` was provided; the wrapper logs the failing script and stage so operators can fix the blocker before rerunning.
- Operators rely on these exit codes to determine whether to move ahead, rerun a stage, or stop for troubleshooting without needing additional wrappers.
- After a successful readonly/preflight run (`execution_result=success`), treat `docs/local-readonly-executor-status-v1.md` as the canonical snapshot of that executor’s readiness state; once write-mode execution is enabled, the analogous `docs/local-write-executor-contract-v1.md` provides the required inputs/results/guardrails before the wrapper resumes higher stages.
- That readonly success snapshot does not authorize write execution on its own; always consult `docs/local-write-executor-contract-v1.md` to validate the write-mode preconditions, inputs, and guardrails before attempting the next stage that touches the repo.

## Stage summary & final status wording
- Each stage now logs `Stage "<name>" starting...` at the beginning and either `Stage "<name>" completed successfully.` when all scripts pass or `Stage "<name>" stopped at "<script>".` when a script fails.
- When the requested stages finish, the wrapper prints `Summary: stages completed - "stage1", "stage2", ... .` followed by `Operator workflow wrapper completed successfully.` on success.
- On failure from an invalid stage name it prints `Summary: <reason>` plus `Operator workflow wrapper failed.`.
- On failure from a stage script it prints `Summary: stage "<stage>" failed while running "<script>".` plus `Operator workflow wrapper failed.`.
- When a guard failure occurs during prompt-template preflight, the wrapper now appends the guard’s structured detail (`reason`, `template`, `guard_status`, etc.) parsed from `scripts/check-prompt-template-mirror-v1.js`’s JSON line to the summary sentence (`Summary: stage ... failed while running ... (reason=..., template=...).`). This keeps the stage contract intact while surfacing the guard detail without needing to open the script logs.
- Guard detail now also persists to `logs/prompt-template-guard.json` whenever available. That file records the last emitter-level JSON payload so downstream telemetry or reporting tools can consume it even after the wrapper process exits.
- Run `node scripts/report-prompt-template-guard-v1.js` to read that persisted guard artifact anytime; it prints `Stored guard detail: …` summarizing status/reason/template/timestamp so you can document or alert on the failure without opening the raw wrapper logs.
- Each failure now also appends the guard JSON to `logs/prompt-template-guard-history.jsonl` with an ISO timestamp (`recordedAt`). Tail this history file or load it in automation to review recent guard failures without rerunning the wrapper.
- Summarize that history quickly with `node scripts/summarize-prompt-template-guard-history-v1.js`; it reports total entries, counts by status and reason, optional template counts, and the latest recorded timestamp so you can spot recurring guard issues at a glance.
- Export the same history to CSV via `node scripts/export-prompt-template-guard-history-v1.js`; it writes `logs/prompt-template-guard-history.csv` with columns `recordedAt,status,reason,template,guard` for downstream spreadsheet or analytics ingestion.
- When `scripts/check-prompt-template-mirror-v1.js` runs, it still prints the friendly metadata/failure line, but it now also emits a JSON payload (`{"guard":"check-prompt-template-mirror-v1",...}`) with `status`, timestamp, or failing template info. Operators and tooling can parse that structured line immediately after the human message to capture the guard detail (e.g., `reason`, `template`, `lastRefreshed`) for reporting or alerting alongside the standard summary.

## Out-of-scope
- No new modeling or execution logic: the wrapper runs existing scripts only.
- No workflow branching beyond stage selection and candidate focus.
- No direct Notion/Telegram integration—operators still manage external handoffs manually.

This wrapper spec keeps the operator workflow predictable while letting the documented scripts do the heavy lifting.

## Milestone: operator workflow integration layer
- **Docs produced:** script inventory, canonical flow, preflight checklist, wrapper spec, milestone summary notes, and health/meta docs now describe the layer end-to-end.
- **Wrapper implemented:** `scripts/operator-workflow-wrapper-v1.js` supports `--stage` (`preflight`, `readiness`, `prep`, `post`, `all`) and runs the documented scripts in order, stopping on the first failure while summarizing results.
- **Supported stages:** Each stage maps to the scripts listed in the preflight checklist and canonical flow sections, so operators can focus on coverage, tooling, suite status, and health alignment before moving forward.
- **Validation:** Existing validators (coverage, tooling inventory/manifest/catalog, health reports, suite status outputs, alignment checks, meta reports) already prove the layer is stable—refer to the checklist doc for explicit stop conditions.
- **Operator value:** Operators can now treat this thin wrapper as the canonical entrypoint for in-house handoffs. It ensures every script in the reporting/validation stack runs in sequence, surfaces failures immediately, and produces the documented artifacts without extra orchestration.

## Milestone: wrapper stage-summary and final-status output layer
- **Code:** `scripts/operator-workflow-wrapper-v1.js` now logs `Stage "<name>" starting...`, `Stage "<name>" completed successfully.`, or `Stage "<name>" stopped at "<script>".` per stage and emits a standardized success or failure summary aligned with the documented exit codes.
- **Docs:** The spec now defines the stage-summary wording, final success summary, and failure reason text so the printed output contract is predictable.
- **Operator value:** Operators can read the console output to know exactly where the wrapper is, whether it stopped, and what to do next without needing extra translation.

## Milestone: operator wrapper help/usage polish
- **Code:** `scripts/operator-workflow-wrapper-v1.js` exposes `--help`/`-h` to print the usage line and the stage list sourced directly from the stage map, along with guidance for running a single stage versus the full flow.
- **Docs:** A “Help output” section now documents the built-in usage guidance so operators can discover the invocation shape and supported stages without diving into other docs.
- **Operator value:** Operators can grab the CLI help and immediately see the correct stage names and invocation breakpoints, making the wrapper more discoverable out of the box.