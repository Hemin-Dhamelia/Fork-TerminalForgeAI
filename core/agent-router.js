/**
 * core/agent-router.js — Routes prompts to the correct agent session.
 *
 * Supports two LLM providers, switched via LLM_PROVIDER in .env:
 *
 *   LLM_PROVIDER=anthropic  (default)
 *     Uses claude-sonnet-4-5 via @anthropic-ai/sdk.
 *     Tool use format: Anthropic content blocks (tool_use / tool_result).
 *     ANTHROPIC_API_KEY required.
 *
 *   LLM_PROVIDER=ollama
 *     Uses any local Ollama model via OpenAI-compatible API.
 *     Tool use format: OpenAI function calling (tool_calls / tool role).
 *     No API key needed. Runs 100% offline.
 *     OLLAMA_MODEL  — model to use, default: llama3.1:8b
 *     OLLAMA_BASE_URL — default: http://localhost:11434
 *
 * The two streaming loops are fully separate — each handles the tool use
 * format native to its API. The public interface is identical either way.
 *
 * Public API (unchanged):
 *   routePrompt(prompt, { terminalIndex, onToken, onDone })
 *   saveHandoff(terminalIndex)
 *   getHistory(terminalIndex)
 *   clearHistory(terminalIndex)
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env'), override: true });

import Anthropic from '@anthropic-ai/sdk';
import OpenAI    from 'openai';
import createDebug from 'debug';

import { readState } from './state.js';
import { buildAgentContext, appendHandoff, getAgentIdByTerminal } from './context-manager.js';
import { TOOL_DEFINITIONS, executeTool } from './tools.js';

const debug = createDebug('tf:agent');

// ── Provider config (read once at startup) ────────────────────────────────

const PROVIDER      = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase().trim();
const OLLAMA_MODEL  = process.env.OLLAMA_MODEL   || 'llama3.1:8b';
const OLLAMA_URL    = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

if (!['anthropic', 'ollama'].includes(PROVIDER)) {
  throw new Error(`Unknown LLM_PROVIDER "${PROVIDER}". Use "anthropic" or "ollama".`);
}

// Per-agent provider override — read AGENT_1_PROVIDER … AGENT_5_PROVIDER from env.
// Falls back to the global PROVIDER if not set for a specific terminal.
// Example .env:
//   AGENT_1_PROVIDER=ollama      # Junior Dev  — local
//   AGENT_2_PROVIDER=anthropic   # Senior Dev  — Claude
//   AGENT_5_PROVIDER=anthropic   # PM          — Claude
function getProviderForTerminal(terminalIndex) {
  const override = process.env[`AGENT_${terminalIndex}_PROVIDER`]?.toLowerCase().trim();
  if (override === 'anthropic' || override === 'ollama') return override;
  return PROVIDER;
}

debug('global provider=%s ollama_model=%s', PROVIDER, OLLAMA_MODEL);

// ── API clients ───────────────────────────────────────────────────────────
// Always initialise both clients — per-agent AGENT_N_PROVIDER overrides mean
// either provider can be needed regardless of the global LLM_PROVIDER setting.
// Client construction is cheap (no network calls at this point).

const anthropicClient = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Ollama client never needs an API key — always create it
const ollamaClient = new OpenAI({ baseURL: `${OLLAMA_URL}/v1`, apiKey: 'ollama' });

// ── Agent modules ─────────────────────────────────────────────────────────

const AGENT_MODULES = {
  1: () => import('../agents/junior-dev.js'),
  2: () => import('../agents/senior-dev.js'),
  3: () => import('../agents/qa-engineer.js'),
  4: () => import('../agents/devops-engineer.js'),
  5: () => import('../agents/project-manager.js'),
};

// History per terminal — format matches the active provider
const sessionHistories = { 1: [], 2: [], 3: [], 4: [], 5: [] };

// Caps
const MAX_TOOL_ROUNDS       = 30;
const MAX_HISTORY_MESSAGES  = 40;

async function loadAgent(terminalIndex) {
  const loader = AGENT_MODULES[terminalIndex];
  if (!loader) throw new Error(`No agent configured for terminal ${terminalIndex}`);
  return loader();
}

// ── Shared helpers ────────────────────────────────────────────────────────

/** Display a tool call inline in the TUI output stream. */
function formatToolCall(name, input) {
  const args = Object.entries(input)
    .map(([k, v]) => {
      const val = typeof v === 'string' && v.length > 80
        ? v.slice(0, 80) + '…'
        : JSON.stringify(v);
      return `${k}: ${val}`;
    })
    .join(', ');
  return `\n\`${name}(${args})\``;
}

/** Display a tool result preview inline. */
function formatToolResult(resultStr) {
  const preview = resultStr.length > 300
    ? resultStr.slice(0, 300) + `\n…(${resultStr.length.toLocaleString()} chars)`
    : resultStr;
  return `\n${preview}\n`;
}

// ── Anthropic tool definitions ← already in TOOL_DEFINITIONS format ────────
// { name, description, input_schema: { type, properties, required } }

