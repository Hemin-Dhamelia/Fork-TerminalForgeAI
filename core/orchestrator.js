/**
 * core/orchestrator.js — PM Autonomous Orchestrator Loop
 *
 * Activated when the user submits a goal to T5 (Project Manager) while in AUTO mode.
 *
 * Flow:
 *   1. Route the goal to the PM agent (T5) — PM responds with a plan + JSON task list
 *   2. Parse the task list from the PM's response
 *   3. For each task: set terminal → working, route prompt, set terminal → done/failed
 *   4. Enforce step budget (default 20, from .terminalforge/config.json)
 *   5. Publish bus messages for every dispatch and completion
 *
 * Callbacks (all optional):
 *   onPMToken(chunk)                       — PM planning tokens → stream to T5 pane
 *   onAgentToken(terminalIndex, chunk)     — agent response tokens → stream to that pane
 *   onStatusChange(terminalIndex, status)  — 'working'|'done'|'failed' → update TUI colors immediately
 *   onDispatch(task, terminalIndex)        — task dispatched notification
 *   onTaskDone(task, terminalIndex)        — task completed notification
 *   onTaskFailed(task, terminalIndex, err) — task failed notification
 *   onBudgetExceeded(stepCount, maxSteps)  — step budget hit
 *   onComplete(results)                    — all tasks finished
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import createDebug from 'debug';

import { routePrompt } from './agent-router.js';
import { publish } from './message-bus.js';
import { setTerminalStatus, incrementAutonomousStep, readState } from './state.js';

const debug = createDebug('tf:orchestrator');

const __dirname   = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', '.terminalforge', 'config.json');

// Agent ID → terminal index mapping
const AGENT_TERMINAL = {
  'junior-dev':      1,
  'senior-dev':      2,
  'qa-engineer':     3,
  'devops-engineer': 4,
  'project-manager': 5,
};

// ── Config ────────────────────────────────────────────────────────────────────

async function readMaxSteps() {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(raw).maxSteps ?? 20;
  } catch {
    return 20;
  }
}

// ── Task list parser ──────────────────────────────────────────────────────────

/**
 * Extract a JSON task array from the PM's prose response.
 * Looks for a fenced code block tagged ```tasks or ```json first,
 * then falls back to finding a bare JSON array anywhere in the text.
 *
 * Expected task shape:
 *   { taskId, assignee, title, description }
 */
