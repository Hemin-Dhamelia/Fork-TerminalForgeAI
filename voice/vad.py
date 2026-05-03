"""
voice/vad.py — Microphone capture + Voice Activity Detection

Modes:
  1. PersistentMic           — keeps stream open permanently; zero-latency record start
  2. record_push_to_talk     — legacy: opens stream per recording (2s+ overhead)
  3. record_auto_vad         — continuous VAD; detects speech start/end automatically

Performance note:
  Opening a sounddevice stream takes ~2.3s on macOS.
  PersistentMic opens it ONCE at startup so recording starts instantly on every press.
"""

import json
import sys
import time
import threading
import numpy as np
from pathlib import Path
from typing import Optional
from loguru import logger

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

SAMPLE_RATE    = 16000      # Hz — required by Whisper and silero-vad
CHUNK_SAMPLES  = 512        # silero-vad v5 requires exactly 512 samples @ 16kHz
CHUNK_DURATION = CHUNK_SAMPLES / SAMPLE_RATE   # ~0.032s per chunk
SILENCE_MS     = 1500       # ms of silence before ending auto-vad recording
MAX_RECORD_SEC = 60         # hard cap
MIN_SPEECH_SEC = 0.3        # discard recordings shorter than this


# =============================================================================
#  PersistentMic — keeps stream open permanently (fast push-to-talk)
# =============================================================================

class PersistentMic:
    """
    Opens the microphone stream ONCE and keeps it open for the life of the pipeline.
    Recording is toggled by setting is_recording = True/False.

    Eliminates the 2.3s stream-open overhead on every push-to-talk press.
    """

    def __init__(self) -> None:
        self._stream     = None
        self._lock       = threading.Lock()
        self._chunks: list[np.ndarray] = []
        self.is_recording: bool = False
        self._opened     = False

    def open(self) -> None:
        """Open the mic stream. Call once at pipeline startup."""
        try:
            import sounddevice as sd  # type: ignore
        except ImportError:
            logger.error("sounddevice not installed. Run: pip install sounddevice")
            raise

        def _callback(indata: np.ndarray, frames: int, time_info, status) -> None:
            if status:
                logger.debug(f"Mic status: {status}")
            if self.is_recording:
                with self._lock:
                    self._chunks.append(indata.copy())

        logger.info("Opening persistent mic stream...")
        t0 = time.monotonic()
        self._stream = sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocksize=CHUNK_SAMPLES,
            callback=_callback,
        )
        self._stream.start()
        self._opened = True
        elapsed = (time.monotonic() - t0) * 1000
        logger.success(f"Mic stream open ({elapsed:.0f}ms) — push-to-talk is now instant")

    def start_recording(self) -> None:
        """Start collecting audio chunks."""
        with self._lock:
            self._chunks.clear()
        self.is_recording = True
        logger.info("Recording started")

    def stop_recording(self) -> Optional[np.ndarray]:
        """
        Stop collecting and return the recorded audio as float32 array.
        Returns None if too short or nothing captured.
        """
        self.is_recording = False
        with self._lock:
            chunks = list(self._chunks)
            self._chunks.clear()

        if not chunks:
            logger.debug("No audio captured")
            return None

        audio    = np.concatenate(chunks, axis=0).flatten()
        duration = len(audio) / SAMPLE_RATE
        logger.info(f"Recording stopped — {duration:.2f}s captured")

        if duration < MIN_SPEECH_SEC:
            logger.debug("Too short — discarding")
            return None

        return audio

    def close(self) -> None:
        if self._stream and self._opened:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass
            self._opened = False
            logger.info("Mic stream closed")


# =============================================================================
#  Push-to-talk using PersistentMic (fast path)
# =============================================================================

def record_push_to_talk_fast(
    mic: PersistentMic,
    state_path: Path,
    timeout: float = MAX_RECORD_SEC,
) -> Optional[np.ndarray]:
    """
    Push-to-talk using an already-open PersistentMic.
    No stream overhead — recording starts in <1ms.

    Polls voice_state.json for status != "recording" to stop.
    """
    mic.start_recording()
    start_time = time.monotonic()

    while True:
        elapsed = time.monotonic() - start_time
        if elapsed >= timeout:
            logger.warning(f"Push-to-talk: hit {timeout}s timeout")
            break
        try:
            raw  = state_path.read_text()
            data = json.loads(raw)
            if data.get("status") != "recording":
                break
        except (json.JSONDecodeError, FileNotFoundError):
            pass
        time.sleep(0.02)   # 20ms poll — snappier than 50ms

    return mic.stop_recording()


# =============================================================================
#  Legacy push-to-talk (opens stream per call — slow, kept for fallback)
# =============================================================================

def load_vad_model():
    """Load silero-vad model. Returns (model, VADIterator class)."""
    try:
        from silero_vad import load_silero_vad, VADIterator  # type: ignore
        logger.info("Loading silero-vad model...")
        model = load_silero_vad()
        logger.success("silero-vad model loaded")
        return model, VADIterator
    except ImportError:
        logger.error("silero-vad not installed. Run: pip install silero-vad")
        raise


