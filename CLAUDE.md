# CLAUDE.md — TerminalForge

This file is read automatically by Claude Code at the start of every session.
It defines the rules, conventions, and context for this project.

---

## Project Identity

**Name:** TerminalForge
**Type:** macOS terminal-based multi-agent AI development platform
**Version:** v1.0 (in development)
**Language:** Node.js 18+ (primary), Python 3.11+ (voice pipeline)

**Fork repo (your working copy):** https://github.com/Hemin-Dhamelia/Fork-TerminalForgeAI.git
**Upstream main repo:** https://github.com/TerminalForgeAI/TerminalForgeAI.git

---

## What This Project Does

TerminalForge runs 5 AI agents (Junior Dev, Senior Dev, QA Engineer, DevOps Engineer, Project Manager) in a single macOS terminal session. Users navigate between agents using iPhone volume buttons. Voice input (faster-whisper, local) and text input are both supported. Agents communicate with each other via an in-process EventEmitter message bus. The PM agent can orchestrate the full team autonomously.

---

## Folder Structure

```
terminalforge/
├── CLAUDE.md                  ← you are here
├── .env                       ← secrets (never commit)
├── .env.example               ← committed template
├── package.json
├── .terminalforge/            ← runtime state (git-ignored)
│   ├── state.json             ← { activeTerminal: 1-5, mode: "manual"|"auto" }
│   ├── messages.log           ← agent-to-agent message log
│   ├── project.md             ← current project description
│   ├── open_tasks.json        ← task list
│   ├── handoffs.md            ← cross-agent handoff notes
│   └── config.json            ← user config (max steps, voice mode, etc.)
├── core/
│   ├── state.js               ← state.json read/write
│   ├── event-listener.js      ← consumes vol events, emits agent:switch
│   ├── agent-router.js        ← routes prompts to correct Claude session
│   ├── message-bus.js         ← EventEmitter message bus
│   └── context-manager.js     ← injects shared context into agent calls
├── agents/
│   ├── junior-dev.js
│   ├── senior-dev.js
│   ├── qa-engineer.js
│   ├── devops-engineer.js
│   └── project-manager.js     ← includes PM orchestrator loop
├── voice/
│   ├── vad.py                 ← silero-vad
│   ├── transcriber.py         ← faster-whisper wrapper
│   ├── wake-word.py           ← openWakeWord "Hey Forge"
│   └── tts.py                 ← ElevenLabs / macOS say
├── bridge/
│   ├── server.js              ← HTTP :3333, receives vol button POST events
│   └── hotkey-fallback.js     ← keyboard shortcut fallback
└── ui/
    ├── App.js                 ← root Ink component
    ├── AgentBadge.js
    ├── ModeIndicator.js
    ├── StreamPanel.js
    ├── VoiceIndicator.js
    └── TerminalColorManager.js  ← task state → terminal background colour
```

---

## Git Rules — ALWAYS FOLLOW THESE

```bash
# Never commit directly to main
# Always use feature branches
git checkout -b feature/<phase>-<short-description>

# Branch naming convention
feature/phase1-event-listener
feature/phase2-agent-engine
feature/phase3-voice-pipeline
feature/phase4-tui
feature/phase5-message-bus
fix/<short-description>
chore/<short-description>

# Commit message format (Conventional Commits)
feat(phase1): add Express daemon for volume events
fix(bridge): handle rapid button press debounce
chore: update .gitignore for .terminalforge runtime

# Upstream sync (do this before starting new work)
git fetch upstream
git rebase upstream/main

# Push to fork, PR to upstream
git push origin feature/<branch-name>
# Then open PR: Hemin-Dhamelia/Fork-TerminalForgeAI → TerminalForgeAI/TerminalForgeAI
```

### Files to NEVER commit
- `.env` (API keys)
- `.terminalforge/state.json` (runtime state)
- `.terminalforge/messages.log`
- `node_modules/`
- `__pycache__/`
- `*.pyc`

---

## Coding Standards

