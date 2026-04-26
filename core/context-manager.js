import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import createDebug from 'debug';
import simpleGit from 'simple-git';

const debug = createDebug('tf:core');
const __dirname = dirname(fileURLToPath(import.meta.url));
const TF_DIR = join(__dirname, '..', '.terminalforge');
const ROOT_DIR = join(__dirname, '..');

const AGENT_NAMES = {
  1: 'Junior Developer',
  2: 'Senior Developer',
  3: 'QA Engineer',
  4: 'DevOps Engineer',
  5: 'Project Manager',
};

async function safeRead(filePath, fallback = '') {
  try {
    if (!existsSync(filePath)) return fallback;
    return await readFile(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

async function getGitSummary() {
  try {
    const git = simpleGit(ROOT_DIR);
    const [status, log] = await Promise.all([
      git.status(),
      git.log({ maxCount: 10, '--oneline': null }),
    ]);

    const statusLines = [
      ...status.modified.map(f => `M  ${f}`),
      ...status.created.map(f => `A  ${f}`),
      ...status.deleted.map(f => `D  ${f}`),
      ...status.not_added.map(f => `?? ${f}`),
    ].join('\n') || '(clean)';

    const logLines = log.all.map(c => `${c.hash.slice(0, 7)} ${c.message}`).join('\n') || '(no commits)';

    return `Git status:\n${statusLines}\n\nRecent commits:\n${logLines}`;
  } catch (err) {
    debug('git summary failed: %s', err.message);
    return '(git summary unavailable)';
  }
}

async function getLastHandoffs(count = 3) {
  const handoffsPath = join(TF_DIR, 'handoffs.md');
  const content = await safeRead(handoffsPath);
  if (!content.trim()) return '(no handoffs yet)';

  const sections = content.split(/^---$/m).filter(Boolean);
  return sections.slice(-count).join('\n---\n').trim();
}

async function getTasksForAgent(agentId) {
  const tasksPath = join(TF_DIR, 'open_tasks.json');
  const raw = await safeRead(tasksPath, '[]');
  try {
    const tasks = JSON.parse(raw);
    const mine = tasks.filter(t => t.assignee === agentId && t.status !== 'done');
    if (mine.length === 0) return '(no open tasks assigned to you)';
    return mine.map(t => `[${t.priority?.toUpperCase() || 'MEDIUM'}] ${t.id}: ${t.title} — ${t.status}`).join('\n');
  } catch {
    return '(could not parse open_tasks.json)';
  }
}

async function getUnreadMessages(agentId) {
  const logPath = join(TF_DIR, 'messages.log');
  const raw = await safeRead(logPath);
  if (!raw.trim()) return '(no messages)';

  const messages = raw
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(msg => msg && msg.to === agentId && !msg.read);

  if (messages.length === 0) return '(no unread messages)';
  return messages.map(m => `[${m.type}] from ${m.from}: ${m.payload}`).join('\n');
}

export async function buildHandoffBlock(fromTerminalIndex, toTerminalIndex, lastOutput = '') {
  const fromName = AGENT_NAMES[fromTerminalIndex] || `Terminal ${fromTerminalIndex}`;
  const toAgentId = getAgentIdByTerminal(toTerminalIndex);

  const summary = lastOutput.slice(-500).trim() || '(no previous output)';

  const [gitSummary, tasks, messages] = await Promise.all([
    getGitSummary(),
    getTasksForAgent(toAgentId),
    getUnreadMessages(toAgentId),
  ]);

  return `=== HANDOFF FROM ${fromName.toUpperCase()} ===
Last output: ${summary}
${gitSummary}
Open tasks for you:
${tasks}
Messages for you:
${messages}
=== END HANDOFF ===`;
}

export async function buildAgentContext(terminalIndex) {
  const agentId = getAgentIdByTerminal(terminalIndex);

  const [projectMd, handoffs, tasks, messages, gitSummary] = await Promise.all([
    safeRead(join(TF_DIR, 'project.md')),
    getLastHandoffs(3),
    getTasksForAgent(agentId),
    getUnreadMessages(agentId),
    getGitSummary(),
  ]);

  debug('built context for terminal %d (%s)', terminalIndex, agentId);

  return [
    '=== SHARED PROJECT CONTEXT ===',
    projectMd.trim() || '(no project loaded — ask the user to describe their project)',
    '',
    '=== RECENT HANDOFFS (last 3) ===',
    handoffs,
    '',
    '=== YOUR OPEN TASKS ===',
    tasks,
    '',
    '=== MESSAGES FOR YOU ===',
    messages,
    '',
    '=== GIT SUMMARY ===',
    gitSummary,
    '=== END CONTEXT ===',
  ].join('\n');
}

export async function appendHandoff(fromTerminalIndex, summary) {
  const { writeFile, appendFile } = await import('fs/promises');
  const handoffsPath = join(TF_DIR, 'handoffs.md');
  const fromName = AGENT_NAMES[fromTerminalIndex] || `Terminal ${fromTerminalIndex}`;
  const entry = `\n---\n**${fromName}** — ${new Date().toISOString()}\n${summary.slice(0, 500)}\n`;

  try {
    await appendFile(handoffsPath, entry, 'utf8');
    debug('handoff appended from terminal %d', fromTerminalIndex);
  } catch (err) {
    throw new Error(`Failed to append handoff: ${err.message}`);
  }
}

export function getAgentIdByTerminal(terminalIndex) {
  const map = {
    1: 'junior-dev',
    2: 'senior-dev',
    3: 'qa-engineer',
    4: 'devops-engineer',
    5: 'project-manager',
  };
  return map[terminalIndex] || 'junior-dev';
}
