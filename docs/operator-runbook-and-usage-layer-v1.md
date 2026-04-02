# Operator Runbook & Usage Layer v1

This runbook is the canonical operator reference for the `scripts/operator-workflow-wrapper-v1.js` entrypoint. It explains how to pick stages, run the script, interpret outcomes, and follow the prescribed next steps.

## Milestone note
The wrapper, its supporting docs (inventory, flow, checklist, runbook), and the validated stage scripts together complete the operator workflow integration layer. No additional wrapper polish or new stages are required—the operator UX is already clear and documented, so we treat this subsystem as a standalone milestone.

## Purpose & scope
- Operate the thin wrapper documented in `docs/operator-workflow-wrapper-spec-v1.md`.
- Run the wrapper instead of calling individual scripts directly unless a targeted rerun is required.
- Surface clear outputs, stop points, and verified artifacts without expanding the existing reporting suite.

## Invocation
```
node scripts/operator-workflow-wrapper-v1.js [--stage=<preflight|readiness|prep|post|all>]
```
- Default (`--stage=all`) runs preflight → readiness → prep → post sequences as per the canonical flow.
- Use `--stage=` to rerun specific slices (preflight, readiness, prep, post) after fixing issues.
- The wrapper exits on the first failing script and logs the failing stage/script clearly.

## Supported stages
1. **Preflight** – runs the foundational validators (`validate-*`) to ensure each candidate and review is well-formed. Stops when anomalies or coverage gaps appear. Next action: fix the reported data before restarting.
2. **Readiness** – executes tooling manifest/inventory/catalog scripts plus health/meta summaries and their validators. Stops on tooling gaps or misaligned health outputs. Next action: restore missing tooling or regenerate consistent health artifacts.
3. **Prep** – runs ops/status summaries and the validator suite because preparation must succeed before execution. Stops on any validator failure. Next action: inspect failing validator output and resolve data/suite inconsistencies.
4. **Post** – reruns health/meta reports plus alignment validators after an execution. Stops if any alignment mismatch occurs. Next action: update or rerun the health reports until the wrapper finishes cleanly.

## Expected outcome
- When every stage completes, the wrapper logs “Stage <name> completed.” followed by `Operator workflow wrapper completed successfully.` (or the stage name if execution stops sooner).
- Each stage produces the documented artifacts (coverage buckets, tooling manifests, validator summaries, meta reports) for operator review.

## Handling failures
- Each failing script is logged with its name. The wrapper immediately stops and exits code `1`.
- Example failures:
  * `validate-execution-candidate-coverage-buckets-v1.js` fails → coverage mismatch; fix input data.
  * Any tooling manifest/inventory validator fails → missing scripts; restore them before rerunning.
  * Ops/status validator fails → investigate validator logs; fix the data before rerunning.
  * Health report alignment fails → rerun the health reports to reconcile coverage/tooling counts.

## Next steps by outcome
- **Pass**: proceed to the next stage or document the run results in the handoff notes.
- **Fail**: fix the reported issue (data, tooling, alignment) and rerun the relevant `--stage`.
- **Early exit**: inspect the script output, resolve the blocker, rerun that stage before moving forward, then optionally rerun `--stage=all` to continue the workflow.

Operators should treat this runbook as the primary reference for using the wrapper; the milestone docs remain as historical context but not the primary instruction source.
