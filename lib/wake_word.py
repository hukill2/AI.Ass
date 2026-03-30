"""
Wake word detector — listens passively for "Freya" before activating the assistant.

Uses Google speech recognition in a low-power loop. When the wake word is heard,
returns True to signal the main loop to begin active listening.
"""
import speech_recognition as sr
import time


WAKE_WORD = "freya"
WAKE_ALTERNATIVES = {"hey freya", "ok freya", "okay freya", "frey", "frayah"}


class WakeWordDetector:
    def __init__(self, wake_word: str = WAKE_WORD):
        self.wake_word = wake_word.lower()
        self.recognizer = sr.Recognizer()
        self.mic = sr.Microphone()

        # Calibrate once at startup for faster loop
        with self.mic as source:
            self.recognizer.adjust_for_ambient_noise(source, duration=1.0)

        # Passive listening — shorter thresholds to reduce CPU load
        self.recognizer.pause_threshold = 0.6
        self.recognizer.phrase_threshold = 0.2
        self.recognizer.non_speaking_duration = 0.4

    def listen_for_wake_word(self, timeout: float = 3.0) -> bool:
        """
        Listen for one phrase and check if it contains the wake word.
        Returns True if wake word detected, False on timeout/noise/error.
        """
        try:
            with self.mic as source:
                audio = self.recognizer.listen(
                    source,
                    timeout=timeout,
                    phrase_time_limit=4
                )
            text = self.recognizer.recognize_google(audio, language="en-US").lower()
            print(f"[Wake listener heard]: {text}")

            if self.wake_word in text:
                return True
            if any(alt in text for alt in WAKE_ALTERNATIVES):
                return True
            return False

        except sr.WaitTimeoutError:
            return False
        except sr.UnknownValueError:
            return False
        except sr.RequestError as e:
            print(f"[Wake word network error: {e}]")
            return False
        except Exception as e:
            print(f"[Wake word error: {e}]")
            return False

    def wait_for_activation(self) -> bool:
        """
        Blocking loop — keeps listening until wake word is detected.
        Returns True when activated.
        """
        print(f"[Waiting for wake word: '{self.wake_word}']")
        while True:
            if self.listen_for_wake_word():
                print("[Wake word detected!]")
                return True
            time.sleep(0.05)  # tiny yield to avoid hammering CPU between attempts
