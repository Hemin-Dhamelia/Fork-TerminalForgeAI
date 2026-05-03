#!/usr/bin/env node
/**
 * TerminalForge — TUI Entry Point
 * Launches the full Ink-based terminal UI:
 *   5 agent panes side by side + bus monitor — all connected through the message bus.
 *
 * Usage:  node scripts/ui.js
 *   or:   npm run ui
 *
 * Keys:
 *   Tab         → next agent
 *   Shift+Tab   → previous agent
 *   Enter       → submit prompt to active agent
 *   Ctrl+C      → quit cleanly
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env'),
  override: true,
});

// Must be run in a real terminal (Ink requires raw mode / TTY)
if (!process.stdin.isTTY) {
  console.error('\n  ❌  TerminalForge must be run in an interactive terminal.\n');
  console.error('      Run:  npm run ui   (or ./start.sh)\n');
  process.exit(1);
}

// Validate API key before doing anything
if (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_API_KEY.startsWith('sk-')) {
  console.error('\n  ❌  ANTHROPIC_API_KEY missing or invalid in .env\n');
  process.exit(1);
}

import React from 'react';
import { render } from 'ink';
import App from '../ui/App.jsx';

// Hide cursor for cleaner UI
process.stdout.write('\x1b[?25l');

const { unmount, waitUntilExit } = render(
  React.createElement(App),
  {
    exitOnCtrlC: true,
    debug: false,
  }
);

// Restore cursor and clean up on exit
const cleanup = () => {
  process.stdout.write('\x1b[?25h');  // show cursor
  process.stdout.write('\x1b[2J\x1b[0;0H');  // clear screen
  console.log('\n  TerminalForge TUI closed.\n');
};

process.on('SIGINT',  () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('exit',    ()  => { process.stdout.write('\x1b[?25h'); });

waitUntilExit().then(() => {
  cleanup();
  process.exit(0);
}).catch(() => {
  cleanup();
  process.exit(1);
});
