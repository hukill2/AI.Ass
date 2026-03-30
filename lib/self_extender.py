"""
Self-extending capability: when asked to do something the assistant doesn't
support, it searches the web for a solution, writes a Python module, saves it
to C:\\AI.Ass\\lib\\extensions\\, and calls it immediately.

Extensions are plain Python files that expose a single function:
    def run(params: dict) -> dict:
        ...
        return {"status": "success", "result": ..., "message": str}

On subsequent requests, the cached extension is loaded directly.
"""
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import requests

EXTENSIONS_DIR = Path(r"C:\AI.Ass\lib\extensions")
EXTENSIONS_DIR.mkdir(parents=True, exist_ok=True)


class SelfExtender:
    def __init__(self, config_path=r"C:\AI.Ass\config"):
        with open(Path(config_path) / "settings.json", encoding="utf-8") as f:
            self.config = json.load(f)
        self.ollama_host = self.config["ollama_host"]
        self.model = self.config["model"]

    # ── Extension lookup ──────────────────────────────────────────────────────

    def find_extension(self, capability: str) -> Path | None:
        """Return path to an existing extension for this capability, or None."""
        slug = self._slugify(capability)
        candidate = EXTENSIONS_DIR / f"{slug}.py"
        return candidate if candidate.exists() else None

    # ── Code generation ───────────────────────────────────────────────────────

    def generate_extension(self, capability: str, search_summary: str = "") -> Path:
        """Ask Mistral to write a Python extension module and save it."""
        slug = self._slugify(capability)
        out_path = EXTENSIONS_DIR / f"{slug}.py"

        prompt = f"""Write a Python module that implements the following capability:

CAPABILITY: {capability}
CONTEXT: {search_summary}

Requirements:
1. The file must expose exactly ONE public function:
       def run(params: dict) -> dict
2. Return format: {{"status":"success","result":<any>,"message":"<human readable>"}}
   or on failure: {{"status":"error","reason":"<str>","message":"<str>"}}
3. Use only stdlib or these approved packages:
   requests, beautifulsoup4, psutil, pathlib, json, subprocess, os, re, datetime
4. Install any extra package at the top with:
   subprocess.run([sys.executable, "-m", "pip", "install", "<pkg>"], check=True)
5. Include a brief module docstring describing what it does.
6. Output ONLY the Python code, no markdown fences.

Python code:"""

        response = requests.post(
            f"{self.ollama_host}/api/generate",
            json={
                "model": self.model,
                "prompt": prompt,
                "options": self.config.get("mistral_options", {}),
                "stream": False
            },
            timeout=60
        )

        code = response.json()["response"].strip()
        # Strip accidental markdown fences
        if code.startswith("```"):
            code = "\n".join(code.split("\n")[1:])
        if code.endswith("```"):
            code = "\n".join(code.split("\n")[:-1])

        out_path.write_text(code, encoding="utf-8")
        print(f"[SelfExtender] Extension written: {out_path}")
        return out_path

    # ── Dynamic loader ────────────────────────────────────────────────────────

    def load_and_run(self, ext_path: Path, params: dict) -> dict:
        """Dynamically import an extension and call its run() function."""
        spec = importlib.util.spec_from_file_location(ext_path.stem, ext_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[ext_path.stem] = module
        spec.loader.exec_module(module)

        if not hasattr(module, "run"):
            return {"status": "error", "reason": "no_run_function",
                    "message": f"Extension {ext_path.name} has no run() function"}

        try:
            return module.run(params)
        except Exception as e:
            return {"status": "error", "reason": "extension_error", "message": str(e)}

    # ── High-level entry point ────────────────────────────────────────────────

    def handle(self, capability: str, params: dict = {},
               search_summary: str = "") -> dict:
        """
        Try cached extension → generate new one → load and run.
        Returns the extension's result dict.
        """
        ext_path = self.find_extension(capability)

        if ext_path:
            print(f"[SelfExtender] Using cached extension: {ext_path.name}")
        else:
            print(f"[SelfExtender] Generating new extension for: {capability}")
            try:
                ext_path = self.generate_extension(capability, search_summary)
            except Exception as e:
                return {"status": "error", "reason": "generation_failed", "message": str(e)}

            # Show generated code before running — user can review
            print("\n--- Generated Extension ---")
            print(ext_path.read_text(encoding="utf-8"))
            print("--- End Extension ---\n")

            confirm = input("Run this code? (y/n): ").strip().lower()
            if confirm != "y":
                ext_path.unlink()
                return {"status": "rejected", "reason": "user_denied",
                        "message": "Extension rejected by user"}

        return self.load_and_run(ext_path, params)

    def list_extensions(self) -> list[str]:
        return [p.stem for p in EXTENSIONS_DIR.glob("*.py")]

    # ── Utility ───────────────────────────────────────────────────────────────

    @staticmethod
    def _slugify(text: str) -> str:
        import re
        return re.sub(r"[^a-z0-9]+", "_", text.lower().strip()).strip("_")
