# Operator Workflow Runbook v1

This runbook ties the existing thin wrapper (`scripts/operator-workflow-wrapper-v1.js`) to day-to-day operator actions. Each stage maps to real scripts and has explicit success/stop conditions plus “what to do next.”

## Entry command
`node scripts/operator-workflow-wrapper-v1.js [--stage=<preflight|readiness|prep|post|all>]`
- Default `--stage=all` runs every phase in canonical order.
- Stage argument limits execution to that slice when operators need targeted reruns.
- The wrapper exits immediately on any script failure and prints which script halted the stage.

## Stage 1 – Preflight checks
### Purpose
Confirm every candidate and its review metadata are structurally sound before tooling or validation runs.
### Scripts
- `validate-execution-candidate-anomalies-v1.js`
- `validate-all-review-lanes-state-v1.js`
- `validate-execution-candidate-coverage-buckets-v1.js`
- `validate-execution-candidate-view-coverage-v1.js`
- `validate-unreviewed-execution-state-v1.js`
### Expected result
All validators log “pass” and the wrapper prints “Stage preflight completed.”
### Stop condition
A failure output (nonzero exit) halts the wrapper; inspect the script logs and resolve anomalies or coverage gaps.
### Next operator action
Fix the reported issue (missing IDs, lane gaps, malformed review) before returning to readiness.

## Stage 2 – Handoff/readiness validation
### Purpose
Validate tooling, health reports, and alignment artifacts before signaling readiness to execute.
### Scripts
- Coverage summaries (`summarize-execution-candidate-coverage-buckets-v1.js`)
- Tooling manifest/inventory/catalog outputs (summaries + validations)
- Health/meta report generators (`summarize-execution-candidate-health-report-*`, `summarize-execution-candidate-meta-report-*`)
- Validators for health reports, meta reports, and output alignment
### Expected result
All scripts complete with “pass” output; wrapper logs “Stage readiness completed.”
### Stop condition
Any tooling gap, health mismatch, or alignment failure halts the wrapper; address missing scripts or misaligned outputs before proceeding.
### Next operator action
Repair tooling (add missing scripts) or rerun health/ meta generation after re-establishing canonical coverage counts.

## Stage 3 – Execution preparation
### Purpose
Run the consolidated operation and validator suite before releasing to execution.
### Scripts
- Ops/status summary & validator (`summarize-execution-candidate-ops-status-v1.js` + validator)
- Validator suite summaries (text/Markdown/JSON) with their validators
- Validator suite alignment (`validate-execution-candidate-validator-suite-status-output-alignment-v1.js`)
### Expected result
Every script reports “pass” and wrapper prints “Stage prep completed.”
### Stop condition
A failing validator indicates a suite instability or inconsistent summary; resolve the failing validator before rerunning.
### Next operator action
Ensure suite failures are handled (fix data, rerun tools) before launching execution preparation.

## Stage 4 – Post-run verification
### Purpose
Validate the updated health/meta reports and alignment after execution.
### Scripts
- Health report generators (JSON, Markdown, brief) plus validators
- Meta report generators (JSON, Markdown) plus validators
- Alignment validators (`validate-execution-candidate-health-report-output-alignment-v1.js`, `validate-execution-candidate-meta-report-output-alignment-v1.js`)
- Output alignment between health briefs and meta reports
### Expected result
All scripts pass and wrapper prints “Stage post completed.”
### Stop condition
Any mismatch halts the wrapper; investigate the misaligned report (coverage, tooling, suite alignment) before concluding the execution run.
### Next operator action
Document the run results, fix the failing report, and rerun this stage until the wrapper succeeds to close the loop.

## Out-of-scope for the wrapper
- No new modeling or executor policy changes; the wrapper only orchestrates existing scripts.
- No automation beyond stage sequencing — operators still pull data/alerts manually.

Use this runbook to guide operator-run commands and decisions when handling execution-candidate lifecycle handoffs.
