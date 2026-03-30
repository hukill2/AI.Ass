import subprocess
import json
from pathlib import Path
from datetime import datetime

class TaskExecutor:
    def __init__(self, config_path=r"C:\AI.Ass\config"):
        self.config_path = Path(config_path)
        self.settings = self._load_settings()
        self.allowed_cmds = self._load_allowed_commands()
        self.workspace = Path(self.settings["workspace"])
        self.log_dir = Path(self.settings["log_dir"])

    def _load_settings(self):
        with open(self.config_path / "settings.json", encoding="utf-8") as f:
            return json.load(f)

    def _load_allowed_commands(self):
        with open(self.config_path / "allowed_commands.json", encoding="utf-8") as f:
            return json.load(f)

    def _log(self, event: dict):
        log_file = self.log_dir / f"session_{datetime.now().strftime('%Y%m%d')}.jsonl"
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(event) + "\n")

    def execute(self, task: dict) -> dict:
        action = task.get("action")

        if action not in self.allowed_cmds["commands"]:
            return {"status": "rejected", "reason": "unauthorized_action"}

        if action in self.allowed_cmds["destructive"] and self.settings["require_approval"]:
            print(f"\n[APPROVAL REQUIRED]")
            print(f"Action: {action}")
            print(f"Target: {task.get('target')}")
            response = input("Approve? (y/n): ").strip().lower()
            if response != 'y':
                self._log({"timestamp": datetime.now().isoformat(), "task": task, "status": "user_rejected"})
                return {"status": "rejected", "reason": "user_denied"}

        handler = getattr(self, f"_{action}", None)
        if not handler:
            return {"status": "error", "reason": "no_handler"}

        try:
            result = handler(task)
            self._log({"timestamp": datetime.now().isoformat(), "task": task, "result": result})
            return result
        except Exception as e:
            error_result = {"status": "error", "error": str(e)}
            self._log({"timestamp": datetime.now().isoformat(), "task": task, "result": error_result})
            return error_result

    def _open_file(self, task):
        target = Path(task["target"]).resolve()
        if not target.exists():
            return {"status": "error", "reason": "file_not_found"}

        editor = task.get("params", {}).get("editor", self.settings["editor"])
        subprocess.Popen([editor, str(target)], shell=True)
        return {"status": "success", "opened": str(target)}

    def _run_script(self, task):
        target = Path(task["target"]).resolve()
        if not target.exists():
            return {"status": "error", "reason": "script_not_found"}

        interpreter = task.get("params", {}).get("interpreter", "python")
        if interpreter not in self.allowed_cmds["allowed_interpreters"]:
            return {"status": "rejected", "reason": "interpreter_not_allowed"}

        result = subprocess.run(
            [interpreter, str(target)],
            capture_output=True,
            text=True,
            timeout=self.settings["timeout"],
            shell=True
        )
        return {
            "status": "success",
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }

    def _edit_file(self, task):
        target = Path(task["target"]).resolve()
        content = task.get("params", {}).get("content", "")
        mode = task.get("params", {}).get("mode", "append")

        target.parent.mkdir(parents=True, exist_ok=True)

        if mode == "replace":
            target.write_text(content, encoding="utf-8")
        else:
            with open(target, "a", encoding="utf-8") as f:
                f.write(content + "\n")

        return {"status": "success", "modified": str(target)}

    def _list_dir(self, task):
        target_str = task["target"]

        # Handle drive letter notation: "C:" → "C:\"
        if len(target_str) == 2 and target_str[1] == ':':
            target_str += '\\'

        target = Path(target_str).resolve()

        if not target.exists():
            return {"status": "error", "reason": "path_not_found"}

        if not target.is_dir():
            return {"status": "error", "reason": "not_a_directory"}

        items = [str(p.name) for p in target.iterdir()]
        return {"status": "success", "items": items, "path": str(target)}

    def _create_file(self, task):
        target = Path(task["target"]).resolve()
        content = task.get("params", {}).get("content", "")

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return {"status": "success", "created": str(target)}

    def _delete_file(self, task):
        target = Path(task["target"]).resolve()
        if not target.exists():
            return {"status": "error", "reason": "file_not_found"}

        target.unlink()
        return {"status": "success", "deleted": str(target)}
