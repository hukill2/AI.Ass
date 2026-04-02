# Operator Workflow Script Inventory v1

This doc catalogs the scripts that operators run when managing the AI.Ass execution-candidate lifecycle. Each entry notes the stage and the operator-facing purpose.

## Preflight checks
- `scripts/validate-execution-candidate-anomalies-v1.js`: Ensures each candidate has basic identity and review linkage before any workflow stages advance.
- `scripts/validate-all-review-lanes-state-v1.js`: Confirms every reviewed candidate is covered by one of the main lanes (approved, pending, rejected).
- `scripts/validate-execution-candidate-coverage-buckets-v1.js`: Verifies the coverage buckets reconcile with the total candidate count.
- `scripts/validate-execution-candidate-view-coverage-v1.js`: Validates the coverage view summary and flags bucket gaps.
- `scripts/validate-execution-candidate-tooling-inventory-v1.js`: Makes sure the tooling inventory JSON exists and is structurally sound before relying on it.

## Handoff/readiness
- `scripts/validate-execution-candidate-tooling-manifest-v1.js`: Confirms the tooling manifest generation script can list every reporting/validation tool.
- `scripts/summarize-execution-candidate-tooling-manifest-v1.js`: Generates the machine-readable manifest operators use to verify tooling presence.
- `scripts/validate-execution-candidate-tooling-catalog-v1.js` & `scripts/summarize-execution-candidate-tooling-catalog-v1.js`: Describe and validate the role-based catalog of validator tools.
- `scripts/summarize-execution-candidate-health-report-v1.js` / `-markdown-v1.js` / `-brief-v1.js`: Produce human- and machine-readable summaries of coverage, tooling health, and validator status for handoff reviews.
- `scripts/validate-execution-candidate-health-report-v1.js` / `-markdown-v1.js` / `-handoff-brief-v1.js`: Validate those reports against live data.
- `scripts/validate-execution-candidate-handoff-output-alignment-v1.js`: Ensures JSON, Markdown, and brief outputs agree.
- `scripts/validate-execution-candidate-health-report-output-alignment-v1.js`: Validates JSON/Markdown health reports align with coverage/tooling/suite state.
- `scripts/summarize-execution-candidate-meta-report-v1.js` & `-markdown-v1.js`: Emit consolidated meta reports; `scripts/validate-execution-candidate-meta-report-v1.js` and `-markdown-v1.js` validate them.
- `scripts/validate-execution-candidate-meta-report-output-alignment-v1.js`: Ensures meta JSON/Markdown alignment.
- `scripts/summarize-execution-candidate-validator-suite-status-v1.js` / `-markdown-v1.js` / `-json-v1.js`: Aggregate validator results; their validators ensure the summaries stay truthful (`validate-...suite-status-markdown-v1.js`, etc.).
- `scripts/validate-execution-candidate-validator-suite-status-output-alignment-v1.js`: Keeps the text, Markdown, and JSON suite outputs in sync.

## Execution preparation
- `scripts/summarize-execution-candidate-coverage-buckets-v1.js`: Gives the operator a quick bucket snapshot before approving execution.
- `scripts/summarize-approved-execution-candidates-v1.js` and variants: show operator-approved, awaiting, pending, rejected, and unreviewed candidates for planning.
- `scripts/summarize-execution-candidate-ops-status-v1.js` & `-validator`: Highlight overall ops readiness.
- `scripts/summarize-execution-candidate-tooling-inventory-v1.js` and catalog outputs: Explain what tooling is available before running any executor.
- `scripts/validate-execution-candidate-validator-suite-status-v1.js` & `-json/v1`: Run every validator to ensure the stack is stable before advancing.

## Post-run verification
- `scripts/validate-execution-candidate-health-report-v1.js` and Markdown/brief variants: Confirm the newly written artifacts match the live state after a run.
- `scripts/validate-execution-candidate-handoff-output-alignment-v1.js`: Validates that the post-run health outputs agree with tooling/coverage.
- `scripts/validate-execution-candidate-validator-suite-status-v1.js` along with alignment validators: Re-run the suite to confirm all validators still pass after an execution change.

Operators can run individual scripts when they need targeted insight or use the suite summaries/meta reports for broader handoff communication. Keep this inventory as the single source for scripted operator visibility in v1.
