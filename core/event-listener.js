import { EventEmitter } from 'events';
import createDebug from 'debug';

const debug = createDebug('tf:core');

class TerminalForgeEventEmitter extends EventEmitter {}
const emitter = new TerminalForgeEventEmitter();

const AGENT_NAMES = {
  1: 'Junior Developer',
  2: 'Senior Developer',
  3: 'QA Engineer',
  4: 'DevOps Engineer',
  5: 'Project Manager',
};

/**
 * Called by bridge/server.js whenever a volume event arrives.
 * Emits the appropriate high-level event on the shared emitter.
 */
export function emitVolumeEvent(button, data) {
  if (button === 'hold') {
    debug('emitting mode:toggle → %s', data.mode);
    emitter.emit('mode:toggle', { mode: data.mode });
    return;
  }

  const { from, to, state } = data;
  const event = {
    from,
    to,
    fromName: AGENT_NAMES[from],
    toName: AGENT_NAMES[to],
    direction: button,
    mode: state.mode,
    terminalStatus: state.terminalStatus,
    timestamp: new Date().toISOString(),
  };

  debug('emitting agent:switch %d (%s) → %d (%s)', from, event.fromName, to, event.toName);
  emitter.emit('agent:switch', event);
}

/**
 * Register a listener for terminal switch events.
 * Callback receives: { from, to, fromName, toName, direction, mode, terminalStatus, timestamp }
 */
export function onAgentSwitch(callback) {
  emitter.on('agent:switch', callback);
}

/**
 * Register a listener for mode toggle events.
 * Callback receives: { mode }
 */
export function onModeToggle(callback) {
  emitter.on('mode:toggle', callback);
}

export { emitter };
