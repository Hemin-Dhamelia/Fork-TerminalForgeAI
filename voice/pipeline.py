"""
voice/pipeline.py — Main voice pipeline coordinator

Runs the full voice → text → active agent pipeline:
  mic → silero-vad → faster-whisper → POST /voice on bridge (localhost:3333)

Modes:
  push-to-talk  (default) — toggle with spacebar via bridge/hotkey-fallback.js
  auto-vad                — continuous listening; silero-vad detects speech end
  wake-word               — say "Hey Forge" to activate (requires openwakeword)

Usage:
  python3 voice/pipeline.py                     # push-to-talk mode
  python3 voice/pipeline.py --mode auto-vad     # always-listening mode
  python3 voice/pipeline.py --mode wake-word    # wake word mode
  python3 voice/pipeline.py --debug             # verbose logging

The pipeline posts transcribed text to localhost:3333/voice.
The bridge server writes .terminalforge/voice_input.json.
The TUI polls that file every 500ms and auto-submits the text to the active agent.
"""

import argparse
import json
import sys
import time
from pathlib import Path
from datetime import datetime, timezone

# Ensure the project root is on sys.path so `from voice.X import Y` always works,
# regardless of whether this file is run as a script or with python3 -m voice.pipeline
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import requests  # type: ignore
from loguru import logger

# -- Paths -----------------------------------------------------------------------
ROOT          = Path(__file__).parent.parent
TF_DIR        = ROOT / ".terminalforge"
VOICE_STATE   = TF_DIR / "voice_state.json"
CONFIG_PATH   = TF_DIR / "config.json"
BRIDGE_URL    = "http://127.0.0.1:3333"

SAMPLE_RATE   = 16000


# -- Config helpers --------------------------------------------------------------

def _load_config() -> dict:
    """Load .terminalforge/config.json or return defaults."""
    defaults = {
        "voiceMode": "push-to-talk",
        "whisperModel": "base.en",
        "vadSilenceMs": 1500,
        "ttsEnabled": False,
        "ttsProvider": "say",
        "debugVoice": False,
    }
    try:
        if CONFIG_PATH.exists():
            data = json.loads(CONFIG_PATH.read_text())
            return {**defaults, **data}
    except Exception:
        pass
    return defaults


def _write_voice_state(status: str, mode: str, recording: bool = False) -> None:
    """Atomically update voice_state.json."""
    TF_DIR.mkdir(exist_ok=True)
    state = {
        "status":           status,
        "mode":             mode,
        "recording":        recording,
        "wakeWordDetected": False,
        "updatedAt":        datetime.now(timezone.utc).isoformat(),
    }
    tmp = VOICE_STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.rename(VOICE_STATE)


def _read_voice_state() -> dict:
    """Read current voice_state.json."""
    try:
        return json.loads(VOICE_STATE.read_text())
    except Exception:
        return {"status": "idle", "recording": False}


# -- Bridge communication --------------------------------------------------------

def _post_transcription(text: str, confidence: float = 1.0) -> bool:
    """
    POST transcribed text to the bridge server.
    Bridge server writes to voice_input.json and TUI picks it up.

    Returns True on success, False on failure.
    """
    try:
        resp = requests.post(
            f"{BRIDGE_URL}/voice",
            json={"text": text, "confidence": confidence},
            timeout=3,
        )
        if resp.status_code == 200:
            logger.success(f"Sent to bridge: {text!r}")
            return True
        else:
            logger.error(f"Bridge returned {resp.status_code}: {resp.text}")
            return False
    except requests.ConnectionError:
        logger.error(f"Bridge server not running at {BRIDGE_URL}. Start it with: npm start")
        return False
    except Exception as e:
        logger.error(f"Failed to post to bridge: {e}")
        return False


# -- Push-to-talk mode -----------------------------------------------------------

