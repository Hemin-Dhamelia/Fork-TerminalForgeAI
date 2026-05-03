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

TerminalForge runs 5 AI agents (Junior Dev, Senior Dev, QA Engineer, DevOps Engineer, Project Manager) in a single macOS terminal session. Users navigate between agents using iPhone volume buttons. Voice input (faster-whisper, local) and text input are both supported. Agents communicate with each other via an in-process EventEmitter message bus. The PM agent can orchestrate the full team autonomously. A dedicated Bus Monitor window shows all inter-agent traffic in real time.

---

## Folder Structure

```
terminalforge/
├── CLAUDE.md                  ← you are here
├── README.md                  ✅ BUILT — project overview and quickstart
├── .env                       ← secrets (never commit)
├── .env.example               ← committed template
├── package.json
├── .terminalforge/            ← runtime state (git-ignored)
│   ├── state.json             ← { activeTerminal: 1-5, mode: "manual"|"auto" }
│   ├── messages.log           ← agent-to-agent message log (newline-delimited JSON)
│   ├── project.md             ← current project description
│   ├── open_tasks.json        ← task list
│   ├── handoffs.md            ← cross-agent handoff notes
│   └── config.json            ← user config (max steps, voice mode, etc.)
├── core/
│   ├── state.js               ✅ BUILT — state.json read/write + navigation logic
│   ├── event-listener.js      ✅ BUILT — consumes vol events, emits agent:switch
│   ├── agent-router.js        ✅ BUILT — routes prompts to correct Claude session, streaming
│   ├── message-bus.js         ✅ BUILT — EventEmitter bus, publish/subscribe, messages.log
│   └── context-manager.js     ✅ BUILT — injects shared context into agent calls
├── agents/
│   ├── junior-dev.js          ✅ BUILT — system prompt + tools config
│   ├── senior-dev.js          ✅ BUILT — system prompt + tools config
│   ├── qa-engineer.js         ✅ BUILT — system prompt + tools config
│   ├── devops-engineer.js     ✅ BUILT — system prompt + tools config
│   └── project-manager.js     ✅ BUILT — system prompt + orchestrator config (loop: Phase 5)
├── scripts/
│   ├── launch.sh              ✅ BUILT — opens 7 windows (bridge + 5 agents + bus monitor)
│   ├── tmux-layout.sh         ✅ BUILT — tmux 7-window layout (windows 0–6)
│   ├── agent-repl.js          ✅ BUILT — per-agent REPL: streaming output + /msg /reply commands
│   └── bus-monitor.js         ✅ BUILT — live inter-agent traffic monitor (all messages)
├── voice/
│   ├── vad.py                 ← silero-vad (Phase 3)
│   ├── transcriber.py         ← faster-whisper wrapper (Phase 3)
│   ├── wake-word.py           ← openWakeWord "Hey Forge" (Phase 3)
│   └── tts.py                 ← ElevenLabs / macOS say (Phase 3)
├── bridge/
│   ├── server.js              ✅ BUILT — HTTP :3333, receives vol button POST events
│   └── hotkey-fallback.js     ← keyboard shortcut fallback (Phase 3)
├── tests/
│   ├── test-switch.js         ✅ BUILT — Phase 1, 19 tests passing
│   ├── test-agents.js         ✅ BUILT — Phase 2, 47 tests passing
│   └── smoke-test-agents.js   ✅ BUILT — Phase 2, live Claude API streaming test
└── ui/
    ├── App.js                 ← root Ink component (Phase 4)
    ├── AgentBadge.js          ← active agent badge (Phase 4)
    ├── ModeIndicator.js       ← MANUAL / AUTO badge (Phase 4)
    ├── StreamPanel.js         ← streaming agent output (Phase 4)
    ├── VoiceIndicator.js      ← listening / transcribing status (Phase 4)
    └── TerminalColorManager.js ← task state → terminal background colour (Phase 4)
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
  "lastSwitch": "2026-04-27T10:00:00Z",
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
  "id": "msg-1777750172857-kkwm",
  "from": "junior-dev",
  "to": "senior-dev",
  "type": "escalation",
  "payload": "Stuck on JWT refresh token logic — need senior review",
  "taskId": "task-042",
  "timestamp": "2026-04-27T10:30:00Z",
  "read": false
}
```

