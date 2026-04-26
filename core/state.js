import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import createDebug from 'debug';

const debug = createDebug('tf:core');

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, '..', '.terminalforge', 'state.json');
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
    const dir = dirname(STATE_PATH);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
    debug('state written: activeTerminal=%d mode=%s', state.activeTerminal, state.mode);
  } catch (err) {
    throw new Error(`Failed to write state.json: ${err.message}`);
  }
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
