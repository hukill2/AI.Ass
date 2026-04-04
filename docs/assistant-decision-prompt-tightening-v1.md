# Assistant Decision Prompt Tightening v1

## Purpose
Spell out how the runner (`scripts/run-local-assistant-qwen-v2.js`) tightens the structured decision prompt so the outputs become actionable, deterministic, and aligned with the schema defined in the decision contract.

## Current tightening flow
1. The script reads `runtime/task-context.v1.json`, interpolates it into the prompt, and calls `ollama run qwen2.5-coder:7b`.
2. The prompt explicitly forbids Markdown, invented facts, and extra commentary, and it requires the reply to be valid JSON that follows the established schema.
3. After the model responds, the runner strips any code fences (`cleanJson()`), parses the JSON, and enforces prompt-tightening rules in `enforcePromptTightening()`.
4. Only once the output passes the checks does the runner append a decision to `runtime/assistant-decisions.v1.json`.

## Prompt expectations
- **Use only the supplied task context.** Assume no other information exists.
- **Answer with valid JSON only.** No Markdown, prose, or stray commentary.
- **Limit arrays to a handful of practical items.** The downstream decision store expects concise arrays.
- **If implementation work is suggested, name concrete files.** The allowed directories are `docs/`, `mirror/`, `exports/`, `runtime/`, and `scripts/`. Do not invent stray paths.
- **If the recommendation is analysis-only, make that explicit.** Say “analysis-only,” “gather context,” “review,” or similar so downstream logic knows not to look for file edits.
- **Granular reasoning:** Keep `reasoning` short and tied to the context; it should justify the chosen `recommended_next_step`.
- **Risks must be concrete.** The `risks_or_guardrails` array must contain at least one meaningful object or string that highlights a risk and how the team should stay inside the guardrail.
- **Notes:** Use `notes` for follow-up reminders or references, and keep it brief (the runner is tolerant of up to ~200 characters).

## Enforcement rules
1. `recommended_next_step` must never be blank. Empty responses are rejected before persistence.
2. The helper `isAnalysisOnly()` looks for keywords such as “analysis,” “analysis-only,” “gather context,” “review,” “research,” or “investigate.” If no keyword matches, the runner treats the decision as implementation-focused and enforces the file requirement.
3. Implementation decisions must list at least one allowed project file in `files_to_create_or_update`. The runner rejects paths that do not begin with the approved prefixes or refer to unrelated directories.
4. `risks_or_guardrails` must be a non-empty array. Generic filler (e.g., “be careful”) is insufficient. Prefer the `{ risk, guardrail }` object form when you need to describe a mitigation.
5. `files_to_create_or_update` can stay empty for analysis-only work, but `recommended_next_step` must still describe what analysis is needed.
6. The enforcement step also encourages `notes` and `reasoning` to stay concise, so avoid unnecessarily long text.

## Response observability and recovery
- Each model call writes the sanitized response to `runtime/local-assistant-response.v2.json` and the unprocessed output to `runtime/local-assistant-response.raw.txt` so operators can compare what the model actually returned versus what was used for decision persistence.
- The runner strips Markdown fences, parses the cleaned JSON, and, when parsing fails due to stray control characters (newlines, tabs, carriage returns, etc.) embedded inside string literals, it escapes those characters and retries once while warning operators. This lets the system recover from minor formatting lapses without losing traceability.
- If recovery still fails, the console error references the raw-output file path, giving reviewers the exact text that caused the JSON decoder to choke.

## How this supports actionability
- Distinguishing analysis-only text from implementation steps keeps execution lanes from chasing phantom edits.
- Requiring allowed file paths keeps recommendations grounded in the real tree.
- Demanding a populated `risks_or_guardrails` array ensures every decision is audit-ready.
- The combination of these checks plus the stored schema guarantees that the assistant decision path emits review-ready packets that downstream reviewers or automation can trust.
