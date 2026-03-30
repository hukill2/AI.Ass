import glob
import json
import os
import subprocess
import time
from pathlib import Path

import psutil

from app_discoverer import AppDiscoverer

_HOME = Path.home().name

# Minimal fallback for apps that are hard to discover (system built-ins,
# apps launched by short alias, etc.)
FALLBACK_REGISTRY = {
    "chrome":     {"paths": ["chrome.exe"], "aliases": ["google chrome"]},
    "firefox":    {"paths": ["firefox.exe"], "aliases": []},
    "edge":       {"paths": ["msedge.exe"], "aliases": ["microsoft edge"]},
    "explorer":   {"paths": ["explorer.exe"], "aliases": ["file explorer"]},
    "notepad":    {"paths": ["notepad.exe"], "aliases": []},
    "calculator": {"paths": ["calc.exe"], "aliases": ["calc"]},
    "cmd":        {"paths": ["cmd.exe"], "aliases": ["command prompt"]},
    "powershell": {"paths": ["powershell.exe"], "aliases": []},
    "vscode":     {"paths": ["code"], "aliases": ["visual studio code", "vs code"]},
}


class AppLauncher:
    def __init__(self, config_path=r"C:\AI.Ass\config"):
        with open(Path(config_path) / "settings.json", encoding="utf-8") as f:
            self.config = json.load(f)
        self.discoverer = AppDiscoverer(config_path)
        self.fallback_registry = FALLBACK_REGISTRY

    def _success(self, app_name: str, message: str) -> dict:
        return {"status": "success", "app": app_name, "message": message}

    def _error(self, app_name: str, reason: str, message: str) -> dict:
        return {"status": "error", "app": app_name, "reason": reason, "message": message}

    def _count_processes(self, app_name: str) -> int:
        return len([p for p in psutil.process_iter(["name"])
                    if app_name in p.info["name"].lower()])

    def _popen(self, path: str):
        subprocess.Popen(
            path,
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        )

    def launch(self, app_name: str) -> dict:
        app_lower = app_name.lower().strip()

        # ── 1. Try dynamic discoverer ─────────────────────────────────────────
        app_info = self.discoverer.find_app(app_lower)
        if app_info:
            path = app_info["path"]
            display = app_info["display_name"]
            try:
                before = self._count_processes(app_lower)
                self._popen(path)
                time.sleep(2)
                after = self._count_processes(app_lower)

                if after > before:
                    return self._success(display, f"Launched {display}")
                else:
                    return self._success(display, f"Launched {display} (may already be running)")
            except PermissionError:
                return self._error(app_name, "permission_denied",
                                   f"No permission to launch {display}")
            except Exception as e:
                # Fall through to fallback registry
                pass

        # ── 2. Fallback: static registry ──────────────────────────────────────
        matched_config = None
        matched_name = None
        for name, cfg in self.fallback_registry.items():
            if name == app_lower or app_lower in cfg.get("aliases", []):
                matched_name = name
                matched_config = cfg
                break

        if matched_config:
            for path_template in matched_config["paths"]:
                if "*" in path_template:
                    matches = glob.glob(path_template)
                    if not matches:
                        continue
                    path = max(matches)
                else:
                    path = path_template

                try:
                    before = self._count_processes(matched_name)
                    self._popen(path)
                    time.sleep(2)
                    after = self._count_processes(matched_name)

                    if after > before:
                        return self._success(app_name, f"Launched {app_name} successfully")
                    else:
                        return self._success(app_name,
                                             f"Launched {app_name} (may already be running)")
                except FileNotFoundError:
                    continue
                except PermissionError:
                    return self._error(app_name, "permission_denied",
                                       f"No permission to launch {app_name}")
                except Exception:
                    continue

        return self._error(app_name, "app_not_found",
                           f"App '{app_name}' not found. "
                           f"Try: python -c \"from lib.app_discoverer import AppDiscoverer; "
                           f"AppDiscoverer().refresh_cache()\"")
