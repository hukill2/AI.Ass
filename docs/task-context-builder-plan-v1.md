# Task Context Builder Plan v1

## Purpose
Defines the first deterministic task-context builder for AI.Ass.

## Goal
Assemble a compact local task context packet from the existing mirrored files without building a full assistant runtime yet.

## Read Order
1. mirror/routing-decisions.v1.json
2. mirror/learning-records.v1.json
3. exports/reviews-approvals-mirror.v1.json
4. mirror/architecture-pages.v1.json

## Proposed Output
Create a small JSON packet containing:
-  task_id
-  task_summary
-  relevant_routing_examples
-  relevant_learning_records
-  relevant_review_state
-  relevant_architecture_context
-  notes

## Implementation (v1)
1. scripts/build-task-context-v1.js reads the current runtime/task-input.v1.json record, tokenizes task_summary into a deterministic keyword set (lowercasing and removing non-alphanumeric characters), and reuses that set for every lane.
2. The script walks the documented read order (mirror/routing-decisions.v1.json, mirror/learning-records.v1.json, exports/reviews-approvals-mirror.v1.json, mirror/architecture-pages.v1.json), scores each entry by keyword overlap, and returns the top two matches per lane via pickTop.
3. It writes the proposed packet shape to runtime/task-context.v1.json (task_id, task_summary, the four relevant_* arrays, and notes) so downstream automation can trust the packet matches the documented contract before building prompts.
4. scripts/validate-task-context-v1.js runs afterward to prove the file exposes the required strings and arrays, demonstrating that the mirrored lanes are consumable without any semantic or embedding step.

## Why This Step Comes Next
- It is smaller than building a full runtime.
- It tests whether the mirrored files are usable.
- It prepares clean inputs for local model benchmarking.
- It stays aligned with the assistant read-order contract.

## Guardrails
- Deterministic only.
- No embeddings yet.
- No semantic search yet.
- No long-running daemon.
- No direct model integration yet.