// ── Ollama tool definitions (OpenAI function calling format) ──────────────
function toOllamaTools(tools) {
  return tools.map(t => ({
    type: 'function',
    function: {
      name:        t.name,
      description: t.description,
      parameters:  t.input_schema,
    },
  }));
}

const OLLAMA_TOOLS = toOllamaTools(TOOL_DEFINITIONS);

// ── ANTHROPIC streaming + tool use loop ──────────────────────────────────

async function runWithTools_Anthropic(messages, systemPrompt, agent, onToken) {
  if (!anthropicClient) {
    throw new Error('ANTHROPIC_API_KEY is not set in .env — cannot use Claude for this agent.');
  }
  let fullTextResponse = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const blocks    = new Map(); // index → accumulated block
    let stopReason  = 'end_turn';

    const stream = await anthropicClient.messages.create({
      model:      agent.MODEL,
      max_tokens: Math.max(agent.MAX_TOKENS ?? 4096, 8192),
      system:     systemPrompt,
      messages,
      tools:      TOOL_DEFINITIONS,
      stream:     true,
    });

    for await (const event of stream) {
      switch (event.type) {

        case 'content_block_start': {
          const cb = event.content_block;
          blocks.set(event.index, {
            type:      cb.type,
            id:        cb.id   ?? null,
            name:      cb.name ?? null,
            text:      '',
            inputJson: '',
          });
          break;
        }

        case 'content_block_delta': {
          const block = blocks.get(event.index);
          if (!block) break;
          if (event.delta.type === 'text_delta') {
            block.text       += event.delta.text;
            fullTextResponse += event.delta.text;
            onToken(event.delta.text);
          } else if (event.delta.type === 'input_json_delta') {
            block.inputJson += event.delta.partial_json;
          }
          break;
        }

        case 'message_delta':
          stopReason = event.delta.stop_reason ?? 'end_turn';
          break;

        default: break;
      }
    }

    // Build assistant content array for history
    const assistantContent = [];
    for (const block of blocks.values()) {
      if (block.type === 'text' && block.text) {
        assistantContent.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        let input = {};
        try { input = JSON.parse(block.inputJson || '{}'); } catch { /* leave empty */ }
        assistantContent.push({ type: 'tool_use', id: block.id, name: block.name, input });
      }
    }
    if (assistantContent.length > 0) {
      messages.push({ role: 'assistant', content: assistantContent });
    }

    if (stopReason !== 'tool_use') break;

    // Execute all tool calls and send results back
    const toolBlocks  = [...blocks.values()].filter(b => b.type === 'tool_use');
    const toolResults = [];

    for (const toolBlock of toolBlocks) {
      let input = {};
      try { input = JSON.parse(toolBlock.inputJson || '{}'); } catch { /* leave empty */ }

      onToken(formatToolCall(toolBlock.name, input));
      const result    = await executeTool(toolBlock.name, input);
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      onToken(formatToolResult(resultStr));

      toolResults.push({
        type:        'tool_result',
        tool_use_id: toolBlock.id,
        content:     resultStr,
      });
      debug('tool %s → %d chars', toolBlock.name, resultStr.length);
    }

    messages.push({ role: 'user', content: toolResults });
  }

  return fullTextResponse;
}

// ── OLLAMA streaming + tool use loop ─────────────────────────────────────

