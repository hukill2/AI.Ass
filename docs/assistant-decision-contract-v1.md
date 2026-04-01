# Assistant Decision Contract v1

## Purpose
Defines the schema and persistence rules for structured local assistant decisions emitted by the default model.

## Required Fields
- decision_id`n- 	ask_id`n- model`n- ecommended_next_step`n- iles_to_create_or_update`n- easoning`n- isks_or_guardrails`n- 
otes`n- created_at`n
## Output JSON Shape
`json
{
  " decision_id\: \\,
 \task_id\: \\,
 \model\: \\,
 \recommended_next_step\: \\,
 \files_to_create_or_update\: [],
 \reasoning\: \\,
 \risks_or_guardrails\: [],
 \notes\: \\,
 \created_at\: \\
}
` 

## Rules
- Persist only valid structured outputs that exactly match the schema above.
- Do not invent or default missing fields during persistence; leave them empty if the model left them empty.
- Suggested filenames remain recommendations; writing them to storage does not automatically create project files.
- Stored decisions must remain deterministic and reviewable by humans and automation alike.
