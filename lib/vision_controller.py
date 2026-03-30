"""
Screen vision and computer control using free tools only:
- mss       → screenshots (fast, no GUI required)
- pytesseract + Tesseract OCR → text extraction from screen
- pyautogui → mouse/keyboard control

NOTE: Tesseract must be installed separately:
  winget install UB-Mannheim.TesseractOCR
  or download from: https://github.com/UB-Mannheim/tesseract/wiki

pytesseract will auto-detect Tesseract if it's on PATH.
"""
import json
import os
import re
from pathlib import Path

import mss
import mss.tools
import pyautogui
import pytesseract
from PIL import Image

pyautogui.FAILSAFE = True  # move mouse to top-left corner to abort

SCREENSHOT_DIR = Path(r"C:\AI.Ass\data\screenshots")
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)


class VisionController:
    def __init__(self, config_path=r"C:\AI.Ass\config"):
        with open(Path(config_path) / "settings.json", encoding="utf-8") as f:
            self.config = json.load(f)
        # Allow custom Tesseract path via settings
        tess_path = self.config.get("tesseract_path")
        if tess_path:
            pytesseract.pytesseract.tesseract_cmd = tess_path

    # ── Screenshot ────────────────────────────────────────────────────────────

    def screenshot(self, filename: str = "screen.png") -> dict:
        """Capture the full screen and save to screenshots dir."""
        out = SCREENSHOT_DIR / filename
        with mss.mss() as sct:
            monitor = sct.monitors[1]  # primary monitor
            img = sct.grab(monitor)
            mss.tools.to_png(img.rgb, img.size, output=str(out))
        return {
            "status": "success",
            "filepath": str(out),
            "size": f"{img.size[0]}x{img.size[1]}",
            "message": f"Screenshot saved to {out.name}"
        }

    # ── OCR ───────────────────────────────────────────────────────────────────

    def read_screen(self, region: dict | None = None) -> dict:
        """
        Extract all text from the screen (or a region).
        region = {"top": y, "left": x, "width": w, "height": h}
        """
        with mss.mss() as sct:
            monitor = region or sct.monitors[1]
            img = sct.grab(monitor)
            pil_img = Image.frombytes("RGB", img.size, img.rgb)

        try:
            text = pytesseract.image_to_string(pil_img)
        except Exception as e:
            return {"status": "error", "reason": "ocr_error", "message": str(e)}

        return {
            "status": "success",
            "text": text.strip(),
            "message": f"Read {len(text.split())} words from screen"
        }

    def find_text_on_screen(self, search_text: str) -> dict:
        """
        Locate text on screen using OCR and return its approximate coordinates.
        """
        with mss.mss() as sct:
            monitor = sct.monitors[1]
            img = sct.grab(monitor)
            pil_img = Image.frombytes("RGB", img.size, img.rgb)

        try:
            data = pytesseract.image_to_data(pil_img, output_type=pytesseract.Output.DICT)
        except Exception as e:
            return {"status": "error", "reason": "ocr_error", "message": str(e)}

        pattern = re.compile(re.escape(search_text), re.IGNORECASE)
        matches = []
        for i, word in enumerate(data["text"]):
            if pattern.search(word):
                x = data["left"][i] + data["width"][i] // 2
                y = data["top"][i] + data["height"][i] // 2
                matches.append({"word": word, "x": x, "y": y,
                                 "confidence": data["conf"][i]})

        if matches:
            return {"status": "success", "matches": matches,
                    "message": f"Found '{search_text}' at {len(matches)} location(s)"}
        return {"status": "success", "matches": [],
                "message": f"'{search_text}' not found on screen"}

    # ── Mouse / keyboard control ──────────────────────────────────────────────

    def click_text(self, text: str) -> dict:
        """Find text on screen via OCR and click it."""
        result = self.find_text_on_screen(text)
        if result["status"] != "success" or not result["matches"]:
            return {"status": "error", "reason": "text_not_found",
                    "message": f"Could not find '{text}' on screen"}

        # Use highest-confidence match
        best = max(result["matches"], key=lambda m: m["confidence"])
        pyautogui.click(best["x"], best["y"])
        return {"status": "success", "clicked_at": (best["x"], best["y"]),
                "message": f"Clicked '{text}' at ({best['x']}, {best['y']})"}

    def click_at(self, x: int, y: int) -> dict:
        pyautogui.click(x, y)
        return {"status": "success", "message": f"Clicked at ({x}, {y})"}

    def type_text(self, text: str, interval: float = 0.05) -> dict:
        pyautogui.typewrite(text, interval=interval)
        return {"status": "success", "message": f"Typed: {text}"}

    def press_key(self, key: str) -> dict:
        pyautogui.press(key)
        return {"status": "success", "message": f"Pressed: {key}"}

    def hotkey(self, *keys: str) -> dict:
        pyautogui.hotkey(*keys)
        return {"status": "success", "message": f"Hotkey: {'+'.join(keys)}"}

    def move_mouse(self, x: int, y: int) -> dict:
        pyautogui.moveTo(x, y, duration=0.2)
        return {"status": "success", "message": f"Mouse moved to ({x}, {y})"}

    # ── Composite actions ─────────────────────────────────────────────────────

    def fill_field(self, field_label: str, value: str) -> dict:
        """Find a labelled input field by OCR and type a value into it."""
        result = self.click_text(field_label)
        if result["status"] != "success":
            return result
        pyautogui.hotkey("ctrl", "a")   # select existing content
        pyautogui.typewrite(value, interval=0.05)
        return {"status": "success", "message": f"Filled '{field_label}' with '{value}'"}