async function runWithTools_Ollama(messages, systemPrompt, onToken) {
  let fullTextResponse = '';
  const toolsUsed = [];   // track tool names for spoken summary fallback

  // Ollama takes system as a message, not a separate param
  const ollamaMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let assistantText = '';
    const toolCalls   = [];   // [{id, name, arguments}]
    let finishReason  = 'stop';

    const stream = await ollamaClient.chat.completions.create({
      model:    OLLAMA_MODEL,
      messages: ollamaMessages,
      tools:    OLLAMA_TOOLS,
      stream:   true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Stream text tokens
      if (delta.content) {
        assistantText    += delta.content;
        fullTextResponse += delta.content;
        onToken(delta.content);
      }

      // Accumulate tool call deltas (streamed incrementally by Ollama)
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCalls[idx]) {
            toolCalls[idx] = { id: '', name: '', arguments: '' };
          }
          if (tc.id)                   toolCalls[idx].id        = tc.id;
          if (tc.function?.name)       toolCalls[idx].name      = tc.function.name;
          if (tc.function?.arguments)  toolCalls[idx].arguments += tc.function.arguments;
        }
      }

      if (chunk.choices[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason;
      }
    }

    // Add assistant message to Ollama history
    const validToolCalls = toolCalls.filter(tc => tc.name);
    const assistantMsg = { role: 'assistant', content: assistantText || null };
    if (validToolCalls.length > 0) {
      assistantMsg.tool_calls = validToolCalls.map((tc, i) => ({
        id:       tc.id || `call_${round}_${i}`,
        type:     'function',
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }
    ollamaMessages.push(assistantMsg);

    // Also push text-only turns to the shared history (for saveHandoff)
    if (assistantText && validToolCalls.length === 0) {
      messages.push({ role: 'assistant', content: assistantText });
    }

    if (finishReason !== 'tool_calls' || validToolCalls.length === 0) break;

    // Execute tool calls and add results as 'tool' role messages
    for (const tc of validToolCalls) {
      let input = {};
      try { input = JSON.parse(tc.arguments || '{}'); } catch { /* leave empty */ }

      onToken(formatToolCall(tc.name, input));
      const result    = await executeTool(tc.name, input);
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      onToken(formatToolResult(resultStr));

      ollamaMessages.push({
        role:         'tool',
        tool_call_id: tc.id || `call_${round}`,
        content:      resultStr,
      });
      toolsUsed.push(tc.name);
      debug('tool %s → %d chars', tc.name, resultStr.length);
    }
  }

  // Ollama coding models (qwen2.5-coder etc.) often end with tool calls and
  // produce no final summary text — fullTextResponse stays empty.
  // Generate a brief spoken-friendly summary so TTS has something to say.
  if (!fullTextResponse && toolsUsed.length > 0) {
    const unique = [...new Set(toolsUsed)];
    const toolList = unique.slice(0, 3).join(', ');
    fullTextResponse = `Done. I used ${toolList} to complete the task. Check the screen for the full output.`;
    // Emit it as a final token so it also shows in the TUI
    onToken(`\n✓ ${fullTextResponse}\n`);
  }

  return fullTextResponse;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Route a prompt to the active (or specified) agent.
 * Streams tokens via onToken; returns full response text.
 */
export async function routePrompt(userPrompt, { terminalIndex, onToken, onDone } = {}) {
  const state    = await readState();
  const terminal = terminalIndex ?? state.activeTerminal;
  const agent    = await loadAgent(terminal);
  const agentId  = getAgentIdByTerminal(terminal);

  const provider = getProviderForTerminal(terminal);
  debug('routing prompt to terminal %d (%s) via %s', terminal, agentId, provider);

  const context      = await buildAgentContext(terminal);
  const systemPrompt = `${agent.SYSTEM_PROMPT}\n\n${context}`;
  const history      = sessionHistories[terminal];
  const emit         = onToken ?? (() => {});

  history.push({ role: 'user', content: userPrompt });

  let fullResponse = '';

  try {
    if (provider === 'anthropic') {
      fullResponse = await runWithTools_Anthropic(history, systemPrompt, agent, emit);
    } else {
      fullResponse = await runWithTools_Ollama(history, systemPrompt, emit);
    }

    // Trim history to prevent unbounded growth
    if (history.length > MAX_HISTORY_MESSAGES) {
      history.splice(0, history.length - MAX_HISTORY_MESSAGES);
    }

    debug('terminal %d done (%d chars)', terminal, fullResponse.length);
    if (onDone) onDone(fullResponse);
    return fullResponse;

  } catch (err) {
    const providerHint = provider === 'ollama'
      ? ` — is Ollama running? (ollama serve) Is model "${OLLAMA_MODEL}" pulled? (ollama pull ${OLLAMA_MODEL})`
      : '';
    const msg = `[Agent error — terminal ${terminal} (${agentId})]: ${err.message}${providerHint}`;
    debug(msg);
    emit(`\n${msg}\n`);
    throw new Error(msg);
  }
}

/**
 * Save the last assistant response from a terminal as a handoff entry.
 */
export async function saveHandoff(terminalIndex) {
  const history = sessionHistories[terminalIndex];
  const last    = [...history].reverse().find(m => m.role === 'assistant');
  if (!last) return;

  let text = '';
  if (typeof last.content === 'string') {
    text = last.content;
  } else if (Array.isArray(last.content)) {
    text = last.content.filter(b => b.type === 'text').map(b => b.text).join('');
  }

  if (text) {
    await appendHandoff(terminalIndex, text);
    debug('saved handoff for terminal %d', terminalIndex);
  }
}

/** Return the rolling message history for a terminal. */
export function getHistory(terminalIndex) {
  return sessionHistories[terminalIndex] ?? [];
}

/** Clear the rolling history for a terminal (e.g. on /clear command). */
export function clearHistory(terminalIndex) {
  sessionHistories[terminalIndex] = [];
  debug('cleared history for terminal %d', terminalIndex);
}

/** Global fallback provider (used when no per-agent override is set). */
export const activeProvider = PROVIDER;
export const activeModel    = PROVIDER === 'ollama' ? OLLAMA_MODEL : null;

/**
 * Returns the resolved provider for a specific terminal index.
 * Use this in the UI to show the correct badge per agent pane.
 */
export function getAgentProvider(terminalIndex) {
  return getProviderForTerminal(terminalIndex);
}

/**
 * Returns a display label for a terminal's provider.
 * e.g. { label: 'Claude', short: 'C', color: 'magenta' }
 *      { label: 'Ollama',  short: 'O', color: 'green'   }
 */
export function getAgentProviderBadge(terminalIndex) {
  const p = getProviderForTerminal(terminalIndex);
  if (p === 'ollama') {
    return { label: `Ollama`, short: 'O', color: 'green' };
  }
  return { label: 'Claude', short: 'C', color: 'magenta' };
}