def run_push_to_talk(transcriber, config: dict) -> None:
    """
    Push-to-talk loop using PersistentMic — mic stays open, recording starts instantly.
    Space key in the TUI (or hotkey-fallback.js) writes voice_state.json status="recording".
    """
    from voice.vad import PersistentMic, record_push_to_talk_fast  # type: ignore

    # Open mic stream ONCE — eliminates the 2.3s open overhead on every press
    mic = PersistentMic()
    mic.open()

    logger.info("Push-to-talk mode ready — press Space in the TUI to record.")
    logger.info("Press Ctrl+C to stop the pipeline.")
    print("\n  TerminalForge Voice Pipeline (push-to-talk)")
    print("  Press Space in the TUI to start/stop recording")
    print("  Press Ctrl+C to stop\n")

    _write_voice_state("idle", "push-to-talk")
    tts_enabled = config.get("ttsEnabled", False)

    try:
        while True:
            state = _read_voice_state()
            if state.get("status") == "recording":
                print("  🎤 Recording...", flush=True)

                # record_push_to_talk_fast uses the already-open stream — no delay
                audio = record_push_to_talk_fast(mic, VOICE_STATE)

                if audio is not None:
                    print("  ⌨  Transcribing...", flush=True)
                    _write_voice_state("transcribing", "push-to-talk")
                    t0    = time.monotonic()
                    text  = transcriber.transcribe(audio)
                    t_ms  = (time.monotonic() - t0) * 1000

                    if text:
                        print(f"  ✓ [{t_ms:.0f}ms] {text!r}", flush=True)
                        _post_transcription(text)
                        if tts_enabled:
                            from voice.tts import speak  # type: ignore
                            speak(text, provider=config.get("ttsProvider", "say"))
                    else:
                        print("  - Nothing detected", flush=True)
                else:
                    print("  - Too short / no audio", flush=True)

                _write_voice_state("idle", "push-to-talk")
                print("  Ready — press Space to record again\n", flush=True)

            time.sleep(0.02)  # 20ms poll — was 50ms
    finally:
        mic.close()


# -- Auto-VAD mode ---------------------------------------------------------------

def run_auto_vad(transcriber, config: dict) -> None:
    """
    Continuous VAD loop: silero-vad listens for speech automatically.
    No button press needed — silence > 1.5s ends each utterance.
    """
    from voice.vad import load_vad_model, record_auto_vad  # type: ignore

    logger.info("Loading silero-vad model for auto-VAD mode...")
    vad_model, VADIterator = load_vad_model()

    logger.info("Auto-VAD mode ready. Speak naturally — pause 1.5s to send.")
    print("\n  TerminalForge Voice Pipeline (auto-vad)")
    print("  Speak naturally — 1.5s pause sends to active agent")
    print("  Press Ctrl+C to stop\n")

    _write_voice_state("listening", "auto-vad")
    tts_enabled = config.get("ttsEnabled", False)
    silence_ms  = config.get("vadSilenceMs", 1500)

    while True:
        print("  👂 Listening...")
        audio = record_auto_vad(
            vad_model,
            VADIterator,
            state_path=VOICE_STATE,
            silence_ms=silence_ms,
        )

        if audio is not None:
            print("  ⌨  Transcribing...")
            _write_voice_state("transcribing", "auto-vad")
            text = transcriber.transcribe(audio)

            if text:
                print(f"  ✓ Transcribed: {text!r}")
                _post_transcription(text)
                if tts_enabled:
                    from voice.tts import speak  # type: ignore
                    speak(text, provider=config.get("ttsProvider", "say"))
            else:
                print("  - Nothing detected")

        _write_voice_state("listening", "auto-vad")
        time.sleep(0.1)


# -- Wake-word mode --------------------------------------------------------------

