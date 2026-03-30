"""
Automatically discovers all installed Windows applications without manual
registry entries. Scans Start Menu shortcuts, Program Files, AppData, and
the Windows Uninstall registry. Results are cached for 7 days.
"""
import difflib
import json
import os
import re
import winreg
from datetime import datetime, timedelta
from pathlib import Path

CACHE_FILE = Path(r"C:\AI.Ass\data\app_cache.json")
CACHE_TTL_DAYS = 7
MAX_SCAN_DEPTH = 3

SKIP_DIRS = {
    "windows", "windowsapps", "system32", "syswow64", "winsxs",
    "microsoft.net", "windowspowershell", "internet explorer"
}

# Normalization rules: regex → replacement applied in order
NORM_RULES = [
    (r"\s*\(x86\)|\s*\(x64\)|\s*\(64-?bit\)|\s*\(32-?bit\)", ""),
    (r"\s+\d+(\.\d+)*\s*$", ""),               # trailing version numbers
    (r"\bversion\b.*$", ""),                    # "version X.Y"
    (r"\bfor\s+windows\b", ""),
    (r"\bmicrosoft\b\s*", ""),
    (r"\bgoogle\b\s*", ""),
    (r"\bvisual studio code\b", "vscode"),
    (r"\bvs code\b", "vscode"),
    (r"\bgoogle chrome\b", "chrome"),
    (r"\bmicrosoft edge\b", "edge"),
    (r"\.exe$", ""),
    (r"[^a-z0-9]", ""),                         # strip everything non-alphanumeric
]


def _normalize(name: str) -> str:
    """Normalize an app name to a compact lowercase key."""
    s = name.strip().lower()
    for pattern, replacement in NORM_RULES:
        s = re.sub(pattern, replacement, s)
    return s.strip()