### Node.js
- ES modules only: `import/export` — never `require()`
- `async/await` throughout — never raw `.then()` chains
- Always handle errors: every `await` in a try/catch with a meaningful message
- Use the `debug` package for logging. Namespaces: `tf:core`, `tf:bridge`, `tf:agent`, `tf:voice`, `tf:ui`
- Never `console.log` in production code — use debug namespaces

### Python
- Python 3.11+ with type hints on all functions
- `asyncio` for the voice pipeline
- Use `loguru` for logging

### Environment & Config
- All API keys and secrets live in `.env` — load with `dotenv`
- User preferences (voice mode, TTS on/off, step budget) live in `.terminalforge/config.json`
- Never hardcode API keys, ports, or paths

### Claude API
- Model: `claude-sonnet-4-5`
- Always stream: `stream: true`
- Max tokens per call: 4096 (agents), 1024 (orchestrator dispatch messages)
- Context injection: last 3 handoffs + current git summary only — never full history
- System prompts: stored in each `agents/*.js` file as exported constants

---

## State Management

`.terminalforge/state.json` is the single source of truth:

```json
{
  "activeTerminal": 1,
  "mode": "manual",
  "lastSwitch": "2026-04-25T10:00:00Z",
  "autonomousStepCount": 0,
  "terminalStatus": {
    "1": "idle",
    "2": "idle",
    "3": "idle",
    "4": "idle",
    "5": "idle"
  }
}
```

- `activeTerminal`: 1–5 (maps to Junior Dev, Senior Dev, QA, DevOps, PM)
- `mode`: `"manual"` or `"auto"`
- `terminalStatus`: per-terminal task state — `"idle"` | `"working"` | `"done"` | `"failed"`
- Hold either vol button 2s → toggle mode

Navigation logic (never change this):
```javascript
// Vol DOWN (forward): 1→2→3→4→5→1
const next = (current % 5) + 1;

// Vol UP (backward): 5→4→3→2→1→5
const prev = ((current - 2 + 5) % 5) + 1;
```

---

## Agent Identity Map

| Terminal | Agent | Core Role |
|---|---|---|
| 1 | Junior Developer | Code scaffolding, feature impl, unit tests, bug fixes |
| 2 | Senior Developer | Architecture, code review, complex problems |
| 3 | QA Engineer | Test plans, test generation, bug reports |
| 4 | DevOps Engineer | CI/CD, Docker, infra-as-code, deploy scripts |
| 5 | Project Manager | PRD, task breakdown, sprint planning, orchestration |

---

## Message Bus Format

All agent-to-agent messages use this JSON envelope:

```json
{
  "from": "junior-dev",
  "to": "senior-dev",
  "type": "escalation",
  "payload": "Stuck on JWT refresh token logic — need senior review",
  "taskId": "task-042",
  "timestamp": "2026-04-25T10:30:00Z"
}
```

Message types: `task`, `review`, `escalation`, `bug-report`, `handoff`, `summary`

All messages are appended to `.terminalforge/messages.log` (newline-delimited JSON).

---

## Handoff Injection Template

Inject this at the top of every agent's context on switch:

```
=== HANDOFF ===
From: [previous agent name]
Last output summary: [last ~500 chars]
Git status: [git status --short]
Changed files: [git diff HEAD --name-only]
Tasks for you: [items from open_tasks.json where assignee matches this agent]
Messages for you: [unread messages.log entries where to === this agent]
=== END HANDOFF ===
```

---

## Voice Pipeline (Phase 3+)

```
mic → silero-vad (detect speech) → faster-whisper (transcribe, local)
    → live preview in TUI → send to active agent → optional TTS response
```

Voice modes (default: Push-to-Talk):
- `push-to-talk`: hold F5 while speaking (most reliable — build this first)
- `wake-word`: say "Hey Forge" (requires openWakeWord)
- `auto-vad`: always listening (build last)

Target latency: < 2 seconds from end of speech to agent receiving text.

---

## Bridge: iPhone Volume Button Mapping

