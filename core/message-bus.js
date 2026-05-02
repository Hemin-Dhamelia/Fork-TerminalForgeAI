import { EventEmitter } from 'events';
import { appendFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import createDebug from 'debug';

const debug = createDebug('tf:core');

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_PATH  = join(__dirname, '..', '.terminalforge', 'messages.log');

class MessageBus extends EventEmitter {}
const bus = new MessageBus();
bus.setMaxListeners(20);

const AGENT_NAMES = {
  'junior-dev':      { label: 'Junior Developer', emoji: '👨‍💻', terminal: 1 },
  'senior-dev':      { label: 'Senior Developer',  emoji: '🧠', terminal: 2 },
  'qa-engineer':     { label: 'QA Engineer',        emoji: '🔍', terminal: 3 },
  'devops-engineer': { label: 'DevOps Engineer',    emoji: '⚙️',  terminal: 4 },
  'project-manager': { label: 'Project Manager',    emoji: '📋', terminal: 5 },
};

const MESSAGE_TYPES = ['task', 'review', 'escalation', 'bug-report', 'handoff', 'summary'];

/**
 * Publish a message from one agent to another.
 * Validates the envelope, emits on the bus, and appends to messages.log.
 *
 * @param {object} msg - { from, to, type, payload, taskId? }
 * @returns {object} - the full message envelope with id + timestamp
 */
export async function publish(msg) {
  const { from, to, type, payload, taskId } = msg;

  if (!AGENT_NAMES[from]) throw new Error(`Unknown sender agent: "${from}"`);
  if (!AGENT_NAMES[to])   throw new Error(`Unknown recipient agent: "${to}"`);
  if (!MESSAGE_TYPES.includes(type)) throw new Error(`Invalid message type: "${type}". Must be one of: ${MESSAGE_TYPES.join(', ')}`);
  if (!payload) throw new Error('Message payload is required');

  const envelope = {
    id:        `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    from,
    to,
    type,
    payload,
    taskId:    taskId || null,
    timestamp: new Date().toISOString(),
    read:      false,
  };

  // Append to messages.log
  try {
    await appendFile(LOG_PATH, JSON.stringify(envelope) + '\n', 'utf8');
  } catch (err) {
    debug('Failed to write to messages.log: %s', err.message);
  }

  // Emit on the bus — listeners in each REPL will pick this up
  bus.emit('message', envelope);
  bus.emit(`message:${to}`, envelope);   // targeted
  bus.emit(`message:from:${from}`, envelope); // sender-specific

  debug(
    '[%s] %s → %s  type=%s',
    envelope.id,
    AGENT_NAMES[from].emoji,
    AGENT_NAMES[to].emoji,
    type
  );

  return envelope;
}

/**
 * Subscribe to all messages addressed to a specific agent.
 * @param {string} agentId - e.g. 'junior-dev'
 * @param {function} callback - called with the full envelope
 */
export function subscribe(agentId, callback) {
  bus.on(`message:${agentId}`, callback);
  debug('subscribed %s to message bus', agentId);
}

/**
 * Subscribe to ALL messages (used by the bus monitor).
 */
export function subscribeAll(callback) {
  bus.on('message', callback);
}

/**
 * Unsubscribe from messages for a specific agent.
 */
export function unsubscribe(agentId, callback) {
  bus.off(`message:${agentId}`, callback);
}

/**
 * Read all messages from messages.log.
 * @returns {Array} - parsed message envelopes
 */
export async function readLog() {
  try {
    if (!existsSync(LOG_PATH)) return [];
    const raw = await readFile(LOG_PATH, 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get unread messages for a specific agent.
 */
export async function getUnread(agentId) {
  const all = await readLog();
  return all.filter(m => m.to === agentId && !m.read);
}

export { bus, AGENT_NAMES, MESSAGE_TYPES };
