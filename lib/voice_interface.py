import re
import json
import asyncio
import os
import pygame
import edge_tts
import requests
import speech_recognition as sr
from pathlib import Path

VOICE = "en-AU-NatashaNeural"
TEMP_AUDIO = r"C:\AI.Ass\data\temp_speech.mp3"
APP_CACHE = Path(r"C:\AI.Ass\data\app_cache.json")
VOSK_MODEL_PATH = Path(r"C:\AI.Ass\data\vosk-model")

# Common speech-recognition mishears → corrected form.
# Values are checked against the app cache before applying.
CORRECTIONS = {
    r'\bopen not\b':       'open notion',
    r'\bopen note\b':      'open notion',
    r'\bopen no shin\b':   'open notion',
    r'\bchrom\b':          'chrome',
    r'\bfire fox\b':       'firefox',
    r'\bspotty\b':         'spotify',
    r'\bvisual studio\b':  'vscode',
}


class VoiceInterface:
    def __init__(self, config_path=r"C:\AI.Ass\config"):
        self.config = self._load_config(config_path)
        self.recognizer = sr.Recognizer()
        self.mic = sr.Microphone()
        self.ollama_host = self.config["ollama_host"]
        self.model = self.config["model"]
        pygame.mixer.init()

        # Interruption state
        self.interrupt_flag = False
        self.current_speech_file = None

        # Speech settings
        speech_cfg = self.config.get("speech_settings", {})
        self.pause_threshold = speech_cfg.get("pause_threshold", 0.8)
        self.phrase_threshold = speech_cfg.get("phrase_threshold", 0.3)
        self.non_speaking_duration = speech_cfg.get("non_speaking_duration", 0.5)
        self.phrase_time_limit = speech_cfg.get("phrase_time_limit", 12)
        self.enable_interrupts = speech_cfg.get("enable_interrupts", False)
        self.remove_fillers = speech_cfg.get("remove_fillers", True)
        self.use_vosk = speech_cfg.get("use_vosk", False)

        # Vosk model (loaded lazily to avoid startup delay if disabled)
        self.vosk_model = None
        if self.use_vosk:
            if VOSK_MODEL_PATH.exists():
                from vosk import Model
                print("[Loading Vosk model...]")
                self.vosk_model = Model(str(VOSK_MODEL_PATH))
                print("[Vosk ready]")
            else:
                print(f"[Vosk model not found at {VOSK_MODEL_PATH}, falling back to Google]")
                self.use_vosk = False

    def _load_config(self, config_path):
        with open(Path(config_path) / "settings.json", encoding="utf-8") as f:
            return json.load(f)

    # ── Listen ────────────────────────────────────────────────────────────────

    def listen(self, max_retries=2) -> str:
        if self.use_vosk and self.vosk_model:
            text = self._listen_vosk()
            if self.remove_fillers and text:
                text = self._clean_stutters(text)
            if text:
                print(f"You: {text}")
            return text

        # Google fallback
        for attempt in range(max_retries):
            try:
                with self.mic as source:
                    self.recognizer.adjust_for_ambient_noise(source, duration=0.3)
                    self.recognizer.pause_threshold = self.pause_threshold
                    self.recognizer.phrase_threshold = self.phrase_threshold
                    self.recognizer.non_speaking_duration = self.non_speaking_duration

                    label = "[Listening...]" if attempt == 0 else \
                            f"[Listening... (attempt {attempt + 1}/{max_retries})]"
                    print(label)

                    audio = self.recognizer.listen(
                        source, timeout=5, phrase_time_limit=self.phrase_time_limit
                    )

                text = self.recognizer.recognize_google(audio, language="en-US")
                if self.remove_fillers:
                    text = self._clean_stutters(text)
                print(f"You: {text}")
                return text

            except sr.WaitTimeoutError:
                if attempt < max_retries - 1:
                    print("[Timeout - no speech detected]")
                    continue
                print("[Timeout - moving on]")
                return ""
            except sr.UnknownValueError:
                if attempt < max_retries - 1:
                    print("[Speech unclear - please try again]")
                    continue
                print("[Could not understand - skipping]")
                return ""
            except sr.RequestError as e:
                print(f"[Network error: {e}]")
                return ""

        return ""

    def _listen_vosk(self) -> str:
        import pyaudio
        from vosk import KaldiRecognizer

        p = pyaudio.PyAudio()
        stream = None

        try:
            stream = p.open(format=pyaudio.paInt16, channels=1, rate=16000,
                            input=True, frames_per_buffer=4000)
            stream.start_stream()

            rec = KaldiRecognizer(self.vosk_model, 16000)
            rec.SetWords(True)

            print("[Listening with Vosk...]")
            silence_count = 0
            max_silence = 15  # ~3 seconds of silence

            while True:
                data = stream.read(4000, exception_on_overflow=False)

                if rec.AcceptWaveform(data):
                    result = json.loads(rec.Result())
                    return result.get("text", "").strip()

                partial = json.loads(rec.PartialResult()).get("partial", "")
                if partial:
                    print(f"[Partial: {partial}]", end="\r")
                    silence_count = 0
                else:
                    silence_count += 1

                if silence_count > max_silence:
                    final = json.loads(rec.FinalResult())
                    return final.get("text", "").strip()
        finally:
            # Safe cleanup — handles cases where stream or p are None
            if stream is not None:
                try:
                    stream.stop_stream()
                    stream.close()
                except Exception:
                    pass
            try:
                p.terminate()
            except Exception:
                pass

    # ── Text cleanup ──────────────────────────────────────────────────────────

    def _clean_stutters(self, text: str) -> str:
        # Repeated letters: "c-c-create" → "create"
        text = re.sub(r'\b(\w)-\1+-', r'\1', text)
        # Repeated words: "the the file" → "the file"
        text = re.sub(r'\b(\w+)\s+\1\b', r'\1', text)
        # Filler words
        for filler in ["um", "uh", "er", "ah"]:
            text = re.sub(rf'\b{filler}\b\s*', '', text, flags=re.IGNORECASE)

        # Context-aware corrections — only apply when target app is in cache
        if APP_CACHE.exists():
            try:
                cache_apps = json.loads(APP_CACHE.read_text(encoding="utf-8")).get("apps", {})
                for pattern, replacement in CORRECTIONS.items():
                    target_app = replacement.split()[-1]
                    if target_app in cache_apps or \
                            any(target_app in name for name in cache_apps):
                        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
            except Exception:
                pass  # cache unreadable — skip corrections silently

        return text.strip()

    # ── Speak ─────────────────────────────────────────────────────────────────

    def speak(self, text: str):
        print(f"Assistant: {text}")

        # Lazy-init Piper on first call
        if not hasattr(self, "piper"):
            try:
                from piper_voice import PiperVoice
                self.piper = PiperVoice()
            except Exception as e:
                print(f"[Piper init failed: {e}]")
                self.piper = None

        if self.piper is not None:
            try:
                self.piper.speak(text)
                return
            except Exception as e:
                print(f"[Piper failed: {e}]")

        # Fallback to win32com SAPI
        try:
            import win32com.client
            speaker = win32com.client.Dispatch("SAPI.SpVoice")
            speaker.Rate = 1
            speaker.Volume = 100
            speaker.Speak(text)
        except Exception as e:
            print(f"[COM TTS failed: {e}]")
            import pyttsx3
            engine = pyttsx3.init()
            engine.say(text)
            engine.runAndWait()
            engine.stop()

    def interrupt(self):
        self.interrupt_flag = True
        if pygame.mixer.music.get_busy():
            pygame.mixer.music.stop()

    # ── Mistral ───────────────────────────────────────────────────────────────

    def query_mistral(self, prompt: str, context_hint: str = "") -> dict:
        context_block = ""
        if context_hint:
            context_block = f"\nCONTEXT (recent activity — use to resolve 'it'/'that'/pronouns): {context_hint}\n"

        response = requests.post(
            f"{self.ollama_host}/api/generate",
            json={
                "model": self.model,
                "prompt": f"""Classify user intent and respond. Output JSON only.
{context_block}

TASK TYPES:
- open_file: "open X" → {{"action":"open_file","target":"path","response":"Opening X"}}
- run_script: "run X" → {{"action":"run_script","target":"path","response":"Running X"}}
- create_file: "create X" → {{"action":"create_file","target":"path","params":{{"content":""}},"response":"Creating X"}}
- edit_file: "edit X" → {{"action":"edit_file","target":"path","response":"Editing X"}}
- delete_file: "delete X" → {{"action":"delete_file","target":"path","response":"Deleting X"}}
- list_dir: "list/show files" → {{"action":"list_dir","target":"path","response":"Listing files"}}

CHART CREATION:
- "create/make/generate bar/line/pie/scatter chart" → {{"action":"create_chart","chart_type":"bar|line|pie|scatter","data":{{"labels":[],"values":[]}},"params":{{"title":""}},"response":"Creating chart"}}
- If data not provided: {{"action":"clarify","response":"What data should I use for the chart?"}}

DOCUMENT CREATION:
- "create word/docx document" → {{"action":"create_document","doc_type":"docx","content":"","params":{{"title":""}},"response":"Creating Word document"}}
- "create excel/xlsx spreadsheet" → {{"action":"create_document","doc_type":"xlsx","data":{{"headers":[],"rows":[]}},"params":{{}},"response":"Creating Excel file"}}
- "create pdf" → {{"action":"create_document","doc_type":"pdf","content":"","params":{{}},"response":"Creating PDF"}}
- If content/data missing: {{"action":"clarify","response":"What should be in the document?"}}

WEB & APP:
- web_search: "search/google/look up" → {{"action":"web_search","query":"terms","response":"Searching for X"}}
- launch_app: "open/launch [app name]" → {{"action":"launch_app","target":"chrome|firefox|edge|vscode|spotify|discord|slack|norton|notion|notepad|calculator|explorer|cmd|powershell","response":"Launching [app name]"}}
  IMPORTANT: Extract FULL app name even if partial. "open not" likely means "notion". "open chro" likely means "chrome". Use closest match from the target list above.

SCREEN VISION & CONTROL:
- "take screenshot/what's on screen/read screen/click [text]/type [text]" → {{"action":"screen_action","screen_action":"screenshot|read_text|click|type","params":{{}},"response":"Reading screen"}}
  Examples:
  - "what's on my screen" → {{"action":"screen_action","screen_action":"read_text","params":{{}},"response":"Reading screen text"}}
  - "take a screenshot" → {{"action":"screen_action","screen_action":"screenshot","params":{{"filename":"screen.png"}},"response":"Taking screenshot"}}
  - "click the save button" → {{"action":"screen_action","screen_action":"click","params":{{"text":"Save"}},"response":"Clicking Save"}}
  - "type hello world" → {{"action":"screen_action","screen_action":"type","params":{{"text":"hello world"}},"response":"Typing text"}}

SYSTEM COMMANDS (map command values):
- "what's my ip/get ip/ip address" → {{"action":"system_cmd","command":"get_ip","params":{{}},"response":"Getting your IP address"}}
- "shutdown/shut down" → {{"action":"system_cmd","command":"shutdown","params":{{"delay_minutes":0}},"response":"Shutting down"}}
- "restart/reboot" → {{"action":"system_cmd","command":"restart","params":{{"delay_minutes":0}},"response":"Restarting"}}
- "battery status/battery" → {{"action":"system_cmd","command":"get_battery","params":{{}},"response":"Checking battery"}}
- "volume/get volume" → {{"action":"system_cmd","command":"get_volume","params":{{}},"response":"Checking volume"}}
- "set volume to X" → {{"action":"system_cmd","command":"set_volume","params":{{"level":50}},"response":"Setting volume"}}
- "sleep/go to sleep" → {{"action":"system_cmd","command":"sleep","params":{{}},"response":"Going to sleep"}}

CONVERSATION (no task):
{{"action":"conversation","response":"your answer here"}}

CLARIFY (missing required info):
{{"action":"clarify","response":"What do you need?"}}

User: {prompt}
JSON:""",
                "options": self.config.get("mistral_options", {}),
                "stream": False
            },
            timeout=30
        )

        raw = response.json()["response"]
        clean = raw.replace("```json", "").replace("```", "").strip()
        return json.loads(clean)

    def get_conversation_response(self, prompt: str, context: list = None) -> str:
        """Get a natural conversational response with personality and optional history."""
        system_context = """You are a helpful voice assistant with these traits:
- Friendly and conversational, not robotic
- British accent/vocabulary (use "brilliant", "cheers", "quite" naturally)
- Concise responses (1-3 sentences max for voice)
- Helpful without being overly formal
- Remember you're speaking, not writing

Keep responses SHORT for voice output. Aim for 10-20 words unless detail is needed."""

        conversation_history = ""
        if context:
            conversation_history = "\n".join([
                f"User: {c['user']}\nYou: {c['assistant']}"
                for c in context[-3:]  # Last 3 exchanges for brevity
            ])

        full_prompt = f"""{system_context}

{conversation_history}

User: {prompt}
You:"""

        response = requests.post(
            f"{self.ollama_host}/api/generate",
            json={
                "model": self.model,
                "prompt": full_prompt,
                "stream": False,
                "options": {
                    "temperature": 0.8,
                    "num_predict": 100,
                    "top_p": 0.9
                }
            },
            timeout=15
        )
        return response.json()["response"].strip()
