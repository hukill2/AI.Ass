"""
Task chain — tracks multi-step workflows and resolves pronoun/implicit references.

When the user says "now open it" or "search for that", TaskChain resolves
what "it" and "that" refer to from prior context.

Context keys:
    last_search_query   — most recent web search term
    last_file           — most recently opened/created/edited file path
    last_document       — most recently created document path
    last_app            — most recently launched app
    last_result         — generic last result string
    last_action         — the action string from the last task
"""
from __future__ import annotations
import re
from datetime import datetime


# Words that signal the user is referring to a previous result
PRONOUN_TRIGGERS = {
    "it", "that", "this", "the file", "the document",
    "the result", "the search", "the app", "those", "them"
}

REFERENCE_PATTERNS = [
    r"\b(it|that|this)\b",
    r"\bthe (file|document|result|search|app)\b",
]


class TaskChain:
    def __init__(self):
        self.steps: list[dict] = []
        self.context: dict[str, str] = {
            "last_search_query": "",
            "last_file": "",
            "last_document": "",
            "last_app": "",
            "last_result": "",
            "last_action": "",
        }

    # ── Record ─────────────────────────────────────────────────────────────────

    def add_step(self, action: str, task: dict, result: dict):
        """Record a completed step and update context keys."""
        entry = {
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "task": task,
            "result": result,
        }
        self.steps.append(entry)

        # Update context from the completed task
        self._update_context(action, task, result)

    def _update_context(self, action: str, task: dict, result: dict):
        self.context["last_action"] = action

        if action == "web_search":
            self.context["last_search_query"] = task.get("query", "")
            self.context["last_result"] = result.get("summary", "")

        elif action in ("open_file", "edit_file", "create_file", "delete_file", "run_script"):
            target = task.get("target", "")
            if target:
                self.context["last_file"] = target
                self.context["last_result"] = target

        elif action == "create_document":
            # result may contain a file path in message or result dict
            path = result.get("path", result.get("message", ""))
            if path:
                self.context["last_document"] = path
                self.context["last_result"] = path

        elif action == "launch_app":
            self.context["last_app"] = task.get("target", "")

        elif action == "create_chart":
            path = result.get("path", result.get("message", ""))
            if path:
                self.context["last_file"] = path
                self.context["last_result"] = path

    # ── Resolve ────────────────────────────────────────────────────────────────

    def can_continue(self, command: str) -> bool:
        """Return True if the command contains a pronoun/implicit reference we can resolve."""
        lower = command.lower()
        for trigger in PRONOUN_TRIGGERS:
            if trigger in lower:
                return True
        for pattern in REFERENCE_PATTERNS:
            if re.search(pattern, lower):
                return True
        return False

    def resolve(self, command: str) -> str:
        """
        Replace pronoun/implicit references in `command` with context values.
        Returns the enriched command string.
        """
        lower = command.lower()
        resolved = command

        # "the file" / "it" / "that" after a file action
        if self.context["last_file"] and re.search(r"\b(the file|it|that)\b", lower):
            if self.context["last_action"] in (
                "open_file", "edit_file", "create_file", "run_script", "create_chart"
            ):
                resolved = re.sub(
                    r"\b(the file|it|that)\b",
                    self.context["last_file"],
                    resolved,
                    flags=re.IGNORECASE,
                )

        # "the document" / "it" after a document action
        if self.context["last_document"] and re.search(r"\b(the document|it|that)\b", lower):
            if self.context["last_action"] == "create_document":
                resolved = re.sub(
                    r"\b(the document|it|that)\b",
                    self.context["last_document"],
                    resolved,
                    flags=re.IGNORECASE,
                )

        # "that" / "the search" / "the result" after web search
        if self.context["last_search_query"] and re.search(
            r"\b(the search|the result|that|more about that)\b", lower
        ):
            if self.context["last_action"] == "web_search":
                resolved = re.sub(
                    r"\b(the search|the result|that)\b",
                    self.context["last_search_query"],
                    resolved,
                    flags=re.IGNORECASE,
                )

        # "the app" / "it" after launch
        if self.context["last_app"] and re.search(r"\b(the app|it)\b", lower):
            if self.context["last_action"] == "launch_app":
                resolved = re.sub(
                    r"\b(the app|it)\b",
                    self.context["last_app"],
                    resolved,
                    flags=re.IGNORECASE,
                )

        if resolved != command:
            print(f"[TaskChain resolved]: '{command}' → '{resolved}'")

        return resolved

    def context_hint(self) -> str:
        """Return a short string suitable for injecting into the Mistral prompt."""
        parts = []
        if self.context["last_file"]:
            parts.append(f"last file: {self.context['last_file']}")
        if self.context["last_document"]:
            parts.append(f"last document: {self.context['last_document']}")
        if self.context["last_search_query"]:
            parts.append(f"last search: {self.context['last_search_query']}")
        if self.context["last_app"]:
            parts.append(f"last app: {self.context['last_app']}")
        return ", ".join(parts) if parts else ""

    def clear(self):
        self.steps.clear()
        for key in self.context:
            self.context[key] = ""
