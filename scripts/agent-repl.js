#!/usr/bin/env node
/**
 * TerminalForge — Agent REPL
 * Runs an interactive prompt session for a single agent terminal.
 * Usage: node scripts/agent-repl.js <terminalIndex>
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env'), override: true });

import { routePrompt, clearHistory } from '../core/agent-router.js';
import { readState, setTerminalStatus } from '../core/state.js';

const TERMINAL_INDEX = parseInt(process.argv[2]);

if (!TERMINAL_INDEX || TERMINAL_INDEX < 1 || TERMINAL_INDEX > 5) {
  console.error('Usage: node scripts/agent-repl.js <1-5>');
  process.exit(1);
}

const AGENT_INFO = {
  1: { name: 'Junior Developer',  emoji: '👨‍💻', colour: '\x1b[36m'  },
  2: { name: 'Senior Developer',  emoji: '🧠', colour: '\x1b[34m'  },
  3: { name: 'QA Engineer',       emoji: '🔍', colour: '\x1b[33m'  },
  4: { name: 'DevOps Engineer',   emoji: '⚙️', colour: '\x1b[35m'  },
  5: { name: 'Project Manager',   emoji: '📋', colour: '\x1b[32m'  },
};

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';

const { name, emoji, colour } = AGENT_INFO[TERMINAL_INDEX];

function printHeader() {
  const width = 60;
  const border = '═'.repeat(width);
  console.clear();
  console.log(`${colour}${BOLD}╔${border}╗${RESET}`);
  console.log(`${colour}${BOLD}║  ${emoji}  Terminal ${TERMINAL_INDEX} — ${name}${' '.repeat(width - name.length - 14)}║${RESET}`);
  console.log(`${colour}${BOLD}╚${border}╝${RESET}`);
  console.log(`${DIM}  Type your prompt and press Enter. Commands: /clear /status /quit${RESET}`);
  console.log('');
}

function printStatus(status) {
  const colours = { idle: DIM, working: YELLOW, done: GREEN, failed: RED };
  const c = colours[status] || DIM;
  console.log(`\n${c}  ● STATUS: ${status.toUpperCase()}${RESET}\n`);
}

async function showCurrentStatus() {
  try {
    const state = await readState();
    const status = state.terminalStatus?.[String(TERMINAL_INDEX)] || 'idle';
    const active = state.activeTerminal === TERMINAL_INDEX ? ` ${GREEN}[ACTIVE]${RESET}` : ` ${DIM}[background]${RESET}`;
    console.log(`${DIM}  Terminal ${TERMINAL_INDEX} · ${name}${RESET}${active}`);
    printStatus(status);
  } catch {
    console.log(`${RED}  Could not read state.json${RESET}\n`);
  }
}

async function handlePrompt(input) {
  const trimmed = input.trim();
  if (!trimmed) return;

  if (trimmed === '/clear') {
    clearHistory(TERMINAL_INDEX);
    printHeader();
    console.log(`${DIM}  History cleared.${RESET}\n`);
    return;
  }

  if (trimmed === '/status') {
    await showCurrentStatus();
    return;
  }

  if (trimmed === '/quit' || trimmed === '/exit') {
    console.log(`\n${DIM}  Closing Terminal ${TERMINAL_INDEX} — ${name}${RESET}\n`);
    process.exit(0);
  }

  console.log('');
  console.log(`${colour}${BOLD}  ┌─ ${name} ─────────────────────────────────────────────${RESET}`);
  process.stdout.write(`${colour}  │ ${RESET}`);

  await setTerminalStatus(TERMINAL_INDEX, 'working');

  try {
    let firstChunk = true;
    await routePrompt(trimmed, {
      terminalIndex: TERMINAL_INDEX,
      onToken: (chunk) => {
        const lines = chunk.split('\n');
        lines.forEach((line, i) => {
          if (!firstChunk && i === 0) {
            process.stdout.write(line);
          } else if (i === 0) {
            process.stdout.write(line);
            firstChunk = false;
          } else {
            process.stdout.write(`\n${colour}  │ ${RESET}${line}`);
          }
        });
      },
    });

    await setTerminalStatus(TERMINAL_INDEX, 'done');
    console.log(`\n${colour}${BOLD}  └────────────────────────────────────────────────────${RESET}`);
    console.log(`${GREEN}  ✓ Done${RESET}\n`);
  } catch (err) {
    await setTerminalStatus(TERMINAL_INDEX, 'failed');
    console.log(`\n${colour}${BOLD}  └────────────────────────────────────────────────────${RESET}`);
    console.log(`${RED}  ✗ Error: ${err.message}${RESET}\n`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

printHeader();
await showCurrentStatus();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

const prompt = () => {
  rl.question(`${colour}${BOLD}  [T${TERMINAL_INDEX}] › ${RESET}`, async (input) => {
    await handlePrompt(input);
    prompt();
  });
};

prompt();

rl.on('close', () => {
  console.log(`\n${DIM}  Session ended.${RESET}\n`);
  process.exit(0);
});
