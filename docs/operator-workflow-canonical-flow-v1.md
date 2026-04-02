# Operator Workflow Canonical Flow v1

This doc describes the operator’s go-to workflow for keeping execution candidates healthy, based on the existing script inventory.

1. **Preflight & sanity**
   - `validate-all-review-lanes-state-v1.js`
   - `validate-execution-candidate-coverage-buckets-v1.js`
   - `validate-execution-candidate-view-coverage-v1.js`
   - `validate-execution-candidate-anomalies-v1.js`
   - `validate-unreviewed-execution-state-v1.js`
   > Stop if any validator reports missing IDs, lane gaps, or malformed metadata before touching handoff tooling.

2. **Handoff readiness**
   - `summarize-execution-candidate-coverage-buckets-v1.js`
   - `summarize-approved/executing/pending/rejected/unreviewed` scripts
   - `summarize-execution-candidate-tooling-manifest-v1.js`
   - `summarize-execution-candidate-tooling-inventory-v1.js`
   - `summarize-execution-candidate-tooling-catalog-v1.js`
   - `summarize-execution-candidate-health-report-v1.js` + `-markdown-v1.js` + `-brief-v1.js`
   - `validate-execution-candidate-health-report-v1.js` & related Markdown/brief validators
   - `validate-execution-candidate-handoff-output-alignment-v1.js`
   > Pause and resolve tool gaps or mismatches before signaling readiness for execution prep.

3. **Execution preparation**
   - `summarize-execution-candidate-ops-status-v1.js`
   - `validate-execution-candidate-ops-status-v1.js`
   - `summarize-execution-candidate-validator-suite-status-v1.js` / `-markdown-v1.js` / `-json-v1.js`
   - `validate-execution-candidate-validator-suite-status-markdown-v1.js`
   - `validate-execution-candidate-validator-suite-status-json-v1.js`
   - `validate-execution-candidate-validator-suite-status-output-alignment-v1.js`
   > Review suite pass/fail and stop if any validator fails before launching a run.

4. **Post-run verification**
   - `summarize-execution-candidate-health-report-v1.js` / `-markdown-v1.js` + `validate-execution-candidate-health-report-v1.js`
   - `summarize-execution-candidate-handoff-brief-v1.js` + `validate-execution-candidate-handoff-brief-v1.js`
   - `summarize-execution-candidate-meta-report-v1.js` / `-markdown-v1.js` + their validators
   - `validate-execution-candidate-handoff-output-alignment-v1.js`
   - `validate-execution-candidate-health-report-markdown-v1.js`
   - `validate-execution-candidate-health-report-output-alignment-v1.js`
   - `validate-execution-candidate-meta-report-output-alignment-v1.js`
   > Treat this as the post-write gating; do not mark completion until the meta outputs align and all coverage/tooling validators pass.
