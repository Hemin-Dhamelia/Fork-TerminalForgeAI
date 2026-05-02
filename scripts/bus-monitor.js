#!/usr/bin/env node
/**
 * TerminalForge — Bus Monitor
 * Live terminal display of ALL inter-agent messages as they flow through
 * the message bus. Run this in a dedicated window alongside the 5 agent REPLs.
 *
 * Usage: node scripts/bus-monitor.js
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { watch } from 'fs';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env'), override: true });

import { subscribeAll, readLog, AGENT_NAMES, MESSAGE_TYPES } from '../core/message-bus.js';
import { readState } from '../core/state.js';

// ── ANSI colours ─────────────────────────────────────────────────────────────

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE   = '\x1b[34m';
const CYAN   = '\x1b[36m';
const WHITE  = '\x1b[37m';

const AGENT_COLOURS = {
  'junior-dev':      '\x1b[36m',   // cyan
  'senior-dev':      '\x1b[34m',   // blue
  'qa-engineer':     '\x1b[33m',   // yellow
  'devops-engineer': '\x1b[35m',   // magenta
  'project-manager': '\x1b[32m',   // green
};

const TYPE_COLOURS = {
  task:         '\x1b[36m',   // cyan
  review:       '\x1b[34m',   // blue
  escalation:   '\x1b[31m',   // red
  'bug-report': '\x1b[31m',   // red
  handoff:      '\x1b[33m',   // yellow
  summary:      '\x1b[32m',   // green
};

const TYPE_ICONS = {
  task:         '📋',
  review:       '🔍',
  escalation:   '🚨',
  'bug-report': '🐛',
  handoff:      '🤝',
  summary:      '📊',
};

// ── Header ───────────────────────────────────────────────────────────────────

const WIDTH = 72;

function printHeader() {
  const border = '═'.repeat(WIDTH);
  console.clear();
  console.log(`${CYAN}${BOLD}╔${border}╗${RESET}`);
  console.log(`${CYAN}${BOLD}║  📡  TerminalForge — Agent Message Bus Monitor${' '.repeat(WIDTH - 47)}║${RESET}`);
  console.log(`${CYAN}${BOLD}╚${border}╝${RESET}`);
  console.log(`${DIM}  Showing all inter-agent messages in real time. Press Ctrl+C to exit.${RESET}`);
  console.log('');
  printAgentLegend();
  console.log('');
  console.log(`${CYAN}${'─'.repeat(WIDTH)}${RESET}`);
  console.log(`${DIM}  ${padRight('TIME', 10)}${padRight('FROM', 22)}${padRight('TO', 22)}TYPE${RESET}`);
  console.log(`${CYAN}${'─'.repeat(WIDTH)}${RESET}`);
}

function printAgentLegend() {
  console.log(`${BOLD}  Agents:${RESET}`);
  const agents = Object.entries(AGENT_NAMES);
  const perRow = 2;
  for (let i = 0; i < agents.length; i += perRow) {
    let row = '  ';
    for (let j = i; j < Math.min(i + perRow, agents.length); j++) {
      const [id, info] = agents[j];
      const col = AGENT_COLOURS[id] || WHITE;
      row += `${col}${BOLD}${info.emoji} T${info.terminal} ${info.label}${RESET}${' '.repeat(30 - info.label.length)}`;
    }
    console.log(row);
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function padRight(str, len) {
  return (str + ' '.repeat(len)).slice(0, len);
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false });
}

function wordWrap(text, maxWidth, indent) {
  const words = text.split(' ');
  const lines = [];
  let line = indent;
  for (const word of words) {
    if ((line + word).length > maxWidth) {
      if (line.trim()) lines.push(line.trimEnd());
      line = indent + word + ' ';
    } else {
      line += word + ' ';
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

// ── Render a single message envelope ─────────────────────────────────────────

let messageCount = 0;

function renderMessage(envelope) {
  messageCount++;

  const fromInfo  = AGENT_NAMES[envelope.from];
  const toInfo    = AGENT_NAMES[envelope.to];
  const fromCol   = AGENT_COLOURS[envelope.from] || WHITE;
  const toCol     = AGENT_COLOURS[envelope.to]   || WHITE;
  const typeCol   = TYPE_COLOURS[envelope.type]  || DIM;
  const typeIcon  = TYPE_ICONS[envelope.type]    || '💬';
  const time      = formatTime(envelope.timestamp);

  // Summary line
  const fromLabel = `${fromInfo.emoji} ${fromInfo.label}`;
  const toLabel   = `${toInfo.emoji} ${toInfo.label}`;
  const typeLabel = envelope.type.toUpperCase();

  console.log(
    `  ${DIM}${padRight(time, 10)}${RESET}` +
    `${fromCol}${BOLD}${padRight(fromLabel, 22)}${RESET}` +
    `${DIM}→  ${RESET}` +
    `${toCol}${BOLD}${padRight(toLabel, 19)}${RESET}` +
    `${typeCol}${BOLD}${typeIcon} ${typeLabel}${RESET}`
  );

  // Payload (word-wrapped)
  const indent  = '  ';
  const maxLine = WIDTH - 4;
  const lines   = wordWrap(envelope.payload, maxLine, indent + '  ');
  for (const l of lines) {
    console.log(`${DIM}${l}${RESET}`);
  }

  // Task ID if present
  if (envelope.taskId) {
    console.log(`  ${DIM}taskId: ${envelope.taskId}  ·  id: ${envelope.id}${RESET}`);
  }

  // Separator
  console.log(`${DIM}${'·'.repeat(WIDTH)}${RESET}`);
}

// ── Replay historical messages from log ──────────────────────────────────────

async function replayHistory() {
  const messages = await readLog();
  if (messages.length === 0) {
    console.log(`${DIM}  No messages in log yet. Waiting for live traffic...${RESET}`);
    console.log(`${DIM}${'·'.repeat(WIDTH)}${RESET}`);
    return;
  }

  const replayCount = Math.min(messages.length, 20);
  const start = messages.length - replayCount;

  if (messages.length > 20) {
    console.log(`${DIM}  (Showing last 20 of ${messages.length} historical messages)${RESET}`);
    console.log(`${DIM}${'·'.repeat(WIDTH)}${RESET}`);
  } else {
    console.log(`${DIM}  Replaying ${replayCount} historical message${replayCount !== 1 ? 's' : ''}...${RESET}`);
    console.log(`${DIM}${'·'.repeat(WIDTH)}${RESET}`);
  }

  for (let i = start; i < messages.length; i++) {
    renderMessage(messages[i]);
  }

  messageCount = messages.length;
  console.log(`${GREEN}  ── Live feed active ─────────────────────────────────────────────────${RESET}`);
}

// ── Status bar: show active terminal + team status ────────────────────────────

async function renderStatusBar() {
  try {
    const state = await readState();
    const active = state.activeTerminal;
    const mode   = (state.mode || 'manual').toUpperCase();
    const ts     = state.terminalStatus || {};

    const STATUS_COLOURS = {
      idle:    DIM,
      working: YELLOW,
      done:    GREEN,
      failed:  RED,
    };
    const STATUS_ICONS = {
      idle:    '○',
      working: '●',
      done:    '✓',
      failed:  '✗',
    };

    process.stdout.write('\x1b[s');   // save cursor
    // move to line 8 (after header + legend + separator line)
    // We'll print at a fixed bottom position instead
    const statusParts = Object.entries(AGENT_NAMES).map(([id, info]) => {
      const s = ts[String(info.terminal)] || 'idle';
      const col = STATUS_COLOURS[s] || DIM;
      const icon = STATUS_ICONS[s] || '○';
      const activeMarker = info.terminal === active ? `${BOLD}*${RESET}` : ' ';
      return `${activeMarker}${col}${icon}T${info.terminal}${RESET}`;
    });

    process.stdout.write('\x1b[u');   // restore cursor
  } catch {
    // ignore status bar errors silently
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

printHeader();
await replayHistory();

// Subscribe to ALL live messages
subscribeAll((envelope) => {
  renderMessage(envelope);
});

// Also watch the messages.log file for writes from other processes
// (messages published from a different Node process won't trigger the EventEmitter
//  in this process — file-watch catches those)
const LOG_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.terminalforge', 'messages.log');

let lastSize = 0;
if (existsSync(LOG_PATH)) {
  const s = await stat(LOG_PATH);
  lastSize = s.size;
}

async function readNewLines() {
  if (!existsSync(LOG_PATH)) return;
  const s = await stat(LOG_PATH);
  if (s.size <= lastSize) return;

  const full = await readFile(LOG_PATH, 'utf8');
  const lines = full.split('\n').filter(Boolean);
  const allParsed = lines
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  // Show only newly-appended messages (those beyond what we already showed)
  const newMessages = allParsed.slice(messageCount);
  for (const msg of newMessages) {
    renderMessage(msg);
    messageCount++;
  }

  lastSize = s.size;
}

// Poll every 500ms for messages from other processes
setInterval(readNewLines, 500);

// Periodic status line at the bottom of the stream
setInterval(async () => {
  try {
    const state = await readState();
    const ts = state.terminalStatus || {};
    const STATUS_ICONS = { idle: '○', working: '●', done: '✓', failed: '✗' };
    const STATUS_COLOURS = { idle: DIM, working: YELLOW, done: GREEN, failed: RED };

    const parts = Object.entries(AGENT_NAMES).map(([id, info]) => {
      const s = ts[String(info.terminal)] || 'idle';
      const col = STATUS_COLOURS[s] || DIM;
      const icon = STATUS_ICONS[s] || '○';
      const active = info.terminal === state.activeTerminal ? BOLD : '';
      return `${active}${col}${icon}T${info.terminal}·${info.label.split(' ')[0]}${RESET}`;
    });

    const mode = (state.mode || 'manual').toUpperCase();
    const modeCol = mode === 'AUTO' ? YELLOW : DIM;

    process.stdout.write(
      `\r${DIM}  ── ${RESET}` +
      parts.join(`${DIM}  ${RESET}`) +
      `${DIM}   Mode: ${RESET}${modeCol}${mode}${RESET}` +
      `${DIM}   msgs: ${messageCount}${RESET}   \n`
    );
  } catch {
    // ignore
  }
}, 10_000);

// ── Graceful exit ─────────────────────────────────────────────────────────────

process.on('SIGINT', () => {
  console.log(`\n\n${DIM}  Bus Monitor closed. Total messages observed: ${messageCount}${RESET}\n`);
  process.exit(0);
});
