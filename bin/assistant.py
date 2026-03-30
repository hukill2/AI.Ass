#!/usr/bin/env python
import sys
import threading
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "lib"))

import speech_recognition as sr
import pygame
from voice_interface import VoiceInterface
from executor import TaskExecutor
from web_searcher import WebSearcher
from app_launcher import AppLauncher
from system_commander import SystemCommander
from chart_generator import ChartGenerator
from document_creator import DocumentCreator
from vision_controller import VisionController
from conversation_memory import ConversationMemory
from wake_word import WakeWordDetector
from hotkey_listener import HotkeyListener
from task_chain import TaskChain
from proactive_monitor import ProactiveMonitor
import json

KNOWN_ACTIONS = {
    "conversation", "clarify", "open_file", "run_script", "edit_file",
    "list_dir", "create_file", "delete_file", "web_search", "launch_app",
    "system_cmd", "create_chart", "create_document", "screen_action"
}

CHART_KEYWORDS = {"chart", "graph", "plot", "bar chart", "pie chart", "line chart", "scatter"}
DOC_KEYWORDS = {"document", "docx", "word", "spreadsheet", "excel", "xlsx", "pdf", "report"}


def _is_chart_request(command: str) -> bool:
    lower = command.lower()
    return any(kw in lower for kw in CHART_KEYWORDS)


def _is_doc_request(command: str) -> bool:
    lower = command.lower()
    return any(kw in lower for kw in DOC_KEYWORDS)


def _doc_type(command: str) -> str:
    lower = command.lower()
    if any(k in lower for k in ("excel", "xlsx", "spreadsheet")):
        return "xlsx"
    if "pdf" in lower:
        return "pdf"
    return "docx"


def parse_args():
    parser = argparse.ArgumentParser(description="Freya Voice Assistant")
    parser.add_argument(
        "--wake-word", action="store_true",
        help="Require wake word 'Freya' before each command"
    )
    parser.add_argument(
        "--hotkey", action="store_true",
        help="Enable F12 hotkey to activate without wake word"
    )
    parser.add_argument(
        "--proactive", action="store_true",
        help="Enable proactive clipboard monitor"
    )
    return parser.parse_args()


