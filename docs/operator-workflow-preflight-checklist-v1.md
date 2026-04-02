# Operator Workflow Preflight Checklist v1

This checklist captures the scripts and artifacts operators run before approving an execution candidate or triggering execution, derived from the current inventory and canonical workflow.

## 1. Task shape sanity
- `validate-execution-candidate-anomalies-v1.js`: confirm each candidate has execution_id/task_id and a real review link.
- `validate-unreviewed-execution-state-v1.js`: ensure any unreviewed candidates have usable decision metadata before touching tooling.
- **Stop** if missing IDs or reviews exist; resolve upstream before continuing.

## 2. State health coverage
- `validate-all-review-lanes-state-v1.js`: make sure candidates sit in suitable lanes (approved/pending/rejected).
- `validate-execution-candidate-coverage-buckets-v1.js` and `validate-execution-candidate-view-coverage-v1.js`: verify coverage counts match the total population.
- `summarize-execution-candidate-coverage-buckets-v1.js`: inspect approved/pending/rejected/unreviewed/anomaly buckets.

## 3. Tooling readiness
- `summarize-execution-candidate-tooling-manifest-v1.js` + `validate-execution-candidate-tooling-manifest-v1.js`: confirm the inventory script can list every tooling artifact.
- `summarize-execution-candidate-tooling-inventory-v1.js` + `validate-execution-candidate-tooling-inventory-v1.js`: verify the tooling inventory JSON is present and accurate.
- `summarize-execution-candidate-tooling-catalog-v1.js` + `validate-execution-candidate-tooling-catalog-v1.js`: describe validator roles and ensure none are missing.
- **Stop** if tooling gaps exist; curate or restore the missing scripts before proceeding.

## 4. Suite/status guard
- `summarize-execution-candidate-validator-suite-status-v1.js` / `-markdown-v1.js` / `-json-v1.js`: print validator results.
- Corresponding validators (`validate-execution-candidate-validator-suite-status-markdown-v1.js`, `-json-v1.js`, `validate-execution-candidate-validator-suite-status-output-alignment-v1.js`): confirm the summaries are truthful.
- `summarize-execution-candidate-ops-status-v1.js` + `validate-execution-candidate-ops-status-v1.js`: review overall ops readiness (text/Markdown/JSON).
- **Pause** until the suite reports pass and ops readiness is clean.

## 5. Health alignment checks
- `summarize-execution-candidate-health-report-v1.js`, `-markdown-v1.js`, `-brief-v1.js`: capture coverage, tooling, validator status, and brief readiness.
- Validators (`validate-execution-candidate-health-report-v1.js`, `-markdown-v1.js`, `-handoff-brief-v1.js`, alignment scripts): ensure the health outputs align (JSON vs Markdown vs brief).
- `summarize-execution-candidate-meta-report-v1.js` / `-markdown-v1.js` plus their validators and alignment checks (`validate-execution-candidate-meta-report-output-alignment-v1.js`): bundle all reported state for final sign-off.
- **Review** the meta report; do not authorize execution until coverage, tooling health, and validator alignment all report `pass`.

This checklist reflects the current repo reality; follow it before proceeding to actual execution or follow-up work.
