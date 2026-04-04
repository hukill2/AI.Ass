Template: Alignment review / planning prompt
Task Summary:
Describe the task in one sentence.
Constraints / Guardrails:
- Keep outputs concise, direct, and machine-usable.
- Do not bypass Notion review or the local mirror.
- List the exact constraints, approval boundaries, and non-negotiable guardrails.
- Use this only when sending the task back with Decision = Modify.
- Add review notes, constraints, or approval comments here.
- Cloud planning does not authorize direct repo writes.
- Any retry or escalation must explain the exact blocker.
- List the exact constraints, approval boundaries, and non-negotiable guardrails.
- Explain why the task is low, medium, or high risk.
- List the files, systems, workflows, or docs likely to be touched.
Machine Task JSON:
{
  "task_id": "Stage-Aware-Approval-Loop-Test_001",
  "title": "Stage-Aware Approval Loop Functional Test_001",
  "project_id": "OS-V1",
  "route_target": "Architect/GPT",
  "risk": "Medium",
  "summary": "Describe the task in one sentence.",
  "full_context": "Capture the background, why this is needed, and any existing system context.",
  "proposed_action": "Describe the intended action or outcome.",
  "trigger_reason": "Stage-Aware Approval Loop Functional Test",
  "constraints": [
    "Keep outputs concise, direct, and machine-usable.",
    "Do not bypass Notion review or the local mirror.",
    "List the exact constraints, approval boundaries, and non-negotiable guardrails.",
    "Use this only when sending the task back with Decision = Modify.",
    "Add review notes, constraints, or approval comments here."
  ],
  "guardrails": [
    "Cloud planning does not authorize direct repo writes.",
    "Any retry or escalation must explain the exact blocker.",
    "List the exact constraints, approval boundaries, and
non-negotiable guardrails.",
    "Explain why the task is low, medium, or high risk.",
    "List the files, systems, workflows, or docs likely to be touched."
  ],
  "revised_instructions": "Use this only when sending the task back with Decision = Modify.",
  "affected_components": "List the files, systems, workflows, or docs likely to be touched.",
  "operator_notes": "Add review notes, constraints, or approval comments here.",
  "current_prompt_template": "Alignment review / planning prompt",
  "workflow_stage": "Prompt Package Assembly",
  "approval_gate": "prompt"
}
Template Body:
Use this before work starts if you want executor to inspect first and propose the smallest change set.
Before making changes, give me a subsystem alignment review for this subsystem:
Subsystem:
\- <SUBSYSTEM_NAME>
Report:
\- current implementation behavior actually present
\- current doc behavior actually present
\- mismatches or ambiguities between docs and implementation
\- smallest coherent change set you recommend
\- expected file footprint
\- whether this still looks narrow and self\-contained
Constraints:
\- do not make changes yet
\- do not broaden scope
\- ignore unrelated untracked files unless directly required
