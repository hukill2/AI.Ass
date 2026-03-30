"""
Persistent conversation memory.

Stores exchanges to JSON, loads on startup, learns user preferences,
and supports basic semantic recall ("what did we talk about yesterday").

Storage: C:\\AI.Ass\\data\\conversation_history.json
"""
import json
import re
from datetime import datetime, date
from pathlib import Path

HISTORY_FILE = Path(r"C:\AI.Ass\data\conversation_history.json")
MAX_EXCHANGES = 50

# Phrases that signal a preference being stated
PREFERENCE_PATTERNS = [
    (r"i prefer (.+)", "preference"),
    (r"i like (.+)", "preference"),
    (r"i don'?t like (.+)", "dislike"),
    (r"always (.+)", "always"),
    (r"never (.+)", "never"),
    (r"call me (.+)", "name"),
    (r"my name is (.+)", "name"),
    (r"i'?m (?:called |named )?(.+)", "name"),
]


class ConversationMemory:
    def __init__(self, history_file: str = str(HISTORY_FILE)):
        self.history_file = Path(history_file)
        self.exchanges: list[dict] = []
        self.preferences: dict[str, str] = {}
        self._load()

    # ── Persistence ───────────────────────────────────────────────────────────

    def _load(self):
        if not self.history_file.exists():
            return
        try:
            data = json.loads(self.history_file.read_text(encoding="utf-8"))
            self.exchanges = data.get("exchanges", [])
            self.preferences = data.get("preferences", {})
        except Exception:
            self.exchanges = []
            self.preferences = {}

    def save(self):
        self.history_file.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "saved_at": datetime.now().isoformat(),
            "exchanges": self.exchanges[-MAX_EXCHANGES:],
            "preferences": self.preferences
        }
        self.history_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    # ── Record ─────────────────────────────────────────────────────────────────

    def add(self, user: str, assistant: str):
        """Record an exchange and extract any stated preferences."""
        self.exchanges.append({
            "timestamp": datetime.now().isoformat(),
            "user": user,
            "assistant": assistant
        })
        if len(self.exchanges) > MAX_EXCHANGES:
            self.exchanges = self.exchanges[-MAX_EXCHANGES:]

        self._extract_preferences(user)
        self.save()

    def _extract_preferences(self, text: str):
        for pattern, pref_type in PREFERENCE_PATTERNS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                value = match.group(1).strip().rstrip(".")
                self.preferences[pref_type] = value

    # ── Recall ─────────────────────────────────────────────────────────────────

    def recent(self, n: int = 3) -> list[dict]:
        """Return the n most recent exchanges as {user, assistant} dicts."""
        return [{"user": e["user"], "assistant": e["assistant"]}
                for e in self.exchanges[-n:]]

    def search(self, query: str) -> list[dict]:
        """
        Keyword search over history. Handles natural date references:
        'yesterday', 'today', 'last week'.
        """
        query_lower = query.lower()
        results = []

        # Date filtering
        target_date = None
        if "yesterday" in query_lower:
            from datetime import timedelta
            target_date = (date.today() - timedelta(days=1)).isoformat()
        elif "today" in query_lower:
            target_date = date.today().isoformat()

        keywords = re.sub(
            r"\b(yesterday|today|last week|what did|we|talk about|discuss)\b",
            "", query_lower
        ).split()
        keywords = [k for k in keywords if len(k) > 2]

        for exchange in self.exchanges:
            ts = exchange.get("timestamp", "")
            if target_date and not ts.startswith(target_date):
                continue
            combined = (exchange["user"] + " " + exchange["assistant"]).lower()
            if any(kw in combined for kw in keywords):
                results.append({
                    "timestamp": ts,
                    "user": exchange["user"],
                    "assistant": exchange["assistant"]
                })

        return results[-5:]  # cap at 5 results

    def preference_summary(self) -> str:
        """Return a short string describing stored preferences for prompt injection."""
        if not self.preferences:
            return ""
        parts = []
        if "name" in self.preferences:
            parts.append(f"The user's name is {self.preferences['name']}.")
        if "preference" in self.preferences:
            parts.append(f"User preference: {self.preferences['preference']}.")
        if "dislike" in self.preferences:
            parts.append(f"User dislikes: {self.preferences['dislike']}.")
        if "always" in self.preferences:
            parts.append(f"Always: {self.preferences['always']}.")
        if "never" in self.preferences:
            parts.append(f"Never: {self.preferences['never']}.")
        return " ".join(parts)

    def clear(self):
        self.exchanges = []
        self.preferences = {}
        self.save()

    def summary_for_search(self, query: str) -> str:
        """Return a formatted string of search results for voice output."""
        results = self.search(query)
        if not results:
            return "I don't have any record of that in our conversation history."
        lines = []
        for r in results:
            ts = r["timestamp"][:10]
            lines.append(f"On {ts} you said: \"{r['user']}\"")
        return " ".join(lines)
