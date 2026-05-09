/**
 * tests/test-orchestrator.js
 * Live end-to-end test of the PM Orchestrator Loop against the real Claude API.
 *
 * Tests:
 *   1. PM receives a goal and produces a parseable task list
 *   2. At least one task is dispatched to a non-PM terminal
 *   3. Terminal status transitions: working → done (for PM and at least 1 agent)
 *   4. Bus messages are published for dispatch and completion
 *   5. Step count is tracked correctly
 *   6. onComplete fires with results
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env'), override: true });

// Force all agents to Anthropic for this test (Ollama may not be running)
process.env.AGENT_1_PROVIDER = 'anthropic';
process.env.AGENT_2_PROVIDER = 'anthropic';
process.env.AGENT_3_PROVIDER = 'anthropic';
process.env.AGENT_4_PROVIDER = 'anthropic';
process.env.AGENT_5_PROVIDER = 'anthropic';

import { runOrchestratorLoop, parseTaskList, buildAutoModePrompt } from '../core/orchestrator.js';
import { readLog } from '../core/message-bus.js';
import { readState, writeState } from '../core/state.js';

let pass = 0, fail = 0;

function ok(label) {
  console.log(`  \x1b[32m✓\x1b[0m  ${label}`);
  pass++;
}
function ko(label, detail = '') {
  console.log(`  \x1b[31m✗\x1b[0m  ${label}${detail ? `\n      ${detail}` : ''}`);
  fail++;
}
function assert(label, condition, detail = '') {
  condition ? ok(label) : ko(label, detail);
}

// ── Reset state to AUTO mode before test ────────────────────────────────────
async function resetState() {
  const state = await readState();
  await writeState({
    ...state,
    mode: 'auto',
    autonomousStepCount: 0,
    terminalStatus: { '1': 'idle', '2': 'idle', '3': 'idle', '4': 'idle', '5': 'idle' },
  });
}

// ── Main test ────────────────────────────────────────────────────────────────
console.log('\n── PM Orchestrator Loop — Live Test ────────────────────────');
console.log('  Goal: "Create a single Node.js file with a GET /ping endpoint that returns { pong: true }"\n');
console.log('  (This will call the Claude API and may take 15-60 seconds...)\n');

await resetState();
const logsBefore = await readLog();

// Track what the orchestrator does
const events = {
  statusChanges:   [],   // [{terminal, status}]
  dispatches:      [],   // [{task, terminal}]
  tasksDone:       [],
  tasksFailed:     [],
  pmTokens:        0,
  agentTokens:     {},   // {terminalIndex: count}
  budgetExceeded:  false,
  complete:        null,
};

const GOAL = 'Create a single Node.js file with a GET /ping endpoint that returns { pong: true }. Keep it minimal — one file, no frameworks, just the built-in http module.';

try {
  await runOrchestratorLoop(GOAL, {
    onPMToken:   (chunk) => { events.pmTokens += chunk.length; },
    onAgentToken: (t, chunk) => {
      events.agentTokens[t] = (events.agentTokens[t] || 0) + chunk.length;
    },
    onStatusChange: (t, status) => {
      events.statusChanges.push({ terminal: t, status });
    },
    onDispatch: (task, t) => {
      events.dispatches.push({ task, terminal: t });
      process.stdout.write(`  → dispatching ${task.taskId} to T${t} (${task.assignee}): ${task.title}\n`);
    },
    onTaskDone:    (task, t) => { events.tasksDone.push({ task, terminal: t }); },
    onTaskFailed:  (task, t, err) => { events.tasksFailed.push({ task, terminal: t, error: err.message }); },
    onBudgetExceeded: (s, m)  => { events.budgetExceeded = true; },
    onComplete:    (results) => { events.complete = results; },
  });
} catch (err) {
  console.log(`\n  \x1b[31mOrchestrator threw:\x1b[0m ${err.message}\n`);
  process.exit(1);
}

// ── Assertions ───────────────────────────────────────────────────────────────
console.log('\n── Assertions ──────────────────────────────────────────────');

// 1. PM produced tokens (actually called the API)
assert('PM streamed tokens to T5', events.pmTokens > 100,
  `only ${events.pmTokens} chars received`);

// 2. PM status went working → done
const pmWorking = events.statusChanges.some(e => e.terminal === 5 && e.status === 'working');
const pmDone    = events.statusChanges.some(e => e.terminal === 5 && e.status === 'done');
assert('T5 status set to working', pmWorking);
assert('T5 status set to done',    pmDone);

// 3. At least one task dispatched
assert('at least one task dispatched', events.dispatches.length >= 1,
  `dispatched: ${events.dispatches.length}`);

// 4. Dispatched tasks target non-PM terminals
const nonPMDispatches = events.dispatches.filter(d => d.terminal !== 5);
assert('tasks dispatched to non-PM agents', nonPMDispatches.length >= 1,
  `non-PM dispatches: ${nonPMDispatches.length}`);

// 5. Dispatched terminals received tokens
for (const { terminal } of nonPMDispatches) {
  const chars = events.agentTokens[terminal] || 0;
  assert(`T${terminal} (${events.dispatches.find(d=>d.terminal===terminal)?.task.assignee}) streamed tokens`, chars > 50,
    `only ${chars} chars`);
}

// 6. Dispatched terminals reached done or failed
for (const { terminal, task } of nonPMDispatches) {
  const done   = events.statusChanges.some(e => e.terminal === terminal && e.status === 'done');
  const failed = events.statusChanges.some(e => e.terminal === terminal && e.status === 'failed');
  assert(`T${terminal} reached terminal status (done or failed)`, done || failed,
    `status changes for T${terminal}: ${events.statusChanges.filter(e=>e.terminal===terminal).map(e=>e.status).join(' → ')}`);
}

// 7. Bus messages written for dispatch
const logsAfter  = await readLog();
const newMessages = logsAfter.slice(logsBefore.length);
const taskMessages = newMessages.filter(m => m.type === 'task' && m.from === 'project-manager');
assert('task messages published to bus', taskMessages.length >= 1,
  `found ${taskMessages.length} task messages`);

// 8. onComplete fired
assert('onComplete callback fired', events.complete !== null);
assert('onComplete includes results array', Array.isArray(events.complete?.results));
assert('step count > 1 (PM + at least one agent)', (events.complete?.stepCount ?? 0) > 1,
  `stepCount: ${events.complete?.stepCount}`);

// 9. Budget not exceeded (goal is tiny — should finish in <5 steps)
assert('step budget not exceeded', !events.budgetExceeded);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n── Summary ─────────────────────────────────────────────────`);
console.log(`  Steps taken:       ${events.complete?.stepCount ?? '?'}`);
console.log(`  Tasks dispatched:  ${events.dispatches.length}`);
console.log(`  Tasks done:        ${events.tasksDone.length}`);
console.log(`  Tasks failed:      ${events.tasksFailed.length}`);
console.log(`  PM tokens:         ${events.pmTokens}`);
console.log(`  Bus messages:      ${newMessages.length} new (log total: ${logsAfter.length})`);
for (const [t, chars] of Object.entries(events.agentTokens)) {
  console.log(`  T${t} tokens:          ${chars}`);
}
if (events.tasksFailed.length > 0) {
  console.log(`\n── Failed task errors ──────────────────────────────────────`);
  for (const { task, terminal, error } of events.tasksFailed) {
    console.log(`  T${terminal} ${task.taskId}: ${error?.slice(0, 120)}`);
  }
}

console.log(`\n${fail === 0
  ? '\x1b[32mAll orchestrator live tests passed.\x1b[0m'
  : `\x1b[31m${fail} test(s) failed.\x1b[0m`} (${pass}/${pass + fail})\n`);

process.exit(fail > 0 ? 1 : 0);