export function parseTaskList(pmResponse) {
  // Primary: ```tasks ... ``` or ```json ... ```
  const fenceMatch = pmResponse.match(/```(?:tasks|json)\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        debug('parsed %d tasks from fenced block', parsed.length);
        return normalise(parsed);
      }
    } catch { /* fall through */ }
  }

  // Fallback: first JSON array in the response
  const arrayMatch = pmResponse.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        debug('parsed %d tasks from inline array', parsed.length);
        return normalise(parsed);
      }
    } catch { /* fall through */ }
  }

  debug('no task list found in PM response');
  return [];
}

function normalise(tasks) {
  return tasks
    .filter(t => t && typeof t === 'object')
    .map((t, i) => ({
      taskId:      t.taskId      || t.id          || `task-${String(i + 1).padStart(3, '0')}`,
      assignee:    t.assignee    || t.agent        || 'junior-dev',
      title:       t.title       || t.name         || `Task ${i + 1}`,
      description: t.description || t.prompt       || t.content || t.title || '',
      priority:    t.priority    || 'medium',
    }))
    .filter(t => AGENT_TERMINAL[t.assignee]); // drop tasks with unknown assignees
}

// ── Build PM prompt for AUTO mode ─────────────────────────────────────────────

export function buildAutoModePrompt(goal) {
  return `AUTO MODE ACTIVATED

Goal: ${goal}

You are now running in Autonomous Mode. Your job:
1. Analyse the goal and break it into concrete tasks for the team
2. Write a brief plan (3-5 sentences max)
3. Output a JSON task list in this exact format:

\`\`\`tasks
[
  {
    "taskId": "task-001",
    "assignee": "junior-dev",
    "title": "Short imperative title",
    "description": "Full context this agent needs — file paths, acceptance criteria, constraints"
  }
]
\`\`\`

Rules:
- assignee must be one of: junior-dev, senior-dev, qa-engineer, devops-engineer
- Order tasks in execution sequence (dependencies first)
- Every implementation task must be followed by a qa-engineer verification task
- description must give the agent everything it needs — no hand-waving
- Maximum ${20} tasks total`;
}

// ── Main orchestrator loop ────────────────────────────────────────────────────

/**
 * Run the full PM orchestrator loop for a given goal.
 *
 * @param {string} goal     — the high-level goal from the user
 * @param {object} callbacks — see module docblock above
 */
export async function runOrchestratorLoop(goal, callbacks = {}) {
  const {
    onPMToken,
    onAgentToken,
    onStatusChange,
    onDispatch,
    onTaskDone,
    onTaskFailed,
    onBudgetExceeded,
    onComplete,
  } = callbacks;

  const maxSteps = await readMaxSteps();
  debug('orchestrator start: goal=%s maxSteps=%d', goal.slice(0, 60), maxSteps);

  // ── Step 1: PM plans ────────────────────────────────────────────────────────

  onStatusChange?.(5, 'working');
  await setTerminalStatus(5, 'working').catch(() => {});

  let pmResponse = '';
  try {
    pmResponse = await routePrompt(buildAutoModePrompt(goal), {
      terminalIndex: 5,
      onToken: (chunk) => {
        pmResponse; // access to keep closure live
        onPMToken?.(chunk);
      },
    });
  } catch (err) {
    onStatusChange?.(5, 'failed');
    await setTerminalStatus(5, 'failed').catch(() => {});
    throw new Error(`PM planning failed: ${err.message}`);
  }

  onStatusChange?.(5, 'done');
  await setTerminalStatus(5, 'done').catch(() => {});
  await incrementAutonomousStep().catch(() => {});

  // ── Step 2: Parse task list ─────────────────────────────────────────────────

  const tasks = parseTaskList(pmResponse);
  debug('tasks to dispatch: %d', tasks.length);

  if (tasks.length === 0) {
    // PM gave a plan but no structured task list — still useful, just not dispatching
    debug('no tasks parsed — PM response was free-form planning only');
    onComplete?.({ stepCount: 1, tasks: [], results: [] });
    return;
  }

  // ── Step 3: Execute tasks sequentially ─────────────────────────────────────

  let stepCount = 1; // PM plan = step 1
  const results = [];

  for (const task of tasks) {
    // Budget check
    const state = await readState().catch(() => ({ autonomousStepCount: 0 }));
    if (state.autonomousStepCount >= maxSteps || stepCount >= maxSteps) {
      debug('step budget exceeded: %d/%d', stepCount, maxSteps);
      onBudgetExceeded?.(stepCount, maxSteps);

      // PM notifies itself
      await publish({
        from: 'project-manager',
        to:   'project-manager',
        type: 'summary',
        payload: `Step budget (${maxSteps}) exceeded after ${stepCount} steps. Autonomous mode paused. Remaining tasks: ${tasks.length - results.length}. Resume with a new goal or increase maxSteps in .terminalforge/config.json.`,
      }).catch(() => {});

      break;
    }

    const terminalIndex = AGENT_TERMINAL[task.assignee];

    // Publish dispatch decision to bus
    await publish({
      from:    'project-manager',
      to:      task.assignee,
      type:    'task',
      payload: `[AUTO] ${task.title}\n\n${task.description}`,
      taskId:  task.taskId,
    }).catch(() => {});

    onDispatch?.(task, terminalIndex);
    onStatusChange?.(terminalIndex, 'working');
    await setTerminalStatus(terminalIndex, 'working').catch(() => {});
    await incrementAutonomousStep().catch(() => {});
    stepCount++;

    debug('dispatching task %s to terminal %d (%s)', task.taskId, terminalIndex, task.assignee);

    try {
      await routePrompt(task.description, {
        terminalIndex,
        onToken: (chunk) => onAgentToken?.(terminalIndex, chunk),
      });

      onStatusChange?.(terminalIndex, 'done');
      await setTerminalStatus(terminalIndex, 'done').catch(() => {});
      onTaskDone?.(task, terminalIndex);
      results.push({ task, status: 'done' });

      // Agent reports completion back to PM
      await publish({
        from:   task.assignee,
        to:     'project-manager',
        type:   'summary',
        payload: `Task ${task.taskId} (${task.title}) completed.`,
        taskId: task.taskId,
      }).catch(() => {});

      debug('task %s done', task.taskId);

    } catch (err) {
      onStatusChange?.(terminalIndex, 'failed');
      await setTerminalStatus(terminalIndex, 'failed').catch(() => {});
      onTaskFailed?.(task, terminalIndex, err);
      results.push({ task, status: 'failed', error: err.message });

      // Agent escalates failure to PM
      await publish({
        from:   task.assignee,
        to:     'project-manager',
        type:   'escalation',
        payload: `Task ${task.taskId} (${task.title}) failed: ${err.message}`,
        taskId: task.taskId,
      }).catch(() => {});

      debug('task %s failed: %s', task.taskId, err.message);
    }
  }

  const done    = results.filter(r => r.status === 'done').length;
  const failed  = results.filter(r => r.status === 'failed').length;
  debug('orchestrator complete: %d done, %d failed, %d steps', done, failed, stepCount);

  onComplete?.({ stepCount, tasks, results });
}
