import { config } from 'dotenv';
import { resolve } from 'path';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env'), override: true });
import Anthropic from '@anthropic-ai/sdk';
import createDebug from 'debug';
import { readState } from './state.js';
import { buildAgentContext, appendHandoff, getAgentIdByTerminal } from './context-manager.js';

const debug = createDebug('tf:agent');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_MODULES = {
  1: () => import('../agents/junior-dev.js'),
  2: () => import('../agents/senior-dev.js'),
  3: () => import('../agents/qa-engineer.js'),
  4: () => import('../agents/devops-engineer.js'),
  5: () => import('../agents/project-manager.js'),
};

const sessionHistories = {
  1: [], 2: [], 3: [], 4: [], 5: [],
};

async function loadAgent(terminalIndex) {
  const loader = AGENT_MODULES[terminalIndex];
  if (!loader) throw new Error(`No agent configured for terminal ${terminalIndex}`);
  return loader();
}

/**
 * Send a prompt to the currently active agent (or a specific terminal).
 * Streams the response token-by-token via the onToken callback.
 *
 * @param {string} userPrompt
 * @param {object} options
 * @param {number} [options.terminalIndex]  — override active terminal
 * @param {function} [options.onToken]      — called with each streamed text chunk
 * @param {function} [options.onDone]       — called with full response text when complete
 * @returns {Promise<string>}               — full response text
 */
export async function routePrompt(userPrompt, { terminalIndex, onToken, onDone } = {}) {
  const state = await readState();
  const terminal = terminalIndex ?? state.activeTerminal;

  const agent = await loadAgent(terminal);
  const agentId = getAgentIdByTerminal(terminal);

  debug('routing prompt to terminal %d (%s)', terminal, agentId);

  const context = await buildAgentContext(terminal);

  const systemPrompt = `${agent.SYSTEM_PROMPT}\n\n${context}`;

  const history = sessionHistories[terminal];
  history.push({ role: 'user', content: userPrompt });

  let fullResponse = '';

  try {
    const stream = client.messages.stream({
      model: agent.MODEL,
      max_tokens: agent.MAX_TOKENS,
      system: systemPrompt,
      messages: history,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta?.type === 'text_delta'
      ) {
        const chunk = event.delta.text;
        fullResponse += chunk;
        if (onToken) onToken(chunk);
      }
    }

    history.push({ role: 'assistant', content: fullResponse });

    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    debug('terminal %d response complete (%d chars)', terminal, fullResponse.length);

    if (onDone) onDone(fullResponse);
    return fullResponse;
  } catch (err) {
    const msg = `[Agent error — terminal ${terminal} (${agentId})]: ${err.message}`;
    debug(msg);
    if (onToken) onToken(`\n${msg}\n`);
    throw new Error(msg);
  }
}

/**
 * Save the last response from a terminal as a handoff entry.
 */
export async function saveHandoff(terminalIndex) {
  const history = sessionHistories[terminalIndex];
  const last = history.filter(m => m.role === 'assistant').pop();
  if (last) {
    await appendHandoff(terminalIndex, last.content);
    debug('saved handoff for terminal %d', terminalIndex);
  }
}

/**
 * Return the rolling message history for a terminal (for inspection/testing).
 */
export function getHistory(terminalIndex) {
  return sessionHistories[terminalIndex] ?? [];
}

/**
 * Clear the rolling history for a terminal (e.g. on agent:reset).
 */
export function clearHistory(terminalIndex) {
  sessionHistories[terminalIndex] = [];
  debug('cleared history for terminal %d', terminalIndex);
}
