# Narrowed Follow-Up Task Contract v1

## Purpose
Defines how to capture a narrower write-safe follow-up task derived from a broad approved candidate without altering the original candidate.

## Required Fields
Each follow-up task record must include:
- `followup_id`
- `source_execution_id`
- `source_review_id`
- `source_decision_id`
- `task_id`
- `narrowed_task_summary`
- `target_files`
- `reason_for_narrowing`
- `operator_notes`
- `created_at`

## Output JSON Shape
```
{
  "followup_id": "",
  "source_execution_id": "",
  "source_review_id": "",
  "source_decision_id": "",
  "task_id": "",
  "narrowed_task_summary": "",
  "target_files": [],
  "reason_for_narrowing": "",
  "operator_notes": "",
  "created_at": ""
}
```

## Rules
- Follow-up tasks must be narrower than the source candidate.
- `target_files` must be concrete existing paths.
- Follow-up tasks do not modify the original candidate or authorize execution.
- Follow-up tasks are advisory, guiding future write-enabled work.