Message types: `task`, `review`, `escalation`, `bug-report`, `handoff`, `summary`

All messages are appended to `.terminalforge/messages.log` (newline-delimited JSON).

### Message Bus API (`core/message-bus.js`)

```javascript
publish({ from, to, type, payload, taskId? })  // validate + emit + log to messages.log
subscribe(agentId, callback)                    // targeted — each agent REPL calls this
subscribeAll(callback)                          // all traffic — bus-monitor uses this
unsubscribe(agentId, callback)
readLog()                                       // parse full messages.log → array
getUnread(agentId)                              // unread messages for a specific agent
```

### Agent REPL Commands (`scripts/agent-repl.js`)

```
/msg <agentId> <type> <message>   — send a message to another agent
/reply <message>                  — quick-reply to the last received message
/clear                            — clear conversation history for this agent
/status                           — show current terminal state from state.json
/quit                             — exit this agent REPL
```

Agent IDs: `junior-dev` `senior-dev` `qa-engineer` `devops-engineer` `project-manager`
Message types: `task` `review` `escalation` `bug-report` `handoff` `summary`

---

## Bus Monitor (`scripts/bus-monitor.js`)

The Bus Monitor runs in a dedicated 7th terminal window and shows all inter-agent messages in real time.

- Replays last 20 historical messages from `messages.log` on start
- Subscribes to all live traffic via `subscribeAll()`
- Polls `messages.log` every 500ms to catch messages published from other processes
- Displays: timestamp, from-agent emoji + name, to-agent emoji + name, type icon + label, word-wrapped payload
- Periodic status bar shows all 5 terminal states (idle/working/done/failed) and current mode

Launch it standalone: `npm run monitor`

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

> **Phase 3: Voice Layer — NEXT**

### ✅ Phase 1: Foundation — COMPLETE
- `core/state.js`, `bridge/server.js`, `core/event-listener.js`
- 19 tests passing — all navigation + state persistence + debounce verified
- Success criteria confirmed: Vol DOWN 3× → 1→2→3, Vol UP wraps, state persists

### ✅ Phase 2: Agent Engine — COMPLETE
- All 5 agent files with system prompts and identity configs
- `core/agent-router.js` — streaming Claude API sessions, 20-msg rolling history per terminal
- `core/context-manager.js` — git + handoffs + tasks + messages injected per call
- 47 tests passing + live smoke test against real Claude API

### ✅ Launcher Scripts — COMPLETE (bonus, beyond original plan)
- `scripts/launch.sh` — auto-opens 7 terminal windows (bridge + 5 agents + bus monitor)
- `scripts/tmux-layout.sh` — tmux 7-window layout (windows 0–6)
- `scripts/agent-repl.js` — interactive REPL with coloured streaming output, /msg and /reply commands

### ✅ Observability Layer — COMPLETE (bonus, early Phase 5 foundation)
- `core/message-bus.js` — EventEmitter bus: publish/subscribe/subscribeAll/readLog/getUnread
- `scripts/bus-monitor.js` — live monitor: replays history, polls log, shows all inter-agent traffic
- `scripts/agent-repl.js` updated — incoming messages displayed inline with colour-coded banners
- All message flow tests passing: targeted delivery, subscribeAll fan-out, log persistence, validation

### ✅ End-to-End Testing — COMPLETE (May 2026)
Full live test suite run against the real stack and real Claude API. All 8 test areas verified:

