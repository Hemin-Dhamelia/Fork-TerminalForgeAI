/**
 * Phase 2 live smoke test — sends a real prompt to each agent via Claude API
 * and confirms streaming output arrives.
 *
 * Requires: ANTHROPIC_API_KEY in .env
 * Run: node tests/smoke-test-agents.js
 *
 * Optional: node tests/smoke-test-agents.js 2   (test only terminal 2)
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env'), override: true });
import { routePrompt, clearHistory } from '../core/agent-router.js';
import { writeState } from '../core/state.js';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\x1b[31mMissing ANTHROPIC_API_KEY in .env — copy .env.example to .env and add your key.\x1b[0m');
  process.exit(1);
}

const AGENT_NAMES = {
  1: 'Junior Developer',
  2: 'Senior Developer',
  3: 'QA Engineer',
  4: 'DevOps Engineer',
  5: 'Project Manager',
};

const TEST_PROMPTS = {
  1: 'In one sentence, confirm who you are and your terminal number.',
  2: 'In one sentence, confirm who you are and your terminal number.',
  3: 'In one sentence, confirm who you are and your terminal number.',
  4: 'In one sentence, confirm who you are and your terminal number.',
  5: 'In one sentence, confirm who you are and your terminal number.',
};

const targetTerminal = process.argv[2] ? parseInt(process.argv[2]) : null;
const terminals = targetTerminal ? [targetTerminal] : [1, 2, 3, 4, 5];

let failures = 0;

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  TerminalForge — Phase 2 Live Agent Smoke Test');
console.log('═══════════════════════════════════════════════════════════\n');

for (const terminal of terminals) {
  const name = AGENT_NAMES[terminal];
  console.log(`── Terminal ${terminal}: ${name} ${'─'.repeat(40 - name.length)}`);

  clearHistory(terminal);

  await writeState({
    activeTerminal: terminal,
    mode: 'manual',
    lastSwitch: new Date().toISOString(),
    autonomousStepCount: 0,
    terminalStatus: { '1': 'idle', '2': 'idle', '3': 'idle', '4': 'idle', '5': 'idle' },
  });

  let tokenCount = 0;
  let response = '';
  let errored = false;

  process.stdout.write('  Response: ');

  try {
    response = await routePrompt(TEST_PROMPTS[terminal], {
      terminalIndex: terminal,
      onToken: (chunk) => {
        process.stdout.write(chunk);
        tokenCount++;
      },
    });
    console.log('');
  } catch (err) {
    console.log(`\n  \x1b[31mERROR: ${err.message}\x1b[0m`);
    errored = true;
    failures++;
  }

  if (!errored) {
    const streamed = tokenCount > 0;
    const hasContent = response.length > 10;
    const mentionsTerminal = response.toLowerCase().includes(`terminal ${terminal}`) ||
                             response.toLowerCase().includes(`terminal number ${terminal}`) ||
                             response.includes(`${terminal}`);

    console.log(`  ${streamed   ? PASS : FAIL}  Response streamed (${tokenCount} chunks)`);
    console.log(`  ${hasContent ? PASS : FAIL}  Response has content (${response.length} chars)`);
    console.log(`  ${mentionsTerminal ? PASS : FAIL}  Response mentions terminal ${terminal}`);

    if (!streamed || !hasContent) failures++;
  }

  console.log('');
}

if (failures === 0) {
  console.log('\x1b[32mAll smoke tests passed.\x1b[0m\n');
  process.exit(0);
} else {
  console.log(`\x1b[31m${failures} smoke test(s) failed.\x1b[0m\n`);
  process.exit(1);
}
