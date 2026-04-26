/**
 * Phase 1 integration test — volume button switching
 *
 * Verifies:
 *   Vol DOWN 3× advances terminal 1→2→3
 *   Vol UP from 3 returns to 2, then 1, then 5 (wrap)
 *   Mode toggle (hold) switches manual ↔ auto
 *   State persists correctly in state.json after each press
 */

import { readState, writeState, navigate } from '../core/state.js';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';

let failures = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ${PASS}  ${label}`);
  } else {
    console.log(`  ${FAIL}  ${label}`);
    failures++;
  }
}

async function resetState() {
  await writeState({
    activeTerminal: 1,
    mode: 'manual',
    lastSwitch: new Date().toISOString(),
    autonomousStepCount: 0,
    terminalStatus: { '1': 'idle', '2': 'idle', '3': 'idle', '4': 'idle', '5': 'idle' },
  });
}

async function simulatePress(direction) {
  const state = await readState();
  const next = navigate(direction, state.activeTerminal);
  await writeState({ ...state, activeTerminal: next, lastSwitch: new Date().toISOString() });
  return next;
}

async function simulateHold() {
  const state = await readState();
  const newMode = state.mode === 'manual' ? 'auto' : 'manual';
  await writeState({ ...state, mode: newMode });
  return newMode;
}

// ── Navigation logic unit tests (no I/O) ───────────────────────────────────

console.log('\n── navigate() unit tests ──────────────────────────────────────');

assert(navigate('down', 1) === 2, 'down from 1 → 2');
assert(navigate('down', 2) === 3, 'down from 2 → 3');
assert(navigate('down', 3) === 4, 'down from 3 → 4');
assert(navigate('down', 4) === 5, 'down from 4 → 5');
assert(navigate('down', 5) === 1, 'down from 5 → 1 (wrap)');

assert(navigate('up', 1) === 5, 'up from 1 → 5 (wrap)');
assert(navigate('up', 2) === 1, 'up from 2 → 1');
assert(navigate('up', 3) === 2, 'up from 3 → 2');
assert(navigate('up', 4) === 3, 'up from 4 → 3');
assert(navigate('up', 5) === 4, 'up from 5 → 4');

// ── Integration tests (read/write state.json) ──────────────────────────────

console.log('\n── state.json integration tests ───────────────────────────────');

await resetState();

// Vol DOWN 3× advances terminal 1→2→3
const t1 = await simulatePress('down');
assert(t1 === 2, 'Vol DOWN from 1 → 2');

const t2 = await simulatePress('down');
assert(t2 === 3, 'Vol DOWN from 2 → 3');

const state3 = await readState();
assert(state3.activeTerminal === 3, 'state.json reflects terminal 3');

// Vol UP from 3 returns to 2, then 1, then 5 (wrap)
const t3 = await simulatePress('up');
assert(t3 === 2, 'Vol UP from 3 → 2');

const t4 = await simulatePress('up');
assert(t4 === 1, 'Vol UP from 2 → 1');

const t5 = await simulatePress('up');
assert(t5 === 5, 'Vol UP from 1 → 5 (wrap)');

const state5 = await readState();
assert(state5.activeTerminal === 5, 'state.json reflects terminal 5');

// Mode toggle
const mode1 = await simulateHold();
assert(mode1 === 'auto', 'hold toggles manual → auto');

const mode2 = await simulateHold();
assert(mode2 === 'manual', 'hold toggles auto → manual');

// Reset to clean state after tests
await resetState();

// ── Results ────────────────────────────────────────────────────────────────

console.log('');
if (failures === 0) {
  console.log('\x1b[32mAll tests passed.\x1b[0m\n');
  process.exit(0);
} else {
  console.log(`\x1b[31m${failures} test(s) failed.\x1b[0m\n`);
  process.exit(1);
}
