"""
Global hotkey listener — activates the assistant via F12 without needing the wake word.

Uses the `keyboard` library to register a system-wide hotkey. Thread-safe activation
flag allows the main loop to poll without blocking.
"""
import threading


class HotkeyListener:
    def __init__(self, hotkey: str = "f12"):
        self.hotkey = hotkey
        self._activated = False
        self._lock = threading.Lock()
        self._running = False
        self._thread = None

    def start(self):
        """Start listening for the hotkey in a background thread."""
        self._running = True
        self._thread = threading.Thread(target=self._listen, daemon=True)
        self._thread.start()
        print(f"[Hotkey listener active: {self.hotkey.upper()} to activate]")

    def _listen(self):
        try:
            import keyboard
            keyboard.add_hotkey(self.hotkey, self._on_hotkey)
            # Keep thread alive
            while self._running:
                threading.Event().wait(0.1)
        except ImportError:
            print("[Hotkey listener: 'keyboard' library not installed — hotkey disabled]")
        except Exception as e:
            print(f"[Hotkey listener error: {e}]")

    def _on_hotkey(self):
        with self._lock:
            self._activated = True
        print(f"[{self.hotkey.upper()} pressed — activating assistant]")

    def is_activated(self) -> bool:
        """Check and consume the activation flag (returns True once, then resets)."""
        with self._lock:
            if self._activated:
                self._activated = False
                return True
            return False

    def stop(self):
        """Stop the hotkey listener."""
        self._running = False
        try:
            import keyboard
            keyboard.remove_hotkey(self.hotkey)
        except Exception:
            pass
