"""
voice/tts.py — Text-to-Speech output

Supports two providers:
  - "say"        macOS built-in `say` command (default, no API key needed)
  - "elevenlabs" ElevenLabs API (requires ELEVENLABS_API_KEY in .env)

TTS is OFF by default. Enable in .terminalforge/config.json:
  { "ttsEnabled": true, "ttsProvider": "say", "ttsVoice": "Samantha" }

Usage:
  from voice.tts import speak
  speak("Implementing the feature now", provider="say")
  speak("Done", provider="elevenlabs")
"""

import os
import sys
import subprocess
from typing import Optional
from loguru import logger


# -- macOS `say` TTS  -----------------------------------------------------------

# Available macOS voices (en-US): Samantha (default), Alex, Daniel, Karen, Moira
# Full list: say -v ?
DEFAULT_SAY_VOICE = "Samantha"
DEFAULT_SAY_RATE  = 180     # words per minute (default is ~180)


def speak_say(text: str, voice: str = DEFAULT_SAY_VOICE, rate: int = DEFAULT_SAY_RATE) -> bool:
    """
    Speak text using macOS built-in `say` command.
    Runs asynchronously (non-blocking) so TUI continues to update.

    Args:
        text:  text to speak
        voice: macOS voice name (e.g. "Samantha", "Alex", "Daniel")
        rate:  words per minute

    Returns:
        True if say command started successfully
    """
    if not text.strip():
        return False

    try:
        subprocess.Popen(
            ["say", "-v", voice, "-r", str(rate), text],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        logger.debug(f"TTS (say): {text!r}")
        return True
    except FileNotFoundError:
        logger.error("`say` command not found — TTS requires macOS")
        return False
    except Exception as e:
        logger.error(f"TTS (say) failed: {e}")
        return False


def speak_say_sync(text: str, voice: str = DEFAULT_SAY_VOICE, rate: int = DEFAULT_SAY_RATE) -> bool:
    """
    Speak text using macOS `say` — blocks until speech completes.
    Use when you need to wait before continuing (e.g. in tests).
    """
    if not text.strip():
        return False

    try:
        subprocess.run(
            ["say", "-v", voice, "-r", str(rate), text],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except Exception as e:
        logger.error(f"TTS (say sync) failed: {e}")
        return False


# -- ElevenLabs TTS  ------------------------------------------------------------

def speak_elevenlabs(
    text: str,
    voice_id: str = "EXAVITQu4vr4xnSDxMaL",  # "Bella" — pleasant female voice
    model_id: str = "eleven_turbo_v2",
) -> bool:
    """
    Speak text using ElevenLabs API.
    Requires ELEVENLABS_API_KEY in environment or .env file.
    Plays audio immediately using sounddevice.

    Args:
        text:     text to speak
        voice_id: ElevenLabs voice ID
        model_id: ElevenLabs model (eleven_turbo_v2 = lowest latency)

    Returns:
        True on success
    """
    api_key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not api_key:
        logger.error("ELEVENLABS_API_KEY not set. Add it to .env or use provider='say'")
        return False

    try:
        from elevenlabs import ElevenLabs, play  # type: ignore
        client = ElevenLabs(api_key=api_key)

        logger.debug(f"TTS (ElevenLabs): {text!r}")
        audio = client.generate(
            text=text,
            voice=voice_id,
            model=model_id,
        )
        play(audio)
        return True

    except ImportError:
        logger.error("ElevenLabs SDK not installed. Run: pip install elevenlabs")
        return False
    except Exception as e:
        logger.error(f"ElevenLabs TTS failed: {e}")
        return False


# -- Unified speak() interface ---------------------------------------------------

def speak(
    text: str,
    provider: str = "say",
    voice: Optional[str] = None,
    blocking: bool = False,
) -> bool:
    """
    Speak text using the specified provider.

    Args:
        text:     text to speak (skipped if empty)
        provider: "say" (default, macOS) or "elevenlabs"
        voice:    provider-specific voice name/ID (uses default if None)
        blocking: if True, wait until speech finishes (say only)

    Returns:
        True on success, False on failure
    """
    if not text.strip():
        return False

    if provider == "elevenlabs":
        return speak_elevenlabs(text, voice_id=voice or "EXAVITQu4vr4xnSDxMaL")

    # Default: macOS say
    say_voice = voice or DEFAULT_SAY_VOICE
    if blocking:
        return speak_say_sync(text, voice=say_voice)
    return speak_say(text, voice=say_voice)


# -- Standalone test -------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="TerminalForge TTS test")
    parser.add_argument("--provider", default="say",        choices=["say", "elevenlabs"])
    parser.add_argument("--voice",    default=None,         help="Voice name/ID")
    parser.add_argument("--text",     default="TerminalForge voice output test. Hello from the AI team.", help="Text to speak")
    args = parser.parse_args()

    logger.remove()
    logger.add(sys.stderr, level="INFO", format="<green>{time:HH:mm:ss}</green> | <level>{level}</level> | {message}")

    print(f"\n  TTS test — provider={args.provider}")
    print(f"  Text: {args.text!r}\n")

    success = speak(args.text, provider=args.provider, voice=args.voice, blocking=True)
    print(f"  Result: {'✓ OK' if success else '✗ FAILED'}")
