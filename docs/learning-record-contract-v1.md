# Purpose
This file defines what the system should remember after a task or escalation completes so future routing, execution, and mirror logic can learn from concrete outcomes.

# What Should Be Recorded
- Task ID  
- Title  
- Task type  
- Risk  
- Route used  
- Whether the task was attempted locally first  
- Whether approval was required  
- Approval outcome  
- Final outcome  
- Whether the result was accepted, revised, or rejected  
- Summary of what worked  
- Summary of what failed  
- Lesson learned  
- Follow-up recommendation

# What Counts as a Good Learning Record
Records should be concise, factual, reviewable, grounded in actual outcomes, and useful for shaping future routing or execution decisions.

# What Should Not Be Stored
Avoid vague praise, invented success claims, hidden failures, bloated summaries, or repeated narration when a short lesson will do.

# Per-Route Notes
- Local: note whether the assistant handled it correctly without escalation.  
- Claude: note whether the reasoning or planning proved useful.  
- executor: note whether the implementation result was correct and usable.

# Output JSON Shape
```
{
  "record_id": "",
  "task_id": "",
  "title": "",
  "task_type": "",
  "risk": "",
  "route_used": "",
  "attempted_locally_first": false,
  "required_approval": false,
  "approval_outcome": "",
  "final_outcome": "",
  "result_quality": "",
  "worked": "",
  "failed": "",
  "lesson_learned": "",
  "follow_up_recommendation": "",
  "created_at": ""
}
```

# Rules
- Only store records after meaningful task completion or failure.  
- Records must reflect actual outcomes.  
- `lesson_learned` should be short and actionable.  
- `follow_up_recommendation` should suggest what to do next time.  
- Records should stay easy to mirror into JSON later.

## First capture workflow
- Entry point: `node scripts/capture-learning-record-v1.js [--execution-id=ID]` reads the latest execution candidate and its final execution log.  
- Source artifacts: `runtime/execution-candidates.v1.json` plus the matching entry inside `runtime/execution-logs.v1.json`.  
- Runtime store: `runtime/learning-records.v1.json` (the script creates it when absent, keeps `version: "v1"`, and appends each record only once).  
- Mirror refresh: the same workflow copies that runtime file into `mirror/learning-records.v1.json` so downstream automation always sees the latest captured values while the export/validation scripts point at the mirror lane.  
- Intended cadence: run the script after execution log entries materialize so the newest candidate outcome is captured; pass `--execution-id` when backfilling a specific run.  
- This first path focuses on implementation-heavy outcomes; future expansions can add different sources or classification logic while leaving this store and schema untouched.
