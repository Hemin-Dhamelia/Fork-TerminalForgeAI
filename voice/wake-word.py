"""
voice/wake-word.py — "Hey Forge" wake word detection via openWakeWord

Listens continuously on the mic for the "Hey Forge" wake word.
When detected, signals the pipeline to start recording a prompt.

Standalone usage (test mode):
  python3 voice/wake-word.py

As a module:
  from voice.wake_word import WakeWordDetector
  detector = WakeWordDetector()
  detector.load()
  if detector.listen_for_wake_word():
      # start recording...

Requires: pip install openwakeword sounddevice numpy
"""

import sys
import time
import numpy as np
from pathlib import Path
from typing import Optional
from loguru import logger

# Wake word audio config — openWakeWord expects 16kHz mono
SAMPLE_RATE   = 16000
CHUNK_SAMPLES = 1280       # 80ms chunks (openWakeWord standard)
WAKE_WORD     = "hey_forge"
THRESHOLD     = 0.5        # confidence threshold (0–1); lower = more sensitive

# Fallback model names to try (openwakeword built-in or custom)
WAKE_WORD_MODELS = [
    "hey_forge",       # custom model (if user trains one)
    "alexa",           # built-in fallback for testing — "Hey Forge" won't trigger this
]


class WakeWordDetector:
    """
    Listens for the "Hey Forge" wake word using openWakeWord.

    openWakeWord supports custom model training and comes with several
    pre-trained models. For "Hey Forge" specifically, you can train a
    custom model using openWakeWord's training pipeline, or use any
    built-in model for testing.
    """

    def __init__(
        self,
        model_name: str = WAKE_WORD,
        threshold: float = THRESHOLD,
        chunk_samples: int = CHUNK_SAMPLES,
    ) -> None:
        self.model_name    = model_name
        self.threshold     = threshold
        self.chunk_samples = chunk_samples
        self._oww_model    = None

    def load(self) -> None:
        """Load the openWakeWord model."""
        try:
            from openwakeword.model import Model  # type: ignore
            logger.info(f"Loading openWakeWord model: {self.model_name}")

            # Try loading custom model first, fall back to built-in
            try:
                self._oww_model = Model(
                    wakeword_models=[self.model_name],
                    inference_framework="onnx",
                )
                logger.success(f"Wake word model loaded: {self.model_name}")
            except Exception:
                logger.warning(f"Custom model '{self.model_name}' not found. Using built-in alexa model for testing.")
                self._oww_model = Model(
                    wakeword_models=["alexa"],
                    inference_framework="onnx",
                )
                self.model_name = "alexa"
                logger.info("Loaded built-in 'alexa' model (say 'Alexa' to trigger for testing)")

        except ImportError:
            logger.error("openwakeword not installed. Run: pip install openwakeword")
            raise

    def listen_for_wake_word(self, timeout: float = 0.0) -> bool:
        """
        Block until wake word detected (or timeout reached).

        Args:
            timeout: seconds to listen (0 = listen indefinitely)

        Returns:
            True if wake word detected, False on timeout
        """
        if self._oww_model is None:
            self.load()

        try:
            import sounddevice as sd  # type: ignore
        except ImportError:
            logger.error("sounddevice not installed. Run: pip install sounddevice")
            return False

        start_time = time.monotonic()
        audio_buffer: list[np.ndarray] = []
        lock_trigger = [False]

        def audio_callback(indata: np.ndarray, frames: int, time_info, status) -> None:
            if status:
                logger.debug(f"Audio status: {status}")
            audio_buffer.append(indata.flatten().copy())

        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="int16",              # openWakeWord expects int16
            blocksize=self.chunk_samples,
            callback=audio_callback,
        ):
            while True:
                if timeout > 0 and (time.monotonic() - start_time) > timeout:
                    return False

                if not audio_buffer:
                    time.sleep(0.01)
                    continue

                chunk = audio_buffer.pop(0)

                # Run inference
                try:
                    prediction = self._oww_model.predict(chunk)

                    # Check confidence for any loaded wake word model
                    for ww_name, scores in prediction.items():
                        if isinstance(scores, (list, np.ndarray)):
                            score = float(scores[-1]) if len(scores) > 0 else 0.0
                        else:
                            score = float(scores)

                        if score >= self.threshold:
                            logger.info(f"Wake word detected: {ww_name} (confidence: {score:.3f})")
                            self._oww_model.reset()  # reset state after detection
                            return True

                except Exception as e:
                    logger.debug(f"Wake word inference error: {e}")


# -- Training instructions -------------------------------------------------------

TRAINING_INSTRUCTIONS = """
To train a custom "Hey Forge" wake word model:

1. Install training dependencies:
   pip install openwakeword[train]

2. Record ~50–100 positive samples of "Hey Forge" (WAV, 16kHz mono, 1–2s each):
   python -c "import sounddevice as sd; import soundfile as sf; ..."

3. Use openWakeWord's automated training:
   python -m openwakeword.train --positive_samples ./hey_forge_samples/ \\
     --model_name hey_forge --output_dir ./voice/models/

4. Place the trained model in voice/models/hey_forge.onnx

5. Update WAKE_WORD in this file to point to 'voice/models/hey_forge.onnx'

See: https://github.com/dscripka/openWakeWord#training-new-wake-word-models
"""


# -- Standalone test -------------------------------------------------------------

if __name__ == "__main__":
    logger.remove()
    logger.add(sys.stderr, level="INFO", format="<green>{time:HH:mm:ss}</green> | <level>{level}</level> | {message}")

    print("\n  TerminalForge Wake Word Detector")
    print(f'  Listening for wake word (threshold={THRESHOLD})...')
    print("  Press Ctrl+C to stop\n")
    print(TRAINING_INSTRUCTIONS)

    detector = WakeWordDetector()
    try:
        detector.load()
        while True:
            print('  👂 Listening...')
            detected = detector.listen_for_wake_word()
            if detected:
                print("  ✓ Wake word detected! (in pipeline this would start recording)")
                time.sleep(1)
    except KeyboardInterrupt:
        print("\n  Wake word detector stopped.")