iOS Shortcut sends POST to `http://localhost:3333/volume`:

```json
{ "button": "down" }   // Vol DOWN pressed
{ "button": "up" }     // Vol UP pressed
{ "button": "hold" }   // Either button held 2s → toggle mode
```

The bridge server must debounce rapid presses (< 300ms between presses = ignore duplicate).

---

## Terminal Colour System — Task State Indicator

Terminal background colour must reflect the current task state of each agent in real time. This is a core UX requirement, not optional.

| State | Colour | Ink Class | When It Applies |
|---|---|---|---|
| `idle` | Default (no colour) | none | Agent waiting, no active task |
| `working` | Yellow | `bgYellow` | Agent actively executing a task |
| `done` | Green | `bgGreen` | Task completed successfully |
| `failed` | Red | `bgRed` | Task failed — error or explicit failure signal |

### Rules

- The colour applies to the **entire terminal panel** — header, badge, and streaming output area
- Yellow fires **immediately** when a task is dispatched — before the first token streams
- Green fires within **< 100ms** of a `task:done` event
- Red fires immediately on `task:failed` or any unhandled API error
- The **sidebar always shows all 5 terminals** with their current colour so the user can see full team status at a glance
- Colour resets to `idle` only when a new task is dispatched to that terminal, or when the user runs `reset agent`
- Switching away from a terminal mid-task does NOT reset its colour — it stays yellow in the sidebar

### Events that drive colour state (wire to message bus)

```
task:dispatched  →  set terminalStatus[N] = "working"   →  yellow
task:done        →  set terminalStatus[N] = "done"      →  green
task:failed      →  set terminalStatus[N] = "failed"    →  red
agent:reset      →  set terminalStatus[N] = "idle"      →  default
```

### Implementation: `ui/TerminalColorManager.js`

```javascript
export const STATUS_COLOURS = {
  idle:    { bg: '',         label: ''        },
  working: { bg: 'bgYellow', label: 'WORKING' },
  done:    { bg: 'bgGreen',  label: 'DONE'    },
  failed:  { bg: 'bgRed',    label: 'FAILED'  },
};

export function getTerminalColour(terminalIndex, terminalStatus) {
  const status = terminalStatus[String(terminalIndex)] || 'idle';
  return STATUS_COLOURS[status];
}
```

Built in Phase 4 (TUI). Wired to message bus events in Phase 5.

---

## Autonomous Mode Rules

- Triggered by holding either volume button for 2 seconds
- PM agent receives a high-level goal, creates a task list, dispatches to agents
- Max step budget: 20 (configurable in `.terminalforge/config.json` as `maxSteps`)
- User can interrupt at any time by holding either button → returns to Manual Mode
- PM must log every dispatch decision to `messages.log`
- If step budget exceeded, PM must stop and ask user for direction

---

## Current Build Phase

> **Phase 1: Foundation — IN PROGRESS**

Next file to build: `core/state.js` then `bridge/server.js`

Do NOT move to Phase 2 until Phase 1 success criteria are confirmed:
- Vol DOWN 3× advances terminal 1→2→3
- Vol UP from 3 returns to 2, then 1, then 5 (wrap)
- State persists correctly in `state.json`
- Anthropic API streaming test passes in terminal

---

## Do Not Touch

- Never modify `.terminalforge/` files directly — always use `core/state.js` and `core/context-manager.js`
- Never add a GUI, web interface, or Electron wrapper — terminal only in v1
- Never use an external message broker (Redis, RabbitMQ, etc.) — EventEmitter only
- Never add Windows or Linux-specific code in v1 — macOS first
- Never run parallel agent output — one agent active at a time

---

## Useful Commands

```bash
# Start the bridge server
node bridge/server.js

# Simulate a volume press (test)
curl -X POST http://localhost:3333/volume -H "Content-Type: application/json" -d '{"button":"down"}'

# Check current state
cat .terminalforge/state.json

# Watch message log live
tail -f .terminalforge/messages.log

# Run all tests
npm test

# Lint
npm run lint
```
