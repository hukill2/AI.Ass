# Operator Runbook & Usage Layer v1

This runbook is the canonical operator reference for `scripts/operator-workflow-wrapper-v1.js`.

Treat `docs/operator-workflow-runbook-v1.md` as historical context only. This file is the active operator-facing runbook for the wrapper.

## Milestone note
The wrapper, its supporting docs (inventory, flow, checklist, runbook), and the validated stage scripts together complete the operator workflow integration layer. No additional wrapper polish or new stages are required; the operator UX is already clear and documented, so this subsystem stands as its own milestone.

## Purpose & scope
- Operate the thin wrapper documented in `docs/operator-workflow-wrapper-spec-v1.md`.
- Run the wrapper instead of calling individual scripts directly unless a targeted rerun is required.
- Surface clear outputs, stop points, and verified artifacts without expanding the existing reporting suite.

## Invocation
```
node scripts/operator-workflow-wrapper-v1.js [--stage=<preflight|readiness|prep|post|all>]
```
- Default (`--stage=all`) runs preflight -> readiness -> prep -> post in canonical order.
- Use `--stage=` to rerun specific slices after fixing issues.
- `--help` and `-h` print the built-in usage line, supported stages, example command, and the reminder that omitting `--stage` runs all stages in order.

## Supported stages
1. **Preflight** runs the foundational validators to ensure each candidate and review is well-formed. Next action on failure: fix the reported data before restarting.
2. **Readiness** runs tooling manifest/inventory/catalog scripts plus health summaries and their validators. Next action on failure: restore missing tooling or regenerate consistent health artifacts.
3. **Prep** runs ops/status summaries and the validator suite because preparation must succeed before execution. Next action on failure: inspect the failing validator output and resolve data or suite inconsistencies.
4. **Post** reruns health/meta reports plus alignment validators after an execution. Next action on failure: update or rerun the health reports until the wrapper finishes cleanly.

## Expected outcome
- Each requested stage starts with `Stage "<name>" starting...`.
- A successful stage ends with `Stage "<name>" completed successfully.`.
- When all requested stages pass, the wrapper prints `Summary: stages completed - "stage1", "stage2", ... .` followed by `Operator workflow wrapper completed successfully.`.
- Each stage produces the documented artifacts (coverage buckets, tooling manifests, validator summaries, meta reports) for operator review.

## Handling failures
- If a stage script fails, the wrapper logs `Stage "<name>" stopped at "<script>".`, then prints `Summary: stage "<stage>" failed while running "<script>".` and exits `1`.
- If an invalid stage name is supplied, the wrapper prints `Summary: Unknown stage '<name>'. Valid stages: preflight, readiness, prep, post, all.` followed by `Operator workflow wrapper failed.` and exits `1`.
- Example failures:
  * `validate-execution-candidate-coverage-buckets-v1.js` fails -> coverage mismatch; fix input data.
  * Tooling manifest or inventory validators fail -> restore missing scripts before rerunning.
  * Ops/status validators fail -> investigate validator logs and fix the data before rerunning.
  * Health-report alignment fails -> rerun the health reports to reconcile coverage, tooling, and suite counts.

## Next steps by outcome
- **Pass**: proceed to the next stage or document the run results in handoff notes.
- **Fail**: fix the reported issue and rerun the relevant `--stage`.
- **Early exit**: inspect the script output, resolve the blocker, rerun that stage, then optionally rerun `--stage=all` to continue the workflow.

Operators should treat this runbook as the primary reference for using the wrapper. The milestone docs remain supporting context, not the primary instruction source.

## Prompt-template guard remediation
- Run `node scripts/check-prompt-template-mirror-v1.js` whenever you refresh the prompt mirror or before relying on the guard-protected templates.
- If the guard reports `Template "<name>" contains only placeholder text…`, open `docs/prompt-templates.md`, replace that section with the real template content, or remove the template until real content exists, then rerun the guard.
- Once the guard succeeds, proceed with the wrapper run or prompt-template automation that depends on the mirror.
