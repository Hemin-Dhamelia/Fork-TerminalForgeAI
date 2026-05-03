"""
voice/wake_word.py — Python-importable re-export of wake-word.py

Python cannot import files with hyphens in their name.
This module re-exports WakeWordDetector so the pipeline can do:
  from voice.wake_word import WakeWordDetector

The actual implementation lives in voice/wake-word.py (run as a standalone script).
"""

import importlib.util
import sys
from pathlib import Path

# Load wake-word.py dynamically (hyphen in filename requires importlib)
_spec = importlib.util.spec_from_file_location(
    "wake_word_impl",
    Path(__file__).parent / "wake-word.py",
)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["wake_word_impl"] = _mod
_spec.loader.exec_module(_mod)

# Re-export the class
WakeWordDetector = _mod.WakeWordDetector

__all__ = ["WakeWordDetector"]