def run_wake_word(transcriber, config: dict) -> None:
    """
    Wake-word mode: listens for "Hey Forge", then captures one utterance.
    Requires openwakeword to be installed.
    """
    try:
        from voice.wake_word import WakeWordDetector  # type: ignore
    except ImportError:
        logger.error("wake-word mode requires openwakeword: pip install openwakeword")
        sys.exit(1)

    from voice.vad import load_vad_model, record_auto_vad  # type: ignore

    logger.info("Loading wake word detector + silero-vad...")
    vad_model, VADIterator = load_vad_model()
    detector = WakeWordDetector()
    detector.load()

    logger.info('Wake-word mode: say "Hey Forge" to activate.')
    print('\n  TerminalForge Voice Pipeline (wake-word)')
    print('  Say "Hey Forge" to activate, then speak your prompt')
    print("  Press Ctrl+C to stop\n")

    _write_voice_state("listening", "wake-word")
    tts_enabled = config.get("ttsEnabled", False)
    silence_ms  = config.get("vadSilenceMs", 1500)

    while True:
        print('  👂 Waiting for "Hey Forge"...')
        detected = detector.listen_for_wake_word()

        if detected:
            print("  ✓ Wake word detected! Listening for prompt...")
            _write_voice_state("recording", "wake-word", recording=True)

            audio = record_auto_vad(
                vad_model,
                VADIterator,
                state_path=VOICE_STATE,
                silence_ms=silence_ms,
                timeout=15.0,
            )

            if audio is not None:
                print("  ⌨  Transcribing...")
                _write_voice_state("transcribing", "wake-word")
                text = transcriber.transcribe(audio)

                if text:
                    print(f"  ✓ Transcribed: {text!r}")
                    _post_transcription(text)
                    if tts_enabled:
                        from voice.tts import speak  # type: ignore
                        speak(text, provider=config.get("ttsProvider", "say"))
                else:
                    print("  - Nothing detected after wake word")

        _write_voice_state("listening", "wake-word")
        time.sleep(0.1)


# -- Entry point -----------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="TerminalForge Voice Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Modes:
  push-to-talk  Toggle recording with spacebar via bridge/hotkey-fallback.js (default)
  auto-vad      Always listening; 1.5s pause ends each utterance
  wake-word     Say "Hey Forge" to start listening

Examples:
  python3 voice/pipeline.py
  python3 voice/pipeline.py --mode auto-vad
  python3 voice/pipeline.py --model small.en --mode push-to-talk
        """,
    )
    parser.add_argument("--mode",  default=None,       help="Voice mode override")
    parser.add_argument("--model", default=None,       help="Whisper model override (e.g. small.en)")
    parser.add_argument("--debug", action="store_true", help="Verbose debug logging")
    args = parser.parse_args()

    # Configure logging
    logger.remove()
    if args.debug:
        logger.add(sys.stderr, level="DEBUG", format="<green>{time:HH:mm:ss}</green> | <level>{level}</level> | {message}")
    else:
        logger.add(sys.stderr, level="INFO", format="<green>{time:HH:mm:ss}</green> | <level>{level}</level> | {message}")

    # Load config
    config = _load_config()
    mode   = args.mode or config.get("voiceMode", "push-to-talk")
    model  = args.model or config.get("whisperModel", "base.en")

    logger.info(f"Starting voice pipeline — mode={mode} model={model}")

    # Ensure .terminalforge dir exists
    TF_DIR.mkdir(exist_ok=True)

    # Load transcriber
    from voice.transcriber import Transcriber  # type: ignore
    transcriber = Transcriber(model_size=model)
    transcriber.load()

    # Pre-warm: run one silent inference so the first real transcription is fast
    # (CTranslate2 JIT-compiles kernels on first call — ~600ms overhead without warmup)
    logger.info("Pre-warming transcriber...")
    import numpy as _np
    transcriber.transcribe(_np.zeros(16000, dtype=_np.float32))
    del _np
    logger.success("Transcriber warmed up — first transcription will be fast")

    # Run selected mode
    try:
        if mode == "push-to-talk":
            run_push_to_talk(transcriber, config)
        elif mode == "auto-vad":
            run_auto_vad(transcriber, config)
        elif mode == "wake-word":
            run_wake_word(transcriber, config)
        else:
            logger.error(f"Unknown mode: {mode}. Use push-to-talk, auto-vad, or wake-word")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n\n  Voice pipeline stopped.")
        _write_voice_state("idle", mode)
        sys.exit(0)


if __name__ == "__main__":
    main()
