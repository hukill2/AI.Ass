# First Real Write Run Checklist v1

## Candidate Identity
- Execution ID: [insert execution id]
- Target file: [insert allowed target, e.g., scripts/validate-json-lane.js]
- Recommended next step: [from the latest assistant decision]

## Preconditions
- [ ] Approved review exists (approval- or review-required, operator-status approved)
- [ ] Execution candidate is marked execution_prepared
- [ ] Successful qwen-readonly log exists for this execution_id
- [ ] Successful qwen-write-dryrun log exists for this execution_id
- [ ] Exactly one allowed target file (scripts/ or 
untime/) is specified
- [ ] Payload/handoff/preview chain is present and up-to-date

## Operator Confirmation
- [ ] Task is still narrowly scoped and write-safe
- [ ] Target file is acceptable for v1 (script/runtime level)
- [ ] No architecture, routing, approval, or guardrail changes are implied
- [ ] Operator explicitly authorizes this first real write run

## Expected Result
- Only the specified file may be written
- A qwen-write execution log must be created
- Any failure must still be logged with execution_result
- No additional files should change in this run
