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

## Inputs
- Environment must point to the repo root (scripts expect standard runtime/*.json files).
- The wrapper may accept `--candidate-id` to focus health checks on a single execution candidate when desired (scripts already support filtering via `summarize-approved...` variants).

## Steps & Script Mapping
1. **Preflight stage**: run `validate-execution-candidate-anomalies-v1.js`, `validate-all-review-lanes-state-v1.js`, `validate-execution-candidate-coverage-buckets-v1.js`, `validate-execution-candidate-view-coverage-v1.js`, and `validate-unreviewed-execution-state-v1.js`.
2. **Readiness stage**: run `summarize-execution-candidate-coverage-buckets-v1.js`, tooling manifest/inventory/catalog summaries, `summarize-execution-candidate-health-report-v1.js` (and Markdown/brief versions), and their validators, plus `validate-execution-candidate-handoff-output-alignment-v1.js`.
3. **Execution prep stage**: run the validator suite summaries (`summarize-execution-candidate-validator-suite-status-v1.js` / Markdown / JSON), the ops status summary (`summarize-execution-candidate-ops-status-v1.js`), and corresponding validators (alignment, ops status, etc.).
4. **Post stage**: re-run health/meta reports (`summarize-execution-candidate-health-report-v1.js`, `summarize-execution-candidate-meta-report-v1.js`, their Markdown/brief variants) and validators, then run alignment validators (`validate-execution-candidate-health-report-output-alignment-v1.js`, `validate-execution-candidate-meta-report-output-alignment-v1.js`).

Each stage stops if its scripts flag errors.

## Outputs
- Per-stage logs (console pass/fail statuses).
- The meta report JSON & Markdown, tooling manifest, validator suite summaries, and health brief serve as artifacts for downstream notes or tickets.
- Exit code `0` means all invoked scripts passed; nonzero indicates the first stage failure.

## Result contract & exit semantics
- `0`: stage completed successfully; wrapper logs `Stage "<name>" completed successfully.` and either continues or prints `Operator workflow wrapper completed successfully.` when the run finishes.
- `1`: a stage aborted because one of its scripts failed or an invalid `--stage` was provided; the wrapper logs the failing script and stage so operators can fix the blocker before rerunning.
- Operators rely on these exit codes to determine whether to move ahead, rerun a stage, or stop for troubleshooting without needing additional wrappers.

## Stage summary & final status wording
- Each stage now logs `Stage "<name>" starting...` at the beginning and either `Stage "<name>" completed successfully.` when all scripts pass or `Stage "<name>" stopped at "<script>".` when a script fails.
- When the requested stages finish, the wrapper prints `Summary: stages completed - "stage1", "stage2", ... .` followed by `Operator workflow wrapper completed successfully.` on success.
- On failure (invalid stage name or script failure) it prints `Summary: <reason>` plus `Operator workflow wrapper failed.` so operators can hear the final result contract without parsing the earlier logs.

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
