#!/usr/bin/env node
/**
 * bridge/hotkey-fallback.js — Push-to-Talk keyboard controller
 *
 * Runs in a separate terminal alongside the TUI or agent REPLs.
 * Controls the voice pipeline via keyboard — no iPhone needed.
 *
 *   SPACEBAR   — toggle recording on/off (push-to-talk)
 *   R          — same as spacebar (alternative key)
 *   ESC        — cancel recording without transcribing
 *   Q / Ctrl+C — quit
 *
 * What it does:
 *   - Writes .terminalforge/voice_state.json to signal the Python voice pipeline
 *   - Python pipeline polls voice_state.json and starts/stops recording
 *   - After recording stops, Python transcribes and POSTs to localhost:3333/voice
 *   - Bridge server writes .terminalforge/voice_input.json
 *   - TUI picks it up and routes the text to the active agent
 *
 * Usage:
 *   node bridge/hotkey-fallback.js
 *   npm run voice:hotkey
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const TF_DIR     = join(__dirname, '..', '.terminalforge');
const STATE_PATH = join(TF_DIR, 'voice_state.json');
const TMP_PATH   = join(TF_DIR, 'voice_state.tmp.json');

// -- State ---------------------------------------------------------------------
let isRecording    = false;
let sessionStarted = new Date().toISOString();

// -- File helpers --------------------------------------------------------------
async function ensureDir() {
  if (!existsSync(TF_DIR)) {
    await mkdir(TF_DIR, { recursive: true });
  }
}

/**
 * Atomically write voice_state.json (write tmp → rename).
 * Atomic rename prevents partial reads by the Python pipeline.
 */
async function writeVoiceState(status, recording) {
  const state = {
    status,
    mode:             'push-to-talk',
    recording,
    wakeWordDetected: false,
    updatedAt:        new Date().toISOString(),
  };
  await writeFile(TMP_PATH, JSON.stringify(state, null, 2), 'utf8');
  // On the same filesystem, rename is atomic on macOS
  const { rename } = await import('fs/promises');
  await rename(TMP_PATH, STATE_PATH);
}

async function readVoiceState() {
  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { status: 'idle', recording: false };
  }
}

// -- Display helpers -----------------------------------------------------------
function clearLine() {
  process.stdout.clearLine?.(0);
  process.stdout.cursorTo?.(0);
}

function printStatus() {
  clearLine();
  if (isRecording) {
    process.stdout.write('  \x1b[33m🎤 RECORDING\x1b[0m  — press SPACE or R to stop, ESC to cancel');
  } else {
    process.stdout.write('  \x1b[90m⬜ Idle\x1b[0m         — press SPACE or R to start recording');
  }
}

function printBanner() {
  console.log('\n  \x1b[36mTerminalForge\x1b[0m — Voice Push-to-Talk Controller');
  console.log('  ─────────────────────────────────────────────────────');
  console.log('  SPACE / R   toggle recording on/off');
  console.log('  ESC         cancel recording (no transcription)');
  console.log('  Q / Ctrl+C  quit');
  console.log('  ─────────────────────────────────────────────────────');
  console.log('  Make sure voice/pipeline.py is running in another terminal:');
  console.log('    python3 voice/pipeline.py');
  console.log('');
}

// -- Toggle recording ----------------------------------------------------------
async function startRecording() {
  if (isRecording) return;
  isRecording = true;
  await writeVoiceState('recording', true);
  printStatus();
}

async function stopRecording(cancel = false) {
  if (!isRecording) return;
  isRecording = false;

  if (cancel) {
    await writeVoiceState('idle', false);
    clearLine();
    process.stdout.write('  \x1b[90m- Recording cancelled.\x1b[0m\n');
    setTimeout(printStatus, 800);
  } else {
    // Signal "transcribing" briefly so pipeline knows to process
    await writeVoiceState('idle', false);
    clearLine();
    process.stdout.write('  \x1b[32m✓ Stopped — pipeline will transcribe...\x1b[0m\n');
    setTimeout(printStatus, 1500);
  }
}

// -- Keyboard input -----------------------------------------------------------
async function setupKeyboard() {
  await ensureDir();
  await writeVoiceState('idle', false);

  // Enable raw keypress events on stdin
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  process.stdin.on('keypress', async (str, key) => {
    if (!key) return;

    // Ctrl+C or Q → quit
    if ((key.ctrl && key.name === 'c') || key.name === 'q') {
      if (isRecording) await stopRecording(true);
      await writeVoiceState('idle', false);
      console.log('\n\n  Voice controller stopped.\n');
      process.exit(0);
    }

    // ESC → cancel recording
    if (key.name === 'escape') {
      if (isRecording) {
        await stopRecording(true);
      }
      return;
    }

    // SPACE or R → toggle
    if (key.name === 'space' || str === 'r' || str === 'R') {
      if (isRecording) {
        await stopRecording(false);
      } else {
        await startRecording();
      }
      return;
    }

    // F5 → same as space (for users who prefer the spec key)
    if (key.name === 'f5') {
      if (isRecording) {
        await stopRecording(false);
      } else {
        await startRecording();
      }
      return;
    }
  });
}

// -- Poll for pipeline feedback (show transcription status) -------------------
async function pollPipelineStatus() {
  setInterval(async () => {
    const state = await readVoiceState();
    if (!isRecording) {
      if (state.status === 'transcribing') {
        clearLine();
        process.stdout.write('  \x1b[35m⌨  Transcribing...\x1b[0m');
      } else if (state.status === 'idle' && state.updatedAt) {
        // Just finished — status bar already showed result
      }
    }
  }, 300);
}

// -- Main ----------------------------------------------------------------------
async function main() {
  printBanner();
  await setupKeyboard();
  await pollPipelineStatus();
  printStatus();
}

main().catch(err => {
  console.error('\n  hotkey-fallback error:', err.message);
  process.exit(1);
});