| # | Test Area | Result | Detail |
|---|-----------|--------|--------|
| 1 | Bridge server | ✅ Pass | `/health`, `/volume` (down/up/hold), `/state`, 300ms debounce all working |
| 2 | All 5 agents — Claude API | ✅ Pass | T1 1797ms · T2 1666ms · T3 2211ms · T4 2264ms · T5 2371ms |
| 3 | Agent-to-agent messaging | ✅ Pass | `/msg`, `/reply`, targeted delivery, `subscribeAll` fan-out, all validation rejections |
| 4 | Message bus | ✅ 11/11 | publish/subscribe/readLog/getUnread, invalid agent/type/payload all rejected |
| 5 | Context injection | ✅ 17/18 | PROJECT, GIT, TASKS, MESSAGES, HANDOFF sections all injected correctly |
| 6 | Bus monitor | ✅ Pass | History replay, live `subscribeAll`, 500ms cross-process poll all confirmed |
| 7 | Navigation + state | ✅ 15/15 | DOWN 1→2→3→4→5→1, UP wraparound, HOLD toggle, debounce verified |
| 8 | Full E2E pipeline | ✅ 25/25 | PM → task → junior-dev (context) → escalation → senior-dev → Claude review |

E2E pipeline confirmed: PM created a task via Claude API → published to junior-dev via message bus → Junior Dev's context injection included the unread task → Junior Dev implemented + escalated via Claude → Senior Dev reviewed and approved via Claude API → full trace in `messages.log`. Zero regressions across all components.

### 🔜 Phase 3: Voice Layer — NEXT
Files to build: `voice/vad.py`, `voice/transcriber.py`, `voice/wake-word.py`, `voice/tts.py`, `bridge/hotkey-fallback.js`

Do NOT move to Phase 4 until Phase 3 success criteria are confirmed:
- Hold F5, speak, release → transcribed text sent to active agent
- Transcription latency < 2 seconds end-to-end
- Works fully offline (local faster-whisper model)

### 🔜 Phase 4: TUI
Files to build: all `ui/*.js` components using Ink (React-for-terminal)

### 🔜 Phase 5: Agent Communication (message bus core ✅ done — finish PM orchestrator loop)
Remaining: PM orchestrator loop in `agents/project-manager.js`, wiring bus events to TUI colour state

### 🔜 Phase 6: Polish
Error handling, retry logic, `docs/QUICKSTART.md`, end-to-end demo

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
# Launch all 5 agents + bridge server + bus monitor (opens 7 windows automatically)
npm run launch

# Launch using tmux (7 windows in one terminal, Ctrl+B 0-6 to switch)
npm run launch:tmux

# Open a single agent REPL manually
npm run agent 1   # Junior Developer
npm run agent 2   # Senior Developer
npm run agent 3   # QA Engineer
npm run agent 4   # DevOps Engineer
npm run agent 5   # Project Manager

# Open the bus monitor standalone (live inter-agent traffic)
npm run monitor

# Start the bridge server only
npm start
node bridge/server.js

# Simulate a volume press (test)
curl -X POST http://localhost:3333/volume -H "Content-Type: application/json" -d '{"button":"down"}'
curl -X POST http://localhost:3333/volume -H "Content-Type: application/json" -d '{"button":"up"}'
curl -X POST http://localhost:3333/volume -H "Content-Type: application/json" -d '{"button":"hold"}'

# Check current state
cat .terminalforge/state.json

# Watch message log live
tail -f .terminalforge/messages.log

# Run tests
npm run test:switch    # Phase 1 — navigation + state tests (19 tests)
npm run test:agents    # Phase 2 — agent unit tests (47 tests)
npm run test:smoke     # Phase 2 — live Claude API streaming test (requires .env)

# Lint
npm run lint

# Kill the bridge server
kill $(lsof -ti:3333)

# Kill all TerminalForge processes
kill $(lsof -ti:3333) && pkill -f "agent-repl.js" && pkill -f "bus-monitor.js"

# Kill tmux session
tmux kill-session -t terminalforge
```
