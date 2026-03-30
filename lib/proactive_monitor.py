"""
Proactive monitor — watches the clipboard in the background and suggests actions.

Polls every 2 seconds. When meaningful content is detected (URL, email, code snippet,
long text), calls the registered callback with a suggestion string the assistant
can speak aloud.

Detection types:
    url         → "I see a URL in your clipboard. Want me to open it or search for it?"
    email       → "That looks like an email address. Want me to compose a message?"
    code        → "Looks like code. Want me to create a file or run it?"
    long_text   → "You've copied some text. Want me to create a document from it?"
"""
import re
import threading
import time


# Minimum character count to trigger long-text detection
LONG_TEXT_THRESHOLD = 120

URL_RE = re.compile(
    r"https?://[^\s/$.?#].[^\s]*",
    re.IGNORECASE
)
EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"
)
CODE_SIGNALS = [
    r"\bdef \w+\(",        # Python function
    r"\bfunction\s+\w+\s*\(",  # JS function
    r"import \w+",
    r"#include\s*<",
    r"\bclass \w+",
    r"if\s*\(.+\)\s*\{",
    r"for\s*\(.+\)\s*\{",
]
CODE_RE = re.compile("|".join(CODE_SIGNALS))


def _classify(text: str) -> str | None:
    """Return a detection type string or None if content is unremarkable."""
    stripped = text.strip()
    if not stripped:
        return None
    if URL_RE.search(stripped):
        return "url"
    if EMAIL_RE.search(stripped):
        return "email"
    if CODE_RE.search(stripped):
        return "code"
    if len(stripped) >= LONG_TEXT_THRESHOLD:
        return "long_text"
    return None


SUGGESTIONS = {
    "url":       "I noticed a URL in your clipboard. Want me to open it or look it up?",
    "email":     "That looks like an email address. Shall I do anything with it?",
    "code":      "Looks like you've copied some code. Want me to save it to a file or run it?",
    "long_text": "You've copied a chunk of text. Want me to turn it into a document?",
}


class ProactiveMonitor:
    def __init__(self, callback, poll_interval: float = 2.0):
        """
        callback: callable(suggestion: str, clip_text: str, clip_type: str)
            Called when actionable clipboard content is detected.
        poll_interval: seconds between clipboard checks.
        """
        self.callback = callback
        self.poll_interval = poll_interval
        self._last_clip = ""
        self._running = False
        self._thread = None

    def start(self):
        """Start the background monitor thread."""
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print("[Proactive monitor started]")

    def stop(self):
        """Stop the monitor."""
        self._running = False

    def _loop(self):
        try:
            import pyperclip
        except ImportError:
            print("[ProactiveMonitor: pyperclip not installed — monitor disabled]")
            return

        while self._running:
            try:
                clip = pyperclip.paste()
                if clip and clip != self._last_clip:
                    self._last_clip = clip
                    kind = _classify(clip)
                    if kind:
                        suggestion = SUGGESTIONS[kind]
                        print(f"[Proactive monitor detected: {kind}]")
                        try:
                            self.callback(suggestion, clip, kind)
                        except Exception as e:
                            print(f"[Proactive monitor callback error: {e}]")
            except Exception as e:
                print(f"[Proactive monitor poll error: {e}]")

            time.sleep(self.poll_interval)
