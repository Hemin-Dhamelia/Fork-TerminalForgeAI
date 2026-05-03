import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import createDebug from 'debug';

const debug = createDebug('tf:core');

const __dirname      = dirname(fileURLToPath(import.meta.url));
const TF_DIR         = join(__dirname, '..', '.terminalforge');
const STATE_PATH     = join(TF_DIR, 'state.json');
const VOICE_IN_PATH  = join(TF_DIR, 'voice_input.json');
const VOICE_ST_PATH  = join(TF_DIR, 'voice_state.json');
const TOTAL_TERMINALS = 5;

const DEFAULT_STATE = {
  activeTerminal: 1,
  mode: 'manual',
  lastSwitch: new Date().toISOString(),
  autonomousStepCount: 0,
  terminalStatus: {
    '1': 'idle',
    '2': 'idle',
    '3': 'idle',
    '4': 'idle',
    '5': 'idle',
  },
};

export async function readState() {
  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    debug('state.json not found — writing default state');
    await writeState(DEFAULT_STATE);
    return { ...DEFAULT_STATE };
  }
}

export async function writeState(state) {
  try {
    if (!existsSync(TF_DIR)) {
      await mkdir(TF_DIR, { recursive: true });
    }
    await writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
    debug('state written: activeTerminal=%d mode=%s', state.activeTerminal, state.mode);
  } catch (err) {
    throw new Error(`Failed to write state.json: ${err.message}`);
  }
}

// -- Atomic write helper -------------------------------------------------------
async function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  if (!existsSync(TF_DIR)) {
    await mkdir(TF_DIR, { recursive: true });
  }
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmp, filePath);  // atomic on macOS (same filesystem)
}

// -- Voice input (written by bridge, polled by TUI) ----------------------------

/**
 * Write a new voice input envelope to voice_input.json.
 * Called by bridge/server.js POST /voice after receiving transcription from Python.
 *
 * @param {{ text: string, targetTerminal: number, confidence: number }} opts
 * @returns {object} the written envelope
 */
export async function writeVoiceInput({ text, targetTerminal = 1, confidence = 1.0 }) {
  const envelope = {
    text,
    targetTerminal,
    confidence,
    consumed:  false,
    timestamp: new Date().toISOString(),
  };
  await atomicWrite(VOICE_IN_PATH, envelope);
  debug('voice input written: terminal=%d text=%s', targetTerminal, text.slice(0, 40));
  return envelope;
}

/**
 * Read the current voice_input.json.
 * Returns null if the file doesn't exist or cannot be parsed.
 */
export async function readVoiceInput() {
  try {
    const raw = await readFile(VOICE_IN_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Mark the voice input as consumed (TUI calls this after auto-submitting the text).
 */
export async function consumeVoiceInput() {
  try {
    const existing = await readVoiceInput();
    if (existing) {
      await atomicWrite(VOICE_IN_PATH, { ...existing, consumed: true });
    }
  } catch {
    /* non-fatal */
  }
}

// -- Voice state (written by Python pipeline / hotkey-fallback, polled by TUI) -

/**
 * Read the current voice pipeline state from voice_state.json.
 * Returns default "idle" state if file not found.
 */
export async function readVoiceState() {
  try {
    const raw = await readFile(VOICE_ST_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { status: 'idle', mode: 'push-to-talk', recording: false };
  }
}

/**
 * Write voice pipeline state to voice_state.json.
 * Used by tests and the bridge server — Python and hotkey-fallback.js
 * write this file directly via their own atomic write logic.
 */
export async function writeVoiceState(state) {
  await atomicWrite(VOICE_ST_PATH, {
    status:           state.status || 'idle',
    mode:             state.mode || 'push-to-talk',
    recording:        state.recording || false,
    wakeWordDetected: state.wakeWordDetected || false,
    updatedAt:        new Date().toISOString(),
  });
}

export function navigate(direction, currentTerminal) {
  if (direction === 'down') {
    return (currentTerminal % TOTAL_TERMINALS) + 1;
  }
  if (direction === 'up') {
    return ((currentTerminal - 2 + TOTAL_TERMINALS) % TOTAL_TERMINALS) + 1;
  }
  throw new Error(`Unknown navigation direction: ${direction}`);
}

export async function switchTerminal(direction) {
  const state = await readState();
  const prev = state.activeTerminal;
  const next = navigate(direction, prev);
  const updated = {
    ...state,
    activeTerminal: next,
    lastSwitch: new Date().toISOString(),
  };
  await writeState(updated);
  debug('switched terminal %d → %d (%s)', prev, next, direction);
  return { from: prev, to: next, state: updated };
}

export async function toggleMode() {
  const state = await readState();
  const newMode = state.mode === 'manual' ? 'auto' : 'manual';
  const updated = {
    ...state,
    mode: newMode,
    autonomousStepCount: newMode === 'auto' ? 0 : state.autonomousStepCount,
  };
  await writeState(updated);
  debug('mode toggled: %s → %s', state.mode, newMode);
  return updated;
}

export async function setTerminalStatus(terminalIndex, status) {
  const validStatuses = ['idle', 'working', 'done', 'failed'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid terminal status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
  }
  const state = await readState();
  const updated = {
    ...state,
    terminalStatus: {
      ...state.terminalStatus,
      [String(terminalIndex)]: status,
    },
  };
  await writeState(updated);
  debug('terminal %d status → %s', terminalIndex, status);
  return updated;
}

export async function incrementAutonomousStep() {
  const state = await readState();
  const updated = {
    ...state,
    autonomousStepCount: state.autonomousStepCount + 1,
  };
  await writeState(updated);
  return updated;
}
