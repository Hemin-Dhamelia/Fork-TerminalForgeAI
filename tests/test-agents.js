/**
 * Phase 2 tests — agent identity, context injection, routing
 *
 * Verifies (without hitting the Claude API):
 *   - All 5 agents export required fields
 *   - System prompts contain correct terminal numbers and agent names
 *   - Context manager builds a valid context block for each terminal
 *   - Agent router maps terminal indices to correct agent modules
 *   - getAgentIdByTerminal returns correct IDs
 */

import * as juniorDev from '../agents/junior-dev.js';
import * as seniorDev from '../agents/senior-dev.js';
import * as qaEngineer from '../agents/qa-engineer.js';
import * as devopsEngineer from '../agents/devops-engineer.js';
import * as projectManager from '../agents/project-manager.js';
import { buildAgentContext, getAgentIdByTerminal } from '../core/context-manager.js';
import { getHistory, clearHistory } from '../core/agent-router.js';

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

// ── Agent module structure ────────────────────────────────────────────────

console.log('\n── Agent module exports ────────────────────────────────────────');

const agents = [
  { mod: juniorDev,       name: 'Junior Developer',  terminal: 1, id: 'junior-dev'       },
  { mod: seniorDev,       name: 'Senior Developer',  terminal: 2, id: 'senior-dev'       },
  { mod: qaEngineer,      name: 'QA Engineer',       terminal: 3, id: 'qa-engineer'      },
  { mod: devopsEngineer,  name: 'DevOps Engineer',   terminal: 4, id: 'devops-engineer'  },
  { mod: projectManager,  name: 'Project Manager',   terminal: 5, id: 'project-manager'  },
];

for (const { mod, name, terminal, id } of agents) {
  assert(typeof mod.SYSTEM_PROMPT === 'string' && mod.SYSTEM_PROMPT.length > 100,
    `${name}: SYSTEM_PROMPT is a non-empty string`);
  assert(mod.TERMINAL_INDEX === terminal,
    `${name}: TERMINAL_INDEX === ${terminal}`);
  assert(mod.AGENT_ID === id,
    `${name}: AGENT_ID === "${id}"`);
  assert(mod.AGENT_NAME === name,
    `${name}: AGENT_NAME === "${name}"`);
  assert(mod.MODEL === 'claude-sonnet-4-5',
    `${name}: MODEL === "claude-sonnet-4-5"`);
  assert(mod.MAX_TOKENS === 4096,
    `${name}: MAX_TOKENS === 4096`);
  assert(mod.SYSTEM_PROMPT.includes(`terminal number is ${terminal}`),
    `${name}: system prompt mentions correct terminal number`);
}

assert(projectManager.ORCHESTRATOR_MAX_TOKENS === 1024,
  'Project Manager: ORCHESTRATOR_MAX_TOKENS === 1024');

// ── getAgentIdByTerminal mapping ──────────────────────────────────────────

console.log('\n── getAgentIdByTerminal mapping ────────────────────────────────');

assert(getAgentIdByTerminal(1) === 'junior-dev',      'terminal 1 → junior-dev');
assert(getAgentIdByTerminal(2) === 'senior-dev',      'terminal 2 → senior-dev');
assert(getAgentIdByTerminal(3) === 'qa-engineer',     'terminal 3 → qa-engineer');
assert(getAgentIdByTerminal(4) === 'devops-engineer', 'terminal 4 → devops-engineer');
assert(getAgentIdByTerminal(5) === 'project-manager', 'terminal 5 → project-manager');
assert(getAgentIdByTerminal(99) === 'junior-dev',     'unknown terminal falls back to junior-dev');

// ── Context manager builds valid blocks ──────────────────────────────────

console.log('\n── Context manager output ──────────────────────────────────────');

for (const { terminal, name } of agents) {
  const context = await buildAgentContext(terminal);
  assert(typeof context === 'string' && context.length > 0,
    `${name}: buildAgentContext returns non-empty string`);
  assert(context.includes('=== SHARED PROJECT CONTEXT ==='),
    `${name}: context includes project section`);
  assert(context.includes('=== YOUR OPEN TASKS ==='),
    `${name}: context includes tasks section`);
  assert(context.includes('=== GIT SUMMARY ==='),
    `${name}: context includes git summary section`);
  assert(context.includes('=== MESSAGES FOR YOU ==='),
    `${name}: context includes messages section`);
}

// ── Agent router history management ──────────────────────────────────────

console.log('\n── Agent router history management ─────────────────────────────');

assert(Array.isArray(getHistory(1)), 'getHistory(1) returns array');
assert(getHistory(1).length === 0,  'history starts empty for terminal 1');

clearHistory(1);
assert(getHistory(1).length === 0,  'clearHistory(1) leaves history empty');

// ── Results ───────────────────────────────────────────────────────────────

console.log('');
if (failures === 0) {
  console.log('\x1b[32mAll Phase 2 tests passed.\x1b[0m\n');
  process.exit(0);
} else {
  console.log(`\x1b[31m${failures} test(s) failed.\x1b[0m\n`);
  process.exit(1);
}