def record_push_to_talk(state_path: Path, timeout: float = MAX_RECORD_SEC) -> Optional[np.ndarray]:
    """Legacy push-to-talk — opens mic stream per call (~2.3s overhead). Use PersistentMic instead."""
    try:
        import sounddevice as sd  # type: ignore
    except ImportError:
        logger.error("sounddevice not installed.")
        return None

    logger.warning("record_push_to_talk: opening new stream (slow). Use PersistentMic for speed.")
    chunks: list[np.ndarray] = []
    start_time = time.monotonic()

    def audio_callback(indata: np.ndarray, frames: int, time_info, status) -> None:
        if status:
            logger.debug(f"Audio stream status: {status}")
        chunks.append(indata.copy())

    with sd.InputStream(
        samplerate=SAMPLE_RATE, channels=1, dtype="float32",
        blocksize=CHUNK_SAMPLES, callback=audio_callback,
    ):
        while True:
            if time.monotonic() - start_time >= timeout:
                break
            try:
                raw  = state_path.read_text()
                data = json.loads(raw)
                if data.get("status") != "recording":
                    break
            except (json.JSONDecodeError, FileNotFoundError):
                pass
            time.sleep(0.05)

    if not chunks:
        return None
    audio = np.concatenate(chunks, axis=0).flatten()
    duration = len(audio) / SAMPLE_RATE
    logger.info(f"Captured {duration:.2f}s")
    return audio if duration >= MIN_SPEECH_SEC else None


# =============================================================================
#  Auto-VAD (continuous listening)
# =============================================================================

def record_auto_vad(
    vad_model,
    vad_iterator_class,
    state_path: Optional[Path] = None,
    silence_ms: int = SILENCE_MS,
    timeout: float = MAX_RECORD_SEC,
) -> Optional[np.ndarray]:
    """Auto-VAD: captures mic continuously, returns audio after speech + silence gap."""
    try:
        import sounddevice as sd  # type: ignore
        import torch              # type: ignore
    except ImportError as e:
        logger.error(f"Missing dependency: {e}")
        return None

    vad_iter = vad_iterator_class(
        vad_model, threshold=0.5, sampling_rate=SAMPLE_RATE,
        min_silence_duration_ms=silence_ms, speech_pad_ms=100,
    )

    logger.info("Auto-VAD: listening...")
    _update_status(state_path, "listening")

    speech_chunks: list[np.ndarray] = []
    in_speech      = False
    speech_started = False
    silence_start: Optional[float] = None
    start_time     = time.monotonic()
    audio_queue: list[np.ndarray] = []
    lock = threading.Lock()

    def audio_callback(indata: np.ndarray, frames: int, time_info, status) -> None:
        with lock:
            audio_queue.append(indata.copy())

    with sd.InputStream(
        samplerate=SAMPLE_RATE, channels=1, dtype="float32",
        blocksize=CHUNK_SAMPLES, callback=audio_callback,
    ):
        while True:
            if time.monotonic() - start_time > timeout:
                logger.warning("Auto-VAD: timeout")
                break

            with lock:
                pending = audio_queue.copy()
                audio_queue.clear()

            for chunk in pending:
                chunk_mono   = chunk.flatten()
                chunk_tensor = torch.from_numpy(chunk_mono)
                speech_event = vad_iter(chunk_tensor, return_seconds=False)

                if speech_event and "start" in speech_event:
                    in_speech = True; speech_started = True; silence_start = None
                    _update_status(state_path, "recording")
                if in_speech:
                    speech_chunks.append(chunk_mono)
                if speech_event and "end" in speech_event:
                    in_speech = False; silence_start = time.monotonic()
                if speech_started and not in_speech and silence_start is not None:
                    if (time.monotonic() - silence_start) * 1000 >= silence_ms:
                        logger.info("Auto-VAD: utterance complete")
                        break
            else:
                time.sleep(0.01)
                continue
            break

    _update_status(state_path, "transcribing")
    if not speech_chunks:
        _update_status(state_path, "idle")
        return None

    audio    = np.concatenate(speech_chunks).flatten()
    duration = len(audio) / SAMPLE_RATE
    logger.info(f"Auto-VAD: captured {duration:.2f}s")
    if duration < MIN_SPEECH_SEC:
        _update_status(state_path, "idle")
        return None
    return audio


# =============================================================================
#  Helpers
# =============================================================================

def _update_status(state_path: Optional[Path], status: str) -> None:
    if state_path is None:
        return
    try:
        existing = {}
        if state_path.exists():
            try:
                existing = json.loads(state_path.read_text())
            except json.JSONDecodeError:
                pass
        existing["status"] = status
        existing["updatedAt"] = _iso_now()
        _atomic_write(state_path, existing)
    except Exception as e:
        logger.debug(f"Could not update voice_state: {e}")


def _atomic_write(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    tmp.rename(path)


def _iso_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