def main():
    args = parse_args()

    voice = VoiceInterface()
    executor = TaskExecutor()
    searcher = WebSearcher()
    launcher = AppLauncher()
    commander = SystemCommander()
    chart_gen = ChartGenerator()
    doc_creator = DocumentCreator()
    vision = VisionController()
    memory = ConversationMemory()
    chain = TaskChain()

    # ── Wake word detector ─────────────────────────────────────────────────────
    wake_detector = None
    if args.wake_word:
        wake_detector = WakeWordDetector(wake_word="freya")

    # ── Hotkey listener ────────────────────────────────────────────────────────
    hotkey = None
    if args.hotkey:
        hotkey = HotkeyListener(hotkey="f12")
        hotkey.start()

    # ── Proactive clipboard monitor ────────────────────────────────────────────
    proactive_queue: list[tuple[str, str, str]] = []

    def handle_suggestion(suggestion: str, clip_text: str, clip_type: str):
        proactive_queue.append((suggestion, clip_text, clip_type))

    monitor = None
    if args.proactive:
        monitor = ProactiveMonitor(callback=handle_suggestion, poll_interval=2.0)
        monitor.start()

    # ── Background interrupt listener ──────────────────────────────────────────
    if voice.enable_interrupts:
        def background_listen():
            bg_recognizer = sr.Recognizer()
            bg_mic = sr.Microphone()
            while True:
                if pygame.mixer.music.get_busy():
                    try:
                        with bg_mic as source:
                            audio = bg_recognizer.listen(source, timeout=0.5, phrase_time_limit=2)
                            voice.interrupt()
                            print("[Interrupted]")
                    except Exception:
                        pass

        listener_thread = threading.Thread(target=background_listen, daemon=True)
        listener_thread.start()

    voice.speak("Freya online")

    while True:
        # ── Proactive suggestions ──────────────────────────────────────────────
        if proactive_queue:
            suggestion, clip_text, clip_type = proactive_queue.pop(0)
            voice.speak(suggestion)
            # Don't block — user can ignore or respond next cycle

        # ── Activation gate ────────────────────────────────────────────────────
        if wake_detector or hotkey:
            hotkey_fired = hotkey and hotkey.is_activated()
            if not hotkey_fired:
                if wake_detector:
                    # Passive loop — show minimal prompt
                    print("\n[Waiting for 'Freya' or F12...]")
                    activated = wake_detector.listen_for_wake_word(timeout=3.0)
                    if not activated:
                        # Also check hotkey in case it fired while we were listening
                        if hotkey and hotkey.is_activated():
                            pass  # fall through to listen
                        else:
                            continue
                else:
                    # Hotkey-only mode — just loop waiting
                    import time
                    time.sleep(0.1)
                    continue

            voice.speak("Yes?")

        print("\n" + "=" * 50)
        print("READY - Speak now (say 'exit' to quit)")
        print("=" * 50)

        command = voice.listen()
        if not command:
            continue

        if "exit" in command.lower() or "quit" in command.lower():
            voice.speak("Shutting down. Goodbye.")
            if monitor:
                monitor.stop()
            if hotkey:
                hotkey.stop()
            break

        # ── TaskChain pronoun resolution ───────────────────────────────────────
        if chain.can_continue(command):
            command = chain.resolve(command)

        # ── Build context hint for Mistral ─────────────────────────────────────
        context_hint = chain.context_hint()

        try:
            task = voice.query_mistral(command, context_hint=context_hint)
            print(f"[Task]: {json.dumps(task, indent=2)}")
        except Exception as e:
            voice.speak("Could not understand command")
            print(f"Parse error: {e}")
            continue

        action = task.get("action")
        response_text = task.get("response", "")

        # ── Conversation ───────────────────────────────────────────────────────
        if action == "conversation":
            print("[Mode: Conversation]")

            recall_keywords = ["what did we", "do you remember", "earlier", "yesterday", "last time"]
            if any(kw in command.lower() for kw in recall_keywords):
                recall = memory.summary_for_search(command)
                voice.speak(recall)
                memory.add(command, recall)
                continue

            response = voice.get_conversation_response(command, memory.recent(3))
            memory.add(command, response)
            voice.speak(response)
            continue

        # ── Clarification ──────────────────────────────────────────────────────
        if action == "clarify":
            voice.speak(response_text)
            continue

        # ── Chart creation ─────────────────────────────────────────────────────
        if action == "create_chart":
            chart_type = task.get("chart_type", "bar")
            data = task.get("data", {})
            params = task.get("params", {})

            if not data.get("labels") or not data.get("values"):
                voice.speak("I need chart data. Please provide labels and values.")
                continue

            result = chart_gen.generate(chart_type, data, params)
            print(f"[Result]: {json.dumps(result, indent=2)}")
            voice.speak(result.get("message", "Chart created"))
            chain.add_step(action, task, result)
            continue

        # ── Document creation ──────────────────────────────────────────────────
        if action == "create_document":
            doc_type = task.get("doc_type", "docx")
            content = task.get("content", "")
            data = task.get("data", {})
            params = task.get("params", {})

            if doc_type == "xlsx":
                result = doc_creator.create_xlsx(data, params)
            elif doc_type == "pdf":
                result = doc_creator.create_pdf(content, params)
            else:
                result = doc_creator.create_docx(content, params)

            print(f"[Result]: {json.dumps(result, indent=2)}")
            voice.speak(result.get("message", "Document created"))
            chain.add_step(action, task, result)
            continue

        # ── Standard file/system tasks ─────────────────────────────────────────
        if action in ["open_file", "run_script", "edit_file", "list_dir", "create_file", "delete_file"]:
            result = executor.execute(task)
            print(f"[Result]: {json.dumps(result, indent=2)}")
            if result["status"] == "success":
                voice.speak(response_text or "Done")
            else:
                voice.speak(f"Failed: {result.get('reason')}")
            chain.add_step(action, task, result)
            continue

        # ── Web search ─────────────────────────────────────────────────────────
        if action == "web_search":
            result = searcher.search(task.get("query", ""))
            if result["status"] == "success":
                voice.speak(result["summary"])
            else:
                voice.speak("Search failed")
            print(f"[Result]: {json.dumps(result, indent=2)}")
            chain.add_step(action, task, result)
            continue

        # ── App launcher ───────────────────────────────────────────────────────
        if action == "launch_app":
            result = launcher.launch(task.get("target", ""))
            voice.speak(result.get("message", "Done"))
            print(f"[Result]: {json.dumps(result, indent=2)}")
            chain.add_step(action, task, result)
            continue

        # ── System commands ────────────────────────────────────────────────────
        if action == "system_cmd":
            result = commander.execute(task.get("command", ""), task.get("params", {}))
            voice.speak(result.get("message", "Done"))
            print(f"[Result]: {json.dumps(result, indent=2)}")
            chain.add_step(action, task, result)
            continue

        # ── Screen vision & control ────────────────────────────────────────────
        if action == "screen_action":
            screen_action = task.get("screen_action")
            params = task.get("params", {})

            result = None
            if screen_action == "screenshot":
                result = vision.screenshot(params.get("filename", "screen.png"))
            elif screen_action == "read_text":
                result = vision.read_screen(params.get("region"))
                if result.get("status") == "success":
                    voice.speak(f"I see: {result.get('text', 'nothing')}")
                else:
                    voice.speak("Could not read screen")
                print(f"[Result]: {json.dumps(result, indent=2)}")
                chain.add_step(action, task, result)
                continue
            elif screen_action == "click":
                result = vision.click_text(params.get("text", ""))
            elif screen_action == "type":
                result = vision.type_text(params.get("text", ""))

            if result:
                print(f"[Result]: {json.dumps(result, indent=2)}")
                voice.speak(result.get("message", "Done"))
                chain.add_step(action, task, result)
            continue

        voice.speak("I didn't understand that action")


if __name__ == "__main__":
    main()
