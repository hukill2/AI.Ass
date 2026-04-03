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
- The wrapper currently accepts only `--stage` plus `--help` / `-h`. It does not implement `--candidate-id` filtering.

## Reference materials
- The AI prompt templates for Codex, Claude, and Claude Code live at `C:\AI.Ass\AI Prompt Templates.docx`. Refer to that document when gathering standardized wording or context before having the assistant reach out to Codex/Claude. No automation currently consumes it yet; the doc simply centralizes the text for future use.
- The current repo mirror for those prompts lives at `C:\AI.Ass\docs\prompt-templates.md`. Prompt-related scripts read the markdown mirror, while the `.docx` file remains a human reference/staging source.

## Steps & Script Mapping
1. **Preflight stage**: run `check-prompt-template-mirror-v1.js` first to guard the prompt-template mirror, then `validate-execution-candidate-anomalies-v1.js`, `validate-all-review-lanes-state-v1.js`, `validate-execution-candidate-coverage-buckets-v1.js`, `validate-execution-candidate-view-coverage-v1.js`, and `validate-unreviewed-execution-state-v1.js`.
   - Because this guard runs before every other preflight validator, the first stage summary you see on success is `Stage "preflight" completed successfully.` and on failure you see `Stage "preflight" stopped at "scripts/check-prompt-template-mirror-v1.js".` followed by the standard `Summary: stage "preflight" failed while running "scripts/check-prompt-template-mirror-v1.js".` so operators immediately know the failure is prompt-template–specific.
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

## Stage summary & final status wording
- Each stage now logs `Stage "<name>" starting...` at the beginning and either `Stage "<name>" completed successfully.` when all scripts pass or `Stage "<name>" stopped at "<script>".` when a script fails.
- When the requested stages finish, the wrapper prints `Summary: stages completed - "stage1", "stage2", ... .` followed by `Operator workflow wrapper completed successfully.` on success.
- On failure from an invalid stage name it prints `Summary: <reason>` plus `Operator workflow wrapper failed.`.
- On failure from a stage script it prints `Summary: stage "<stage>" failed while running "<script>".` plus `Operator workflow wrapper failed.`.

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
