import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env'), override: true });
import express from 'express';
import createDebug from 'debug';
import { switchTerminal, toggleMode, readState, writeVoiceInput, readVoiceState } from '../core/state.js';
import { emitVolumeEvent } from '../core/event-listener.js';

const debug = createDebug('tf:bridge');
const app = express();
app.use(express.json());

const PORT = parseInt(process.env.BRIDGE_PORT || '3333', 10);
const DEBOUNCE_MS = 300;

let lastPressTime = 0;

function isDebounced() {
  const now = Date.now();
  if (now - lastPressTime < DEBOUNCE_MS) {
    debug('debounced press ignored (< %dms)', DEBOUNCE_MS);
    return true;
  }
  lastPressTime = now;
  return false;
}

app.post('/volume', async (req, res) => {
  const { button } = req.body;

  if (!button || !['up', 'down', 'hold'].includes(button)) {
    return res.status(400).json({ error: 'Invalid button value. Must be "up", "down", or "hold".' });
  }

  if (isDebounced()) {
    return res.json({ status: 'debounced' });
  }

  try {
    if (button === 'hold') {
      const updated = await toggleMode();
      debug('hold event → mode toggled to %s', updated.mode);
      emitVolumeEvent('hold', { mode: updated.mode });
      return res.json({ status: 'ok', action: 'toggle-mode', mode: updated.mode });
    }

    const result = await switchTerminal(button);
    debug('volume %s → terminal %d → %d', button, result.from, result.to);
    emitVolumeEvent(button, result);
    return res.json({
      status: 'ok',
      action: 'switch',
      from: result.from,
      to: result.to,
      mode: result.state.mode,
    });
  } catch (err) {
    debug('error handling volume event: %s', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/state', async (_req, res) => {
  try {
    const state = await readState();
    return res.json(state);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'terminalforge-bridge', port: PORT });
});

// -- Voice endpoints -----------------------------------------------------------

/**
 * POST /voice
 * Called by the Python voice pipeline with transcribed text.
 * Reads activeTerminal from state.json, writes voice_input.json atomically.
 *
 * Body: { text: string, confidence?: number }
 */
app.post('/voice', async (req, res) => {
  const { text, confidence } = req.body;

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Missing or empty "text" field.' });
  }

  try {
    const state = await readState();
    const envelope = await writeVoiceInput({
      text:           text.trim(),
      targetTerminal: state.activeTerminal || 1,
      confidence:     typeof confidence === 'number' ? confidence : 1.0,
    });

    debug('voice input received: %j', envelope);
    return res.json({ status: 'ok', targetTerminal: envelope.targetTerminal });
  } catch (err) {
    debug('error handling voice input: %s', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /voice/state
 * Returns the current voice pipeline status (idle/recording/transcribing).
 * Used by the TUI status bar for the live voice indicator.
 */
app.get('/voice/state', async (_req, res) => {
  try {
    const state = await readVoiceState();
    return res.json(state);
  } catch (err) {
    return res.json({ status: 'idle', mode: 'push-to-talk', recording: false });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  debug('bridge server listening on http://127.0.0.1:%d', PORT);
  // eslint-disable-next-line no-console
  console.log(`TerminalForge bridge server running on http://127.0.0.1:${PORT}`);
});

export default app;
