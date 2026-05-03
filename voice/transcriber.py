"""
voice/transcriber.py — faster-whisper transcription wrapper

Loads a local faster-whisper model and exposes a simple transcribe() function.
No network required — model runs fully offline on CPU or GPU.

Usage:
    from voice.transcriber import Transcriber
    t = Transcriber(model_size="base.en")
    text = t.transcribe(audio_array, sample_rate=16000)
"""

import numpy as np
from pathlib import Path
from typing import Optional
from loguru import logger


# Default model — "base.en" is English-only, ~145MB, < 1s latency on M1/M2
# Options: "tiny.en", "base.en", "small.en", "medium.en", "large-v3"
DEFAULT_MODEL = "base.en"
DEFAULT_DEVICE = "cpu"         # "cuda" if NVIDIA GPU available
DEFAULT_COMPUTE = "int8"       # int8 = fastest on CPU; "float16" for GPU


class Transcriber:
    """
    Loads a faster-whisper model and transcribes raw audio.
    Model is loaded once and reused across calls — keep one instance alive.
    """

    def __init__(
        self,
        model_size: str = DEFAULT_MODEL,
        device: str = DEFAULT_DEVICE,
        compute_type: str = DEFAULT_COMPUTE,
    ) -> None:
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self._model = None

    def load(self) -> None:
        """Load the Whisper model. Call once at startup."""
        try:
            from faster_whisper import WhisperModel  # type: ignore
            logger.info(f"Loading faster-whisper model: {self.model_size} ({self.device}/{self.compute_type})")
            self._model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
            )
            logger.success(f"Model loaded: {self.model_size}")
        except ImportError:
            logger.error("faster-whisper not installed. Run: pip install faster-whisper")
            raise
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            raise

    def transcribe(
        self,
        audio: np.ndarray,
        sample_rate: int = 16000,
        language: str = "en",
        beam_size: int = 5,
    ) -> str:
        """
        Transcribe a numpy float32 audio array → text string.

        Args:
            audio:        float32 numpy array, mono channel
            sample_rate:  audio sample rate (Whisper expects 16000 Hz)
            language:     language hint — "en" for English
            beam_size:    decoding beam width (higher = more accurate, slower)

        Returns:
            Transcribed text string (stripped, capitalised).
            Returns empty string if nothing detected.
        """
        if self._model is None:
            self.load()

        try:
            # Ensure float32, mono, correct sample rate
            audio = np.asarray(audio, dtype=np.float32)
            if audio.ndim > 1:
                audio = audio.mean(axis=1)  # stereo → mono

            # faster-whisper accepts numpy array directly
            segments, info = self._model.transcribe(
                audio,
                language=language,
                beam_size=beam_size,
                vad_filter=True,          # built-in VAD filter to remove silence
                vad_parameters=dict(
                    min_silence_duration_ms=300,
                ),
            )

            text = " ".join(seg.text.strip() for seg in segments).strip()
            logger.debug(f"Transcribed ({info.language} {info.language_probability:.2f}): {text!r}")
            return text

        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            return ""

    @property
    def is_loaded(self) -> bool:
        return self._model is not None


# -- Standalone quick test -------------------------------------------------------

if __name__ == "__main__":
    import sounddevice as sd  # type: ignore

    logger.info("Recording 4 seconds of audio for transcription test...")
    SAMPLE_RATE = 16000
    DURATION    = 4

    audio = sd.rec(
        int(DURATION * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="float32",
    )
    sd.wait()
    audio = audio.flatten()

    t = Transcriber()
    result = t.transcribe(audio)
    print(f"\nTranscription: {result!r}")