class AppDiscoverer:
    def __init__(self, config_path=r"C:\AI.Ass\config",
                 cache_file: str = str(CACHE_FILE)):
        config_path = Path(config_path)
        with open(config_path / "settings.json", encoding="utf-8") as f:
            self.config = json.load(f)
        self.cache_file = Path(cache_file)
        self.apps: dict = self.load_cache()

    # ── Public API ────────────────────────────────────────────────────────────

    def discover_all(self) -> dict:
        """Scan all sources, deduplicate, save cache, return registry."""
        all_entries: list[dict] = []

        for scanner, label in [
            (self._scan_start_menu,   "Start Menu"),
            (self._scan_program_files,"Program Files"),
            (self._scan_appdata,      "AppData"),
            (self._scan_registry,     "Registry"),
        ]:
            try:
                found = scanner()
                print(f"[AppDiscoverer] Scanning {label}... found {len(found)} apps")
                all_entries.extend(found)
            except Exception as e:
                print(f"[AppDiscoverer] {label} scan failed: {e}")

        # Deduplicate: normalized name → best entry (prefer entries with real paths)
        registry: dict[str, dict] = {}
        for entry in all_entries:
            key = _normalize(entry["display_name"])
            if not key:
                continue
            if key not in registry or entry.get("path", ""):
                registry[key] = entry

        self.apps = registry
        self.save_cache(registry)
        return registry

    def find_app(self, query: str) -> dict | None:
        """Find an app by name with exact → normalized → fuzzy fallback."""
        apps = self.apps or self.load_cache()
        if not apps:
            return None

        q = query.lower().strip()

        # 1. Exact key match
        if q in apps:
            return apps[q]

        # 2. Normalized match
        q_norm = _normalize(q)
        if q_norm in apps:
            return apps[q_norm]

        # 3. Substring match
        for key, entry in apps.items():
            if q_norm in key or key.startswith(q_norm):
                return entry

        # 4. Fuzzy match via difflib
        keys = list(apps.keys())
        close = difflib.get_close_matches(q_norm, keys, n=1, cutoff=0.6)
        if close:
            return apps[close[0]]

        return None

    def refresh_cache(self):
        registry = self.discover_all()
        print(f"[AppDiscoverer] Cache refreshed — {len(registry)} apps indexed.")

    # ── Cache ─────────────────────────────────────────────────────────────────

    def load_cache(self) -> dict:
        if not self.cache_file.exists():
            return {}
        try:
            data = json.loads(self.cache_file.read_text(encoding="utf-8"))
            cached_at = datetime.fromisoformat(data.get("cached_at", "2000-01-01"))
            if datetime.now() - cached_at > timedelta(days=CACHE_TTL_DAYS):
                return {}   # expired — caller should refresh
            return data.get("apps", {})
        except Exception:
            return {}   # corrupt cache — rebuild

    def save_cache(self, apps: dict):
        self.cache_file.parent.mkdir(parents=True, exist_ok=True)
        payload = {"cached_at": datetime.now().isoformat(), "apps": apps}
        self.cache_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    # ── Scanners ──────────────────────────────────────────────────────────────

    def _scan_start_menu(self) -> list[dict]:
        results = []
        menus = [
            Path(os.environ.get("PROGRAMDATA", ""))
                / "Microsoft" / "Windows" / "Start Menu" / "Programs",
            Path(os.environ.get("APPDATA", ""))
                / "Microsoft" / "Windows" / "Start Menu" / "Programs",
        ]
        for menu in menus:
            if not menu.exists():
                continue
            for lnk in menu.rglob("*.lnk"):
                try:
                    target = self._resolve_lnk(str(lnk))
                    if target and target.lower().endswith(".exe") and Path(target).exists():
                        results.append({
                            "display_name": lnk.stem,
                            "path": target,
                            "source": "start_menu"
                        })
                except Exception:
                    continue
        return results

    def _scan_program_files(self) -> list[dict]:
        results = []
        roots = [
            Path(r"C:\Program Files"),
            Path(r"C:\Program Files (x86)"),
        ]
        for root in roots:
            if not root.exists():
                continue
            for app_dir in root.iterdir():
                if not app_dir.is_dir():
                    continue
                if app_dir.name.lower() in SKIP_DIRS:
                    continue
                exe = self._find_main_exe(app_dir, app_dir.name, depth=0)
                if exe:
                    results.append({
                        "display_name": app_dir.name,
                        "path": str(exe),
                        "source": "program_files"
                    })
        return results

    def _scan_appdata(self) -> list[dict]:
        results = []
        local_programs = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs"
        if not local_programs.exists():
            return results
        for app_dir in local_programs.iterdir():
            if not app_dir.is_dir():
                continue
            exe = self._find_main_exe(app_dir, app_dir.name, depth=0)
            if exe:
                results.append({
                    "display_name": app_dir.name,
                    "path": str(exe),
                    "source": "appdata"
                })
        return results

    def _scan_registry(self) -> list[dict]:
        results = []
        keys = [
            (winreg.HKEY_LOCAL_MACHINE,
             r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
            (winreg.HKEY_LOCAL_MACHINE,
             r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
            (winreg.HKEY_CURRENT_USER,
             r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        ]
        for hive, key_path in keys:
            try:
                key = winreg.OpenKey(hive, key_path)
            except OSError:
                continue
            for i in range(winreg.QueryInfoKey(key)[0]):
                try:
                    sub_name = winreg.EnumKey(key, i)
                    sub = winreg.OpenKey(key, sub_name)
                    try:
                        name = winreg.QueryValueEx(sub, "DisplayName")[0].strip()
                        location = winreg.QueryValueEx(sub, "InstallLocation")[0].strip()
                        if name and location:
                            exe = self._find_main_exe(Path(location), name, depth=0)
                            if exe:
                                results.append({
                                    "display_name": name,
                                    "path": str(exe),
                                    "source": "registry"
                                })
                    except OSError:
                        pass
                    finally:
                        winreg.CloseKey(sub)
                except Exception:
                    continue
            winreg.CloseKey(key)
        return results

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _find_main_exe(self, directory: Path, app_name: str,
                       depth: int) -> Path | None:
        if depth > MAX_SCAN_DEPTH or not directory.exists():
            return None

        norm = _normalize(app_name)

        # Check direct .exe files in this directory
        try:
            exes = [f for f in directory.iterdir()
                    if f.suffix.lower() == ".exe" and f.is_file()]
        except PermissionError:
            return None

        # Prefer exe whose name matches app name
        for exe in exes:
            if _normalize(exe.stem) == norm or norm in _normalize(exe.stem):
                return exe
        if exes:
            return exes[0]

        # Recurse one level into subdirectories
        try:
            for sub in directory.iterdir():
                if sub.is_dir() and sub.name.lower() not in SKIP_DIRS:
                    result = self._find_main_exe(sub, app_name, depth + 1)
                    if result:
                        return result
        except PermissionError:
            pass

        return None

    def _resolve_lnk(self, lnk_path: str) -> str | None:
        try:
            import win32com.client
            shell = win32com.client.Dispatch("WScript.Shell")
            return shell.CreateShortCut(lnk_path).Targetpath
        except Exception:
            return None

    def _normalize_name(self, name: str) -> str:
        return _normalize(name)
