# AI Assistant OS v1.1 - Constitutional Handoff

**Project ID:** OS-V1  
**Status:** Operational / Infrastructure Phase  
**Last Updated:** 2026-04-03

## 1. The Powerhouse Hierarchy

- **The Librarian (Gemini 1.5 Pro):** Master of Context. Owns the 2M-token
  repository memory. Performs compliance audits and "Alphabet Soup" checks.
- **The Architect (Claude/GPT):** Strategy & Logic. Designs new subsystems and
  complex refactors. Outputs .PLAN files, not direct repo writes.
- **The Apprentice (Local Qwen-Coder):** Labor & Execution. Lives in the
  terminal via Ollama. Executes .PLAN files and performs local verification
  (linting/tests).

## 2. Mandatory Naming & Directory Standards

- **Executor Pattern:** All active scripts must use the `executor-` prefix.
- **Legacy Status:** The term "Codex" is deprecated. Any `codex-` references are
  legacy artifacts and must be ignored or refactored.
- **Project Silos:** Context must be partitioned by `project_id`.
  - `OS-V1`: Core infrastructure, automation, and sync logic.
  - `RAIL-V1`: (Planned) Rail signaling and regulatory data.
  - `CRAWL-V1`: (Planned) Web data extraction.

## 3. The Apprentice Learning Loop

Every execution task must follow this three-step ledger entry:

1. **Hypothesis:** Qwen states its intended fix before seeing the Architect's
   plan.
2. **Directive:** The Architect (Claude/GPT) provides the corrected logic and
   "Architectural Principle."
3. **Lesson:** Qwen logs the delta between its hypothesis and the directive in
   `learning/apprentice-journal-v1.jsonl`.

## 4. The Mirror System

- **Source of Truth:** Notion (via Webhooks).
- **Local Proxy:** `C:\ai.ass\mirror\tasks.json`.
- **Constraint:** Do not refactor the mirror. Use the Librarian to interpret the
  mirror's "Human-speak" into "Machine-instructions."

## 5. Security & Safety

- **Write Mode:** Cloud models are READ-ONLY by policy.
- **Execution Gate:** Only the local `executor-` scripts are authorized to
  perform `fs.writeFile` operations.
