import json
import socket
import subprocess
from datetime import datetime
from pathlib import Path

import psutil

DESTRUCTIVE = {"shutdown", "restart"}

class SystemCommander:
    def __init__(self, config_path=r"C:\AI.Ass\config"):
        with open(Path(config_path) / "settings.json", encoding="utf-8") as f:
            self.config = json.load(f)
        self.require_approval = self.config.get("require_approval", True)
        self.log_dir = Path(self.config["log_dir"])

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _success(self, command: str, result, message: str) -> dict:
        return {"status": "success", "command": command, "result": result, "message": message}

    def _error(self, command: str, reason: str, message: str) -> dict:
        return {"status": "error", "command": command, "reason": reason, "message": message}

    def execute(self, command: str, params: dict = {}) -> dict:
        handler = getattr(self, f"_cmd_{command}", None)
        if not handler:
            return self._error(command, "unknown_command", f"Unknown command: {command}")

        if command in DESTRUCTIVE and self.require_approval:
            print(f"\n[APPROVAL REQUIRED] {command}")
            answer = input("Approve? (y/n): ").strip().lower()
            if answer != "y":
                self._log(command, params, "user_rejected")
                return self._error(command, "user_denied", f"{command} cancelled by user")

        try:
            result = handler(params)
            self._log(command, params, result.get("status", "unknown"))
            return result
        except Exception as e:
            self._log(command, params, "exception")
            return self._error(command, "exception", str(e))

    # ── Shutdown / restart / cancel ──────────────────────────────────────────

    def _cmd_shutdown(self, params):
        delay = int(params.get("delay_minutes", 0)) * 60
        subprocess.run(["shutdown", "/s", "/t", str(delay)], check=True)
        mins = delay // 60
        msg = f"Shutting down {'now' if mins == 0 else f'in {mins} minute(s)'}"
        return self._success("shutdown", None, msg)

    def _cmd_restart(self, params):
        delay = int(params.get("delay_minutes", 0)) * 60
        subprocess.run(["shutdown", "/r", "/t", str(delay)], check=True)
        mins = delay // 60
        msg = f"Restarting {'now' if mins == 0 else f'in {mins} minute(s)'}"
        return self._success("restart", None, msg)

    def _cmd_cancel_shutdown(self, params):
        subprocess.run(["shutdown", "/a"], check=True)
        return self._success("cancel_shutdown", None, "Pending shutdown/restart cancelled")

    # ── Network ──────────────────────────────────────────────────────────────

    def _cmd_get_ip(self, params):
        addresses = {}
        for iface, snics in psutil.net_if_addrs().items():
            for snic in snics:
                if snic.family == socket.AF_INET:
                    addresses[iface] = snic.address

        hostname = socket.gethostname()
        primary = socket.gethostbyname(hostname)
        return self._success("get_ip",
                             {"hostname": hostname, "primary": primary, "all": addresses},
                             f"Primary IP: {primary}")

    # ── Battery ──────────────────────────────────────────────────────────────

    def _cmd_get_battery(self, params):
        battery = psutil.sensors_battery()
        if battery is None:
            return self._error("get_battery", "no_battery", "No battery detected")

        plugged = "plugged in" if battery.power_plugged else "on battery"
        msg = f"Battery at {battery.percent:.0f}%, {plugged}"
        if not battery.power_plugged and battery.secsleft != psutil.POWER_TIME_UNLIMITED:
            hrs, rem = divmod(battery.secsleft, 3600)
            mins = rem // 60
            msg += f", {hrs}h {mins}m remaining"

        return self._success("get_battery",
                             {"percent": battery.percent,
                              "plugged": battery.power_plugged,
                              "seconds_left": battery.secsleft},
                             msg)

    # ── Volume ───────────────────────────────────────────────────────────────

    def _get_volume_interface(self):
        from comtypes import CLSCTX_ALL
        from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume

        try:
            devices = AudioUtilities.GetSpeakers()
            interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
            return interface.QueryInterface(IAudioEndpointVolume)
        except Exception:
            # Fallback: use default device directly
            from pycaw.pycaw import AudioUtilities
            sessions = AudioUtilities.GetAllSessions()
            if sessions:
                return sessions[0].SimpleAudioVolume
            raise Exception("Could not access volume controls")

    def _cmd_get_volume(self, params):
        try:
            volume = self._get_volume_interface()
            if hasattr(volume, "GetMasterVolumeLevelScalar"):
                current = int(volume.GetMasterVolumeLevelScalar() * 100)
            else:
                current = int(volume.GetMasterVolume() * 100)
            return self._success("get_volume", {"level": current}, f"Volume is at {current}%")
        except Exception as e:
            return self._error("get_volume", "volume_error", f"Could not get volume: {e}")

    def _cmd_set_volume(self, params):
        level = params.get("level", 50)
        if not 0 <= level <= 100:
            return self._error("set_volume", "invalid_level", "Volume must be between 0 and 100")

        try:
            volume = self._get_volume_interface()
            if hasattr(volume, "SetMasterVolumeLevelScalar"):
                volume.SetMasterVolumeLevelScalar(level / 100, None)
            else:
                volume.SetMasterVolume(level / 100, None)
            return self._success("set_volume", {"level": level}, f"Volume set to {level}%")
        except Exception as e:
            return self._error("set_volume", "volume_error", f"Could not set volume: {e}")

    # ── Lock / sleep ─────────────────────────────────────────────────────────

    def _cmd_lock_screen(self, params):
        subprocess.run(["rundll32.exe", "user32.dll,LockWorkStation"], check=True)
        return self._success("lock_screen", None, "Screen locked")

    def _cmd_sleep(self, params):
        subprocess.run(
            ["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"], check=True
        )
        return self._success("sleep", None, "Going to sleep")

    # ── Logging ──────────────────────────────────────────────────────────────

    def _log(self, command, params, status):
        log_file = self.log_dir / f"session_{datetime.now().strftime('%Y%m%d')}.jsonl"
        entry = {
            "timestamp": datetime.now().isoformat(),
            "source": "system_commander",
            "command": command,
            "params": params,
            "status": status
        }
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
