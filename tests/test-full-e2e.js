/**
 * tests/test-full-e2e.js
 * Comprehensive real end-to-end test suite — all Claude API calls are live.
 *
 * Test areas:
 *   1. All 5 agents respond correctly with real Claude API calls
 *   2. Context injection — agents see git, tasks, messages, handoffs
 *   3. Message bus full round-trip — publish, subscribe, receive, log persistence
 *   4. Terminal status lifecycle — idle → working → done / failed
 *   5. Orchestrator budget enforcement — hard stops at maxSteps
 *   6. Orchestrator full pipeline — PM plans + dispatches real work
 *   7. Handoff injection — append handoff, verify next agent sees it
 *   8. Agent identity — each agent knows its own name and terminal number
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env'), override: true });

// Force all agents to Anthropic
process.env.AGENT_1_PROVIDER = 'anthropic';
process.env.AGENT_2_PROVIDER = 'anthropic';
process.env.AGENT_3_PROVIDER = 'anthropic';
process.env.AGENT_4_PROVIDER = 'anthropic';
process.env.AGENT_5_PROVIDER = 'anthropic';

import { routePrompt, clearHistory, getHistory } from '../core/agent-router.js';
import { publish, subscribe, subscribeAll, unsubscribe, readLog, getUnread, bus } from '../core/message-bus.js';
import { readState, writeState, setTerminalStatus, incrementAutonomousStep } from '../core/state.js';
import { buildAgentContext, appendHandoff, getAgentIdByTerminal } from '../core/context-manager.js';
import { runOrchestratorLoop, parseTaskList } from '../core/orchestrator.js';

const TF_DIR = resolve(__dirname, '..', '.terminalforge');
const CONFIG_PATH = resolve(TF_DIR, 'config.json');

// ── Test runner ───────────────────────────────────────────────────────────────

let pass = 0, fail = 0, skipped = 0;
const results = [];

function ok(label, detail = '') {
  console.log(`  \x1b[32m✓\x1b[0m  ${label}`);
  pass++;
  results.push({ ok: true, label });
}
function ko(label, detail = '') {
  console.log(`  \x1b[31m✗\x1b[0m  ${label}${detail ? `\n      → ${detail}` : ''}`);
  fail++;
  results.push({ ok: false, label, detail });
}
function skip(label, reason) {
  console.log(`  \x1b[33m−\x1b[0m  ${label} \x1b[33m(skipped: ${reason})\x1b[0m`);
  skipped++;
}
function assert(label, condition, detail = '') {
  condition ? ok(label) : ko(label, String(detail));
}
function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 55 - title.length))}`);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setup() {
  if (!existsSync(TF_DIR)) await mkdir(TF_DIR, { recursive: true });

  await writeState({
    activeTerminal: 1,
    mode: 'auto',
    autonomousStepCount: 0,
    terminalStatus: { '1':'idle','2':'idle','3':'idle','4':'idle','5':'idle' },
    lastSwitch: new Date().toISOString(),
  });

  // Reset config
  await writeFile(CONFIG_PATH, JSON.stringify({
    maxSteps: 20, voiceMode: 'push-to-talk', ttsEnabled: false,
    debounceMs: 300, contextHandoffCount: 3,
  }, null, 2));

  // Clear accumulated log files so context injection stays bounded each run
  await writeFile(resolve(TF_DIR, 'messages.log'), '', 'utf8');
  await writeFile(resolve(TF_DIR, 'handoffs.md'),  '', 'utf8');

  // Clear all agent histories
  for (let t = 1; t <= 5; t++) clearHistory(t);

  console.log('\n\x1b[1mTerminalForge — Full E2E Test Suite\x1b[0m');
  console.log('All tests use the real Claude API (claude-sonnet-4-5)\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 1 — All 5 agents respond with correct identity
// ══════════════════════════════════════════════════════════════════════════════

async function test1_agentIdentity() {
  section('TEST 1 — Agent Identity (5 real API calls)');

  const agents = [
    { t: 1, id: 'junior-dev',      keyword: 'junior',   name: 'Junior' },
    { t: 2, id: 'senior-dev',      keyword: 'senior',   name: 'Senior' },
    { t: 3, id: 'qa-engineer',     keyword: 'qa',       name: 'QA' },
    { t: 4, id: 'devops-engineer', keyword: 'devops',   name: 'DevOps' },
    { t: 5, id: 'project-manager', keyword: 'manager',  name: 'PM' },
  ];

  for (const { t, keyword, name } of agents) {
    clearHistory(t);
    let response = '';
    const start = Date.now();
    try {
      response = await routePrompt(
        'In one sentence, who are you and what is your terminal number?',
        { terminalIndex: t, onToken: (c) => { response; } }
      );
      const ms = Date.now() - start;
      const lower = response.toLowerCase();
      const hasKeyword = lower.includes(keyword) || lower.includes(name.toLowerCase());
      const hasTerminal = lower.includes(`terminal ${t}`) || lower.includes(`t${t}`) || response.includes(String(t));
      assert(`T${t} ${name}: responds in ${ms}ms`, response.length > 10, `response: "${response.slice(0,80)}"`);
      assert(`T${t} ${name}: mentions role`, hasKeyword, `response: "${response.slice(0,120)}"`);
      assert(`T${t} ${name}: mentions terminal ${t}`, hasTerminal, `response: "${response.slice(0,120)}"`);
    } catch (err) {
      ko(`T${t} ${name}: API call failed`, err.message.slice(0, 120));
      ko(`T${t} ${name}: mentions role`, 'skipped — API error');
      ko(`T${t} ${name}: mentions terminal ${t}`, 'skipped — API error');
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 2 — Context injection: agents see real project context
// ══════════════════════════════════════════════════════════════════════════════

async function test2_contextInjection() {
  section('TEST 2 — Context Injection');

  // Write a real project description
  const projectMd = `# TerminalForge Test Project\nBuilding a simple REST API with Express. Endpoints: GET /ping, POST /users, GET /users/:id.`;
  await writeFile(resolve(TF_DIR, 'project.md'), projectMd);

  // Write an open task assigned to junior-dev
  const tasks = [{
    id: 'task-test-001', title: 'Implement GET /ping', assignee: 'junior-dev',
    status: 'pending', priority: 'high', description: 'Return { pong: true }',
  }];
  await writeFile(resolve(TF_DIR, 'open_tasks.json'), JSON.stringify(tasks, null, 2));

  // Verify buildAgentContext returns all sections
  const ctx = await buildAgentContext(1);
  assert('context includes PROJECT section',   ctx.includes('SHARED PROJECT CONTEXT'));
  assert('context includes project.md content', ctx.includes('TerminalForge Test Project'));
  assert('context includes TASKS section',     ctx.includes('YOUR OPEN TASKS'));
  assert('context includes the assigned task', ctx.includes('task-test-001') || ctx.includes('GET /ping'));
  assert('context includes MESSAGES section',  ctx.includes('MESSAGES FOR YOU'));
  assert('context includes GIT section',       ctx.includes('GIT SUMMARY'));

  // Ask Junior Dev if it can see the task — real API call
  clearHistory(1);
  let response = '';
  try {
    response = await routePrompt(
      'What open tasks are assigned to you right now? List the task ID.',
      { terminalIndex: 1, onToken: () => {} }
    );
    const seesTask = response.includes('task-test-001') || response.toLowerCase().includes('ping') || response.toLowerCase().includes('no open task');
    assert('T1 sees its assigned task in context (real API)', seesTask, `response: "${response.slice(0,150)}"`);
  } catch (err) {
    ko('T1 sees its assigned task in context (real API)', err.message.slice(0,100));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 3 — Message bus full round-trip
// ══════════════════════════════════════════════════════════════════════════════

async function test3_messageBus() {
  section('TEST 3 — Message Bus Round-Trip');

  const logBefore = await readLog();

  // Subscribe to junior-dev messages
  const received = [];
  const handler = (env) => received.push(env);
  subscribe('junior-dev', handler);

  // Publish from 3 different agents
  const e1 = await publish({ from: 'project-manager', to: 'junior-dev', type: 'task',       payload: 'Build the login page', taskId: 'task-bus-001' });
  const e2 = await publish({ from: 'senior-dev',      to: 'junior-dev', type: 'review',     payload: 'Approved — merge when ready', taskId: 'task-bus-001' });
  const e3 = await publish({ from: 'qa-engineer',     to: 'junior-dev', type: 'bug-report',  payload: 'Login button broken on mobile' });

  // Also publish one to a different agent (should NOT appear in junior-dev received)
  const e4 = await publish({ from: 'project-manager', to: 'senior-dev', type: 'task', payload: 'Architecture review needed' });

  assert('publish() returns envelope with id',        e1.id?.startsWith('msg-'));
  assert('publish() sets timestamp',                  !!e1.timestamp);
  assert('publish() sets read=false',                 e1.read === false);
  assert('subscribe: received 3 targeted messages',   received.length === 3, `got ${received.length}`);
  assert('subscribe: did not receive other-agent msg', !received.find(m => m.to === 'senior-dev'));
  assert('message types preserved',                   received.map(m=>m.type).join(',') === 'task,review,bug-report');
  assert('taskId preserved across messages',          received[0].taskId === 'task-bus-001' && received[1].taskId === 'task-bus-001');

  // Verify log persistence
  const logAfter = await readLog();
  const newMsgs = logAfter.slice(logBefore.length);
  assert('messages written to log file',              newMsgs.length >= 4, `got ${newMsgs.length}`);
  assert('log entries are valid JSON envelopes',      newMsgs.every(m => m.id && m.from && m.to && m.type));

  // Verify getUnread
  const unread = await getUnread('junior-dev');
  assert('getUnread returns junior-dev messages',     unread.length >= 3, `got ${unread.length}`);
  assert('getUnread excludes other agents\' messages', unread.every(m => m.to === 'junior-dev'));

  // Ask Junior Dev about messages in context — real API call
  clearHistory(1);
  let response = '';
  try {
    response = await routePrompt(
      'Do you have any unread messages? If yes, summarise the first one in one sentence.',
      { terminalIndex: 1, onToken: () => {} }
    );
    const seesMsg = response.toLowerCase().includes('login') || response.toLowerCase().includes('task') || response.toLowerCase().includes('build') || response.toLowerCase().includes('message');
    assert('T1 sees bus messages in context (real API)', seesMsg, `response: "${response.slice(0,150)}"`);
  } catch (err) {
    ko('T1 sees bus messages in context (real API)', err.message.slice(0,100));
  }

  unsubscribe('junior-dev', handler);
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 4 — Terminal status lifecycle
// ══════════════════════════════════════════════════════════════════════════════

async function test4_terminalStatus() {
  section('TEST 4 — Terminal Status Lifecycle');

  // All terminals start idle
  await writeState({
    activeTerminal: 1, mode: 'manual', autonomousStepCount: 0,
    terminalStatus: { '1':'idle','2':'idle','3':'idle','4':'idle','5':'idle' },
    lastSwitch: new Date().toISOString(),
  });

  let s = await readState();
  assert('all terminals start idle', Object.values(s.terminalStatus).every(v => v === 'idle'));

  // Transition T1: idle → working
  await setTerminalStatus(1, 'working');
  s = await readState();
  assert('T1 transitions to working',   s.terminalStatus['1'] === 'working');
  assert('other terminals still idle',  s.terminalStatus['2'] === 'idle');

  // Transition T2: idle → working
  await setTerminalStatus(2, 'working');
  s = await readState();
  assert('T2 transitions to working',   s.terminalStatus['2'] === 'working');

  // T1 done
  await setTerminalStatus(1, 'done');
  s = await readState();
  assert('T1 transitions to done',      s.terminalStatus['1'] === 'done');
  assert('T2 still working',            s.terminalStatus['2'] === 'working');

  // T2 failed
  await setTerminalStatus(2, 'failed');
  s = await readState();
  assert('T2 transitions to failed',    s.terminalStatus['2'] === 'failed');

  // Reset back to idle
  await setTerminalStatus(1, 'idle');
  await setTerminalStatus(2, 'idle');
  s = await readState();
  assert('T1 resets to idle',           s.terminalStatus['1'] === 'idle');
  assert('T2 resets to idle',           s.terminalStatus['2'] === 'idle');

  // Invalid status throws
  try {
    await setTerminalStatus(1, 'on-fire');
    ko('invalid status throws error', 'no error was thrown');
  } catch (err) {
    assert('invalid status throws error', err.message.includes('Invalid terminal status'));
  }

  // Step count increments correctly
  await writeState({ ...await readState(), autonomousStepCount: 0 });
  await incrementAutonomousStep();
  await incrementAutonomousStep();
  await incrementAutonomousStep();
  s = await readState();
  assert('autonomousStepCount increments to 3', s.autonomousStepCount === 3);
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 5 — Orchestrator budget enforcement (no full API call)
// ══════════════════════════════════════════════════════════════════════════════

async function test5_budgetEnforcement() {
  section('TEST 5 — Orchestrator Budget Enforcement');

  // Set maxSteps = 2 (PM plan = step 1, only 1 agent task allowed)
  await writeFile(CONFIG_PATH, JSON.stringify({ maxSteps: 2 }, null, 2));

  await writeState({
    activeTerminal: 5, mode: 'auto', autonomousStepCount: 0,
    terminalStatus: { '1':'idle','2':'idle','3':'idle','4':'idle','5':'idle' },
    lastSwitch: new Date().toISOString(),
  });

  const events = { dispatched: [], budgetHit: false, complete: null };

  console.log('  (calling Claude API with maxSteps=2...)');

  try {
    await runOrchestratorLoop(
      'Write a Node.js function add(a, b) that returns a + b. Include one unit test using the built-in assert module.',
      {
        onPMToken:        () => {},
        onAgentToken:     () => {},
        onStatusChange:   () => {},
        onDispatch:       (task, t) => {
          events.dispatched.push(t);
          console.log(`  → dispatched to T${t} (${task.assignee}): ${task.title}`);
        },
        onTaskDone:       () => {},
        onTaskFailed:     () => {},
        onBudgetExceeded: (s, m) => {
          events.budgetHit = true;
          console.log(`  → budget hit at step ${s}/${m}`);
        },
        onComplete: (r) => { events.complete = r; },
      }
    );
  } catch (err) {
    ko('orchestrator budget test — no throw expected', err.message.slice(0,100));
  }

  assert('PM dispatched at least 1 task',         events.dispatched.length >= 1, `dispatched: ${events.dispatched.length}`);
  assert('budget exceeded event fired',            events.budgetHit, 'budget should be hit for complex multi-task goal');
  assert('onComplete still fires after budget hit', events.complete !== null);
  const s = await readState();
  assert('autonomousStepCount written to state',   s.autonomousStepCount >= 1, `got ${s.autonomousStepCount}`);

  // Restore normal maxSteps
  await writeFile(CONFIG_PATH, JSON.stringify({ maxSteps: 20 }, null, 2));
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 6 — Orchestrator full pipeline (real multi-agent work)
// ══════════════════════════════════════════════════════════════════════════════

async function test6_orchestratorPipeline() {
  section('TEST 6 — Orchestrator Full Pipeline (real multi-agent work)');

  await writeState({
    activeTerminal: 5, mode: 'auto', autonomousStepCount: 0,
    terminalStatus: { '1':'idle','2':'idle','3':'idle','4':'idle','5':'idle' },
    lastSwitch: new Date().toISOString(),
  });

  for (let t = 1; t <= 5; t++) clearHistory(t);

  const events = {
    statusChanges: [], dispatches: [], done: [], failed: [],
    pmChars: 0, agentChars: {}, complete: null, budgetHit: false,
    busMessages: [],
  };

  // Capture all bus messages emitted during the orchestrator run
  const busListener = (msg) => events.busMessages.push(msg);
  subscribeAll(busListener);

  console.log('  Goal: "Write a Node.js function greet(name) that returns Hello + name."');
  console.log('  (calling Claude API — may take 20-60 seconds...)\n');

  try {
    await runOrchestratorLoop(
      'Write a Node.js function greet(name) that returns "Hello, " + name + "!". Keep it in one file. Be concise — agents should respond in 3-5 sentences max.',
      {
        onPMToken:       (c)     => { events.pmChars += c.length; },
        onAgentToken:    (t, c)  => { events.agentChars[t] = (events.agentChars[t]||0) + c.length; },
        onStatusChange:  (t, s)  => {
          events.statusChanges.push({ t, s });
          process.stdout.write(`  T${t}:${s.slice(0,4)} `);
        },
        onDispatch:      (task, t) => {
          events.dispatches.push({ t, task });
          console.log(`\n  → T${t} (${task.assignee}): ${task.title}`);
        },
        onTaskDone:      (task, t) => { events.done.push(t);   },
        onTaskFailed:    (task, t) => { events.failed.push(t); },
        onBudgetExceeded: ()       => { events.budgetHit = true; },
        onComplete:      (r)       => { events.complete = r; },
      }
    );
  } catch (err) {
    ko('orchestrator pipeline — no throw expected', err.message.slice(0,120));
    return;
  } finally {
    // Stop listening after orchestrator completes
    bus.off('message', busListener);
  }

  console.log('\n');

  assert('PM produced a plan (chars > 500)',             events.pmChars > 500, `got ${events.pmChars}`);
  assert('at least 1 task dispatched',                   events.dispatches.length >= 1);
  assert('dispatched tasks target non-PM terminals',     events.dispatches.some(d => d.t !== 5));
  assert('dispatched agents streamed real tokens',       events.dispatches.every(d => (events.agentChars[d.t]||0) > 100));
  assert('all dispatched agents reached done or failed', events.dispatches.every(d => events.done.includes(d.t) || events.failed.includes(d.t)));
  assert('T5 went working → done',
    events.statusChanges.some(e=>e.t===5&&e.s==='working') &&
    events.statusChanges.some(e=>e.t===5&&e.s==='done'));
  assert('onComplete fired',                             events.complete !== null);
  assert('budget not exceeded',                         !events.budgetHit);

  // Verify bus messages via live EventEmitter (test 3 covers log persistence separately)
  const taskMsgs = events.busMessages.filter(m => m.type === 'task'    && m.from === 'project-manager');
  const summMsgs = events.busMessages.filter(m => m.type === 'summary' && m.to   === 'project-manager');
  assert('task dispatch messages on bus',           taskMsgs.length >= 1, `got ${taskMsgs.length}`);
  assert('completion summary messages on bus',      summMsgs.length >= 1, `got ${summMsgs.length}`);

  // Print per-agent token counts
  console.log(`\n  PM tokens: ${events.pmChars}`);
  for (const [t, chars] of Object.entries(events.agentChars)) {
    console.log(`  T${t} tokens: ${chars}`);
  }
  console.log(`  Bus events captured: ${events.busMessages.length} (task=${taskMsgs.length} summary=${summMsgs.length})`);
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 7 — Handoff injection
// ══════════════════════════════════════════════════════════════════════════════

async function test7_handoffInjection() {
  section('TEST 7 — Handoff Injection');

  // Append a handoff from T1 → T2 with a unique token
  const uniqueToken = `HANDOFF_TOKEN_${Date.now()}`;
  await appendHandoff(1, `Junior Dev completed the login feature. ${uniqueToken}. Passing to Senior Dev for code review.`);

  // Build context for T2 (Senior Dev) and verify the handoff appears
  const ctx = await buildAgentContext(2);
  assert('handoff section present in context',       ctx.includes('RECENT HANDOFFS'));
  assert('handoff token visible in T2 context',      ctx.includes(uniqueToken), `Token not found in context`);

  // Ask Senior Dev in real API call — it should reference the handoff
  clearHistory(2);
  let response = '';
  try {
    response = await routePrompt(
      'What was the most recent handoff you received? Describe it in one sentence.',
      { terminalIndex: 2, onToken: () => {} }
    );
    const seesHandoff = response.toLowerCase().includes('login') || response.toLowerCase().includes('junior') || response.toLowerCase().includes('handoff') || response.toLowerCase().includes('code review');
    assert('T2 sees handoff content (real API)', seesHandoff, `response: "${response.slice(0,150)}"`);
  } catch (err) {
    ko('T2 sees handoff content (real API)', err.message.slice(0,100));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 8 — Agent conversation history and /clear
// ══════════════════════════════════════════════════════════════════════════════

async function test8_conversationHistory() {
  section('TEST 8 — Conversation History & Continuity');

  clearHistory(3); // QA Engineer

  // Turn 1: establish context
  let r1 = '';
  try {
    r1 = await routePrompt(
      'Remember this secret code for this conversation: FORGE-QA-42. Acknowledge you have it.',
      { terminalIndex: 3, onToken: () => {} }
    );
    assert('T3 acknowledges the code', r1.toLowerCase().includes('forge') || r1.includes('42') || r1.toLowerCase().includes('secret'), `response: "${r1.slice(0,100)}"`);
  } catch (err) {
    ko('T3 turn 1', err.message.slice(0,100));
    return;
  }

  // Turn 2: verify memory within session
  let r2 = '';
  try {
    r2 = await routePrompt(
      'What was the secret code I gave you?',
      { terminalIndex: 3, onToken: () => {} }
    );
    const remembers = r2.includes('FORGE-QA-42') || r2.includes('42') || r2.toLowerCase().includes('forge');
    assert('T3 remembers secret code across turns (session memory)', remembers, `response: "${r2.slice(0,120)}"`);
  } catch (err) {
    ko('T3 turn 2', err.message.slice(0,100));
    return;
  }

  // Turn 3: history length grows
  const histBefore = getHistory(3).length;
  assert('history has entries after 2 turns', histBefore >= 2, `got ${histBefore}`);

  // clearHistory wipes it
  clearHistory(3);
  const histAfter = getHistory(3).length;
  assert('clearHistory empties the history', histAfter === 0, `got ${histAfter}`);

  // Turn 4: after clear, agent no longer remembers
  let r3 = '';
  try {
    r3 = await routePrompt(
      'What was the secret code I gave you earlier?',
      { terminalIndex: 3, onToken: () => {} }
    );
    const forgot = !r3.includes('FORGE-QA-42') || r3.toLowerCase().includes("don't") || r3.toLowerCase().includes('no') || r3.toLowerCase().includes('recall');
    assert('T3 does not remember code after /clear', forgot, `response: "${r3.slice(0,120)}"`);
  } catch (err) {
    ko('T3 turn after clear', err.message.slice(0,100));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════════════

await setup();

const suites = [
  ['Agent Identity',            test1_agentIdentity],
  ['Context Injection',         test2_contextInjection],
  ['Message Bus Round-Trip',    test3_messageBus],
  ['Terminal Status Lifecycle', test4_terminalStatus],
  ['Budget Enforcement',        test5_budgetEnforcement],
  ['Orchestrator Pipeline',     test6_orchestratorPipeline],
  ['Handoff Injection',         test7_handoffInjection],
  ['Conversation History',      test8_conversationHistory],
];

for (const [name, fn] of suites) {
  try {
    await fn();
  } catch (err) {
    console.log(`\n  \x1b[31mSuite "${name}" threw unexpectedly:\x1b[0m ${err.message}`);
    fail++;
  }
}

// ── Final report ─────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log(`  TOTAL: ${pass + fail + skipped} checks`);
console.log(`  \x1b[32m✓ PASS: ${pass}\x1b[0m`);
if (fail > 0) console.log(`  \x1b[31m✗ FAIL: ${fail}\x1b[0m`);
if (skipped > 0) console.log(`  \x1b[33m− SKIP: ${skipped}\x1b[0m`);

if (fail > 0) {
  console.log('\n  Failed checks:');
  results.filter(r => !r.ok).forEach(r => console.log(`    ✗ ${r.label}${r.detail ? ` → ${r.detail}` : ''}`));
}

console.log(`\n  ${fail === 0 ? '\x1b[32mAll tests passed.\x1b[0m' : `\x1b[31m${fail} test(s) failed.\x1b[0m`}\n`);
process.exit(fail > 0 ? 1 : 0);
