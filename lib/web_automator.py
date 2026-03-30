"""
Browser automation via Playwright.

Mistral generates a list of steps; web_automator executes them headlessly
(or visibly). Steps are plain JSON so they can be logged and re-played.

Step schema:
  {"action": "navigate",  "url": "https://..."}
  {"action": "click",     "selector": "css-or-text"}
  {"action": "fill",      "selector": "...", "value": "..."}
  {"action": "press",     "key": "Enter"}
  {"action": "wait",      "ms": 1000}
  {"action": "screenshot","path": "C:\\AI.Ass\\data\\screen.png"}
  {"action": "read_text", "selector": "..."}        # returns text
  {"action": "scroll",    "direction": "down"}
"""
import json
import requests
from pathlib import Path

SCREENSHOT_DIR = Path(r"C:\AI.Ass\data\screenshots")


class WebAutomator:
    def __init__(self, config_path=r"C:\AI.Ass\config", headless=False):
        with open(Path(config_path) / "settings.json", encoding="utf-8") as f:
            self.config = json.load(f)
        self.ollama_host = self.config["ollama_host"]
        self.model = self.config["model"]
        self.headless = headless
        self._browser = None
        self._page = None
        SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

    # ── Browser lifecycle ─────────────────────────────────────────────────────

    def _ensure_browser(self):
        if self._page is None:
            from playwright.sync_api import sync_playwright
            self._pw = sync_playwright().start()
            self._browser = self._pw.chromium.launch(headless=self.headless)
            self._page = self._browser.new_page()

    def close(self):
        if self._browser:
            self._browser.close()
            self._pw.stop()
            self._browser = None
            self._page = None

    # ── Step planner (Mistral) ────────────────────────────────────────────────

    def plan_steps(self, goal: str) -> list[dict]:
        """Ask Mistral to produce a JSON list of browser steps for `goal`."""
        response = requests.post(
            f"{self.ollama_host}/api/generate",
            json={
                "model": self.model,
                "prompt": f"""You are a browser automation planner. Output ONLY a JSON array of steps.

Available step actions:
- navigate: {{"action":"navigate","url":"https://..."}}
- click: {{"action":"click","selector":"text=Button Label"}}
- fill: {{"action":"fill","selector":"input[name=q]","value":"search term"}}
- press: {{"action":"press","key":"Enter"}}
- wait: {{"action":"wait","ms":2000}}
- read_text: {{"action":"read_text","selector":"main"}}
- screenshot: {{"action":"screenshot","path":"C:\\\\AI.Ass\\\\data\\\\screenshots\\\\result.png"}}
- scroll: {{"action":"scroll","direction":"down"}}

Use "text=..." selectors when clicking buttons/links by their visible label.
Prefer well-known URLs (google.com, youtube.com, etc.).

Goal: {goal}
Steps JSON array:""",
                "options": self.config.get("mistral_options", {}),
                "stream": False
            },
            timeout=30
        )
        raw = response.json()["response"]
        clean = raw.replace("```json", "").replace("```", "").strip()
        return json.loads(clean)

    # ── Step executor ─────────────────────────────────────────────────────────

    def execute_steps(self, steps: list[dict]) -> dict:
        self._ensure_browser()
        results = []
        for step in steps:
            action = step.get("action")
            try:
                result = self._run_step(step)
                results.append({"step": step, "status": "ok", "result": result})
            except Exception as e:
                results.append({"step": step, "status": "error", "error": str(e)})
                break  # stop on first failure

        success = all(r["status"] == "ok" for r in results)
        return {
            "status": "success" if success else "partial",
            "steps_run": len(results),
            "results": results
        }

    def _run_step(self, step: dict):
        action = step["action"]
        p = self._page

        if action == "navigate":
            p.goto(step["url"], wait_until="domcontentloaded")
            return p.url

        elif action == "click":
            p.click(step["selector"])

        elif action == "fill":
            p.fill(step["selector"], step["value"])

        elif action == "press":
            p.keyboard.press(step["key"])

        elif action == "wait":
            p.wait_for_timeout(int(step.get("ms", 1000)))

        elif action == "read_text":
            return p.inner_text(step.get("selector", "body"))

        elif action == "screenshot":
            path = step.get("path", str(SCREENSHOT_DIR / "screenshot.png"))
            p.screenshot(path=path)
            return path

        elif action == "scroll":
            direction = step.get("direction", "down")
            delta = 500 if direction == "down" else -500
            p.mouse.wheel(0, delta)

        return None

    # ── High-level entry point ────────────────────────────────────────────────

    def automate(self, goal: str) -> dict:
        """Plan and execute browser steps for a natural language goal."""
        try:
            steps = self.plan_steps(goal)
            print(f"[WebAutomator] {len(steps)} steps planned for: {goal}")
            for i, s in enumerate(steps, 1):
                print(f"  {i}. {s}")
            return self.execute_steps(steps)
        except json.JSONDecodeError as e:
            return {"status": "error", "reason": "plan_parse_error", "error": str(e)}
        except Exception as e:
            return {"status": "error", "reason": "automation_error", "error": str(e)}
