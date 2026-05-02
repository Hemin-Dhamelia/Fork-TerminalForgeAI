#!/usr/bin/env node
/**
 * TerminalForge — Agent REPL
 * Runs an interactive prompt session for a single agent terminal.
 * Shows incoming messages from other agents in real time.
 * Usage: node scripts/agent-repl.js <terminalIndex>
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env'), override: true });

import { routePrompt, clearHistory } from '../core/agent-router.js';
import { readState, setTerminalStatus } from '../core/state.js';
import { subscribe, publish, AGENT_NAMES, getAgentIdByTerminal } from '../core/message-bus.js';
import { getAgentIdByTerminal as getAgentId } from '../core/context-manager.js';

const TERMINAL_INDEX = parseInt(process.argv[2]);

if (!TERMINAL_INDEX || TERMINAL_INDEX < 1 || TERMINAL_INDEX > 5) {
  console.error('Usage: node scripts/agent-repl.js <1-5>');
  process.exit(1);
}

const AGENT_INFO = {
  1: { name: 'Junior Developer',  emoji: '👨‍💻', colour: '\x1b[36m'  },
  2: { name: 'Senior Developer',  emoji: '🧠',  colour: '\x1b[34m'  },
  3: { name: 'QA Engineer',       emoji: '🔍',  colour: '\x1b[33m'  },
  4: { name: 'DevOps Engineer',   emoji: '⚙️',  colour: '\x1b[35m'  },
  5: { name: 'Project Manager',   emoji: '📋',  colour: '\x1b[32m'  },
};

const MSG_TYPE_COLOURS = {
  task:         '\x1b[36m',
  review:       '\x1b[34m',
  escalation:   '\x1b[31m',
  'bug-report': '\x1b[31m',
  handoff:      '\x1b[33m',
  summary:      '\x1b[32m',
};

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';

const { name, emoji, colour } = AGENT_INFO[TERMINAL_INDEX];
const myAgentId = getAgentId(TERMINAL_INDEX);

// ── Incoming message display ─────────────────────────────────────────────────

function renderIncomingMessage(envelope) {
  const from    = AGENT_NAMES[envelope.from];
  const typeCol = MSG_TYPE_COLOURS[envelope.type] || DIM;
  const time    = new Date(envelope.timestamp).toLocaleTimeString();

  process.stdout.write('\n');
  console.log(`${colour}${'─'.repeat(62)}${RESET}`);
  console.log(`${BOLD}  📨 Incoming message${RESET}  ${DIM}[${time}]${RESET}`);
  console.log(`  ${from.emoji}  ${BOLD}${from.label}${RESET} → ${emoji} ${BOLD}${name}${RESET}`);
  console.log(`  Type: ${typeCol}${BOLD}${envelope.type.toUpperCase()}${RESET}${envelope.taskId ? `  ${DIM}taskId: ${envelope.taskId}${RESET}` : ''}`);
  console.log(`${colour}${'─'.repeat(62)}${RESET}`);

  // Word-wrap the payload at 58 chars
  const words   = envelope.payload.split(' ');
  let   line    = '  ';
  for (const word of words) {
    if ((line + word).length > 60) {
      console.log(line);
      line = '  ' + word + ' ';
    } else {
      line += word + ' ';
    }
  }
  if (line.trim()) console.log(line);

  console.log(`${colour}${'─'.repeat(62)}${RESET}`);
  console.log(`${DIM}  Reply with /reply <message> or just type your next prompt.${RESET}`);
  console.log('');

  // Re-print the prompt so readline stays usable
  process.stdout.write(`${colour}${BOLD}  [T${TERMINAL_INDEX}] › ${RESET}`);
}

// Subscribe this terminal to incoming messages
subscribe(myAgentId, renderIncomingMessage);

// ── Header + status ──────────────────────────────────────────────────────────

function printHeader() {
  const width = 60;
  const border = '═'.repeat(width);
  console.clear();
  console.log(`${colour}${BOLD}╔${border}╗${RESET}`);
  console.log(`${colour}${BOLD}║  ${emoji}  Terminal ${TERMINAL_INDEX} — ${name}${' '.repeat(width - name.length - 14)}║${RESET}`);
  console.log(`${colour}${BOLD}╚${border}╝${RESET}`);
  console.log(`${DIM}  Type your prompt and press Enter.${RESET}`);
  console.log(`${DIM}  Commands: /clear  /status  /msg <to> <type> <text>  /quit${RESET}`);
  console.log('');
}

async function showCurrentStatus() {
  try {
    const state  = await readState();
    const status = state.terminalStatus?.[String(TERMINAL_INDEX)] || 'idle';
    const statusColours = { idle: DIM, working: YELLOW, done: GREEN, failed: RED };
    const active = state.activeTerminal === TERMINAL_INDEX
      ? ` ${GREEN}[ACTIVE]${RESET}` : ` ${DIM}[background]${RESET}`;
    console.log(`${DIM}  ${emoji}  Terminal ${TERMINAL_INDEX} · ${name}${RESET}${active}`);
    console.log(`  ${statusColours[status]}● ${status.toUpperCase()}${RESET}\n`);
  } catch {
    console.log(`${RED}  Could not read state.json${RESET}\n`);
  }
}

// ── Handle user commands ──────────────────────────────────────────────────────

let lastEnvelope = null; // store last incoming for /reply

async function handlePrompt(input, rl) {
  const trimmed = input.trim();
  if (!trimmed) return;

  // /clear
  if (trimmed === '/clear') {
    clearHistory(TERMINAL_INDEX);
    printHeader();
    console.log(`${DIM}  History cleared.${RESET}\n`);
    return;
  }

  // /status
  if (trimmed === '/status') {
    await showCurrentStatus();
    return;
  }

  // /quit
  if (trimmed === '/quit' || trimmed === '/exit') {
    console.log(`\n${DIM}  Closing Terminal ${TERMINAL_INDEX} — ${name}${RESET}\n`);
    rl.close();
    process.exit(0);
  }

  // /msg <agentId> <type> <text...>
  // e.g. /msg senior-dev escalation Stuck on JWT refresh token
  if (trimmed.startsWith('/msg ')) {
    const parts  = trimmed.slice(5).split(' ');
    const toId   = parts[0];
    const type   = parts[1];
    const text   = parts.slice(2).join(' ');
    if (!toId || !type || !text) {
      console.log(`${RED}  Usage: /msg <agent-id> <type> <message>${RESET}`);
      console.log(`${DIM}  Agent IDs: junior-dev senior-dev qa-engineer devops-engineer project-manager${RESET}`);
      console.log(`${DIM}  Types: task review escalation bug-report handoff summary${RESET}\n`);
      return;
    }
    try {
      const envelope = await publish({ from: myAgentId, to: toId, type, payload: text });
      const toInfo   = AGENT_NAMES[toId];
      console.log(`\n  ${GREEN}✓ Message sent → ${toInfo.emoji} ${toInfo.label}${RESET}`);
      console.log(`  ${DIM}id: ${envelope.id}${RESET}\n`);
    } catch (err) {
      console.log(`\n  ${RED}✗ ${err.message}${RESET}\n`);
    }
    return;
  }

  // /reply <text...>  — quick reply to last received message
  if (trimmed.startsWith('/reply ')) {
    const text = trimmed.slice(7).trim();
    if (!lastEnvelope) {
      console.log(`${RED}  No incoming message to reply to yet.${RESET}\n`);
      return;
    }
    try {
      await publish({
        from:    myAgentId,
        to:      lastEnvelope.from,
        type:    'review',
        payload: text,
        taskId:  lastEnvelope.taskId,
      });
      const toInfo = AGENT_NAMES[lastEnvelope.from];
      console.log(`\n  ${GREEN}✓ Reply sent → ${toInfo.emoji} ${toInfo.label}${RESET}\n`);
    } catch (err) {
      console.log(`\n  ${RED}✗ ${err.message}${RESET}\n`);
    }
    return;
  }

  // ── Normal prompt → Claude API ───────────────────────────────────────────

  console.log('');
  console.log(`${colour}${BOLD}  ┌─ ${name} ─────────────────────────────────────────────${RESET}`);
  process.stdout.write(`${colour}  │ ${RESET}`);

  await setTerminalStatus(TERMINAL_INDEX, 'working');

  try {
    let firstToken = true;
    await routePrompt(trimmed, {
      terminalIndex: TERMINAL_INDEX,
      onToken: (chunk) => {
        const lines = chunk.split('\n');
        lines.forEach((line, i) => {
          if (i === 0) {
            process.stdout.write(line);
          } else {
            process.stdout.write(`\n${colour}  │ ${RESET}${line}`);
          }
        });
        firstToken = false;
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

// store last incoming for /reply
subscribe(myAgentId, (envelope) => { lastEnvelope = envelope; });

// ── Main ─────────────────────────────────────────────────────────────────────

printHeader();
await showCurrentStatus();

const rl = readline.createInterface({
  input:    process.stdin,
  output:   process.stdout,
  terminal: true,
});

const prompt = () => {
  rl.question(`${colour}${BOLD}  [T${TERMINAL_INDEX}] › ${RESET}`, async (input) => {
    await handlePrompt(input, rl);
    prompt();
  });
};

prompt();

rl.on('close', () => {
  console.log(`\n${DIM}  Session ended.${RESET}\n`);
  process.exit(0);
});
