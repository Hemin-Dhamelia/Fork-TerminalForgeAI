"""
voice/vad.py — Microphone capture + Voice Activity Detection

Two recording modes:
  1. push_to_talk(state_path)   — polls voice_state.json; records while status="recording"
  2. record_auto_vad(model)     — continuous mic; silero-vad detects speech start/end

Both return a float32 numpy array ready for transcription.

Usage:
    from voice.vad import load_vad_model, record_push_to_talk, record_auto_vad
"""

import json
import time
import threading
import numpy as np
from pathlib import Path
from typing import Optional
from loguru import logger

SAMPLE_RATE    = 16000      # Hz — required by Whisper and silero-vad
CHUNK_SAMPLES  = 512        # silero-vad v5 requires exactly 512 samples @ 16kHz
CHUNK_DURATION = CHUNK_SAMPLES / SAMPLE_RATE   # ~0.032s per chunk
SILENCE_MS     = 1500       # ms of silence before ending auto-vad recording
MAX_RECORD_SEC = 60         # hard cap — prevent runaway recordings
MIN_SPEECH_SEC = 0.3        # discard recordings shorter than this


def load_vad_model():
    """
    Load silero-vad model. Returns (model, VADIterator class).
    Cached after first load.
    """
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
    """
    Push-to-talk recording: blocks until voice_state.json status changes from
    "recording" back to "idle" (or timeout reached).

    voice_state.json must already have status="recording" when this is called.
    The hotkey-fallback.js sets that field when the user presses the toggle.

    Args:
        state_path: path to .terminalforge/voice_state.json
        timeout:    maximum recording seconds

    Returns:
        float32 mono numpy array at SAMPLE_RATE, or None on error
    """
    try:
        import sounddevice as sd  # type: ignore
    except ImportError:
        logger.error("sounddevice not installed. Run: pip install sounddevice")
        return None

    logger.info("Push-to-talk: recording...")
    chunks: list[np.ndarray] = []
    start_time = time.monotonic()

    def audio_callback(indata: np.ndarray, frames: int, time_info, status) -> None:
        if status:
            logger.debug(f"Audio stream status: {status}")
        chunks.append(indata.copy())

    with sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="float32",
        blocksize=CHUNK_SAMPLES,
        callback=audio_callback,
    ):
        while True:
            elapsed = time.monotonic() - start_time
            if elapsed >= timeout:
                logger.warning(f"Push-to-talk: hit {timeout}s timeout")
                break

            # Poll voice_state.json for stop signal
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
    logger.info(f"Push-to-talk: captured {duration:.2f}s of audio")

    if duration < MIN_SPEECH_SEC:
        logger.debug("Recording too short — discarding")
        return None

    return audio


def record_auto_vad(
    vad_model,
    vad_iterator_class,
    state_path: Optional[Path] = None,
    silence_ms: int = SILENCE_MS,
    timeout: float = MAX_RECORD_SEC,
) -> Optional[np.ndarray]:
    """
    Automatic VAD recording: captures mic continuously, returns audio when
    silero-vad detects speech followed by a silence gap.

    Args:
        vad_model:            loaded silero-vad model
        vad_iterator_class:   VADIterator class from silero_vad
        state_path:           optional path to write status updates
        silence_ms:           ms of silence before ending capture
        timeout:              max recording seconds

    Returns:
        float32 mono numpy array at SAMPLE_RATE, or None if nothing detected
    """
    try:
        import sounddevice as sd  # type: ignore
        import torch  # type: ignore
    except ImportError as e:
        logger.error(f"Missing dependency: {e}")
        return None

    vad_iter = vad_iterator_class(
        vad_model,
        threshold=0.5,
        sampling_rate=SAMPLE_RATE,
        min_silence_duration_ms=silence_ms,
        speech_pad_ms=100,
    )

    logger.info("Auto-VAD: listening for speech...")
    _update_status(state_path, "listening")

    all_chunks:    list[np.ndarray] = []
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
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="float32",
        blocksize=CHUNK_SAMPLES,
        callback=audio_callback,
    ):
        while True:
            if time.monotonic() - start_time > timeout:
                logger.warning("Auto-VAD: timeout reached without complete utterance")
                break

            # Drain queue
            with lock:
                pending = audio_queue.copy()
                audio_queue.clear()

            for chunk in pending:
                chunk_mono = chunk.flatten()
                all_chunks.append(chunk_mono)

                # Run VAD on chunk
                chunk_tensor = torch.from_numpy(chunk_mono)
                speech_event = vad_iter(chunk_tensor, return_seconds=False)

                if speech_event and "start" in speech_event:
                    logger.debug("VAD: speech start detected")
                    in_speech      = True
                    speech_started = True
                    silence_start  = None
                    _update_status(state_path, "recording")

                if in_speech:
                    speech_chunks.append(chunk_mono)

                if speech_event and "end" in speech_event:
                    logger.debug("VAD: speech end detected")
                    in_speech     = False
                    silence_start = time.monotonic()

                # End after silence gap following speech
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

    audio = np.concatenate(speech_chunks).flatten()
    duration = len(audio) / SAMPLE_RATE
    logger.info(f"Auto-VAD: captured {duration:.2f}s of speech")

    if duration < MIN_SPEECH_SEC:
        logger.debug("Captured speech too short — discarding")
        _update_status(state_path, "idle")
        return None

    return audio


def _update_status(state_path: Optional[Path], status: str) -> None:
    """Write status field to voice_state.json atomically."""
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
        logger.debug(f"Could not update voice_state status: {e}")


def _atomic_write(path: Path, data: dict) -> None:
    """Write JSON atomically using a tmp file + rename (atomic on macOS)."""
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    tmp.rename(path)


def _iso_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# -- Standalone test --------------------------------------------------------------

if __name__ == "__main__":
    from pathlib import Path

    STATE = Path(__file__).parent.parent / ".terminalforge" / "voice_state.json"
    STATE.parent.mkdir(exist_ok=True)

    logger.info("Testing auto-VAD recording (speak something, then pause)...")
    model, VADIterator = load_vad_model()
    audio = record_auto_vad(model, VADIterator, state_path=STATE)

    if audio is not None:
        logger.success(f"Captured {len(audio)/SAMPLE_RATE:.2f}s — ready for transcription")
    else:
        logger.warning("No speech captured")
