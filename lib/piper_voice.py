"""
Piper TTS wrapper — fast offline neural TTS using the jenny_dioco British female voice.

Voice: en_GB-jenny_dioco-medium (~7% real-time factor on CPU)
Binary: C:\\AI.Ass\\tools\\piper\\piper.exe
Model:  C:\\AI.Ass\\tools\\piper\\voices\\en_GB-jenny_dioco-medium.onnx
"""
import subprocess
from pathlib import Path

import pygame

PIPER_EXE = Path(r"C:\AI.Ass\tools\piper\piper.exe")
MODEL = Path(r"C:\AI.Ass\tools\piper\voices\en_GB-jenny_dioco-medium.onnx")
TEMP_WAV = Path(r"C:\AI.Ass\data\temp_speech.wav")


class PiperVoice:
    def __init__(self):
        if not PIPER_EXE.exists():
            raise FileNotFoundError(f"Piper binary not found: {PIPER_EXE}")
        if not MODEL.exists():
            raise FileNotFoundError(f"Voice model not found: {MODEL}")
        pygame.mixer.init()

    def speak(self, text: str):
        # Generate WAV via Piper
        process = subprocess.Popen(
            [str(PIPER_EXE), "--model", str(MODEL), "--output_file", str(TEMP_WAV)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        process.communicate(input=text.encode("utf-8"))

        # Play the WAV
        pygame.mixer.music.load(str(TEMP_WAV))
        pygame.mixer.music.play()

        while pygame.mixer.music.get_busy():
            pygame.time.Clock().tick(10)

        pygame.mixer.music.unload()
        TEMP_WAV.unlink(missing_ok=True)
