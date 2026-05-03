# TerminalForge — Claude Code Master Prompt

Paste this entire prompt into Claude Code Desktop when you start a session.

---

## YOUR MISSION

You are the lead engineer building **TerminalForge** — a macOS terminal-based multi-agent AI development platform. You will help implement this system phase by phase, file by file, with production-quality code.

This is a real project with a real GitHub repository. Every file you create or modify must be committed and pushed correctly.

---

## REPOSITORY SETUP

- **Your fork (working branch):** `https://github.com/Hemin-Dhamelia/Fork-TerminalForgeAI.git`
- **Upstream main repo:** `https://github.com/TerminalForgeAI/TerminalForgeAI.git`
- **Local path:** `/Users/HP/Desktop/TerminalForgeAI/Fork-TerminalForgeAI`
- **Branch strategy:** All work goes on versioned branches in the fork. PRs go upstream to TerminalForgeAI/TerminalForgeAI.

### Git workflow you must follow:
```bash
# Clone the fork if not already cloned
git clone https://github.com/Hemin-Dhamelia/Fork-TerminalForgeAI.git
cd Fork-TerminalForgeAI

# Add upstream remote
git remote add upstream https://github.com/TerminalForgeAI/TerminalForgeAI.git

# Always create a feature branch before touching any file
git checkout -b feature/<phase>-<description>
# Example: feature/phase1-event-listener

# After completing a module, commit with a clear message
git add .
git commit -m "feat(phase1): add Node.js volume event listener daemon"
git push origin feature/phase1-event-listener
```

---

## WHAT TERMINALFORGE IS

A macOS terminal platform where:
- **5 AI agents** run as a unified dev team: Junior Developer (T1), Senior Developer (T2), QA Engineer (T3), DevOps Engineer (T4), Project Manager (T5)
- **iPhone volume buttons** navigate between agent terminals: Vol DOWN = forward (1→2→3→4→5→1), Vol UP = backward (5→4→3→2→1→5). Hold 2s = toggle Autonomous Mode
- **Voice input** via faster-whisper (local STT) + silero-vad + optional wake word "Hey Forge"
- **Text input** always available as fallback
- **Agent-to-agent communication** via in-process EventEmitter message bus
- **Bus Monitor** — a dedicated 7th terminal window showing all inter-agent traffic in real time
- **Autonomous Mode**: PM agent orchestrates the full team automatically
- Each agent has its own system prompt, memory, tools, and Claude API session

---

## CURRENT PROJECT STATE (as of 2026-05-02)

### ✅ Phase 1: Foundation — COMPLETE
All files built, tested, and merged to main via PR.

| File | Status |
|---|---|
| `core/state.js` | ✅ read/write state.json, navigate(), switchTerminal(), toggleMode(), setTerminalStatus() |
| `bridge/server.js` | ✅ Express :3333, POST /volume, GET /state, GET /health, 300ms debounce |
| `core/event-listener.js` | ✅ EventEmitter — agent:switch, mode:toggle events |
| `.terminalforge/state.json` | ✅ initial state created |
| `tests/test-switch.js` | ✅ 19 tests — all passing |

### ✅ Phase 2: Agent Engine — COMPLETE
All files built, tested, and merged to main via PR.

| File | Status |
|---|---|
| `agents/junior-dev.js` | ✅ T1 system prompt, TERMINAL_INDEX=1 |
| `agents/senior-dev.js` | ✅ T2 system prompt, TERMINAL_INDEX=2 |
| `agents/qa-engineer.js` | ✅ T3 system prompt, TERMINAL_INDEX=3 |
| `agents/devops-engineer.js` | ✅ T4 system prompt, TERMINAL_INDEX=4 |
| `agents/project-manager.js` | ✅ T5 system prompt, TERMINAL_INDEX=5, ORCHESTRATOR_MAX_TOKENS=1024 |
| `core/context-manager.js` | ✅ buildAgentContext(), buildHandoffBlock(), appendHandoff(), getAgentIdByTerminal() |
| `core/agent-router.js` | ✅ routePrompt(), streaming via claude-sonnet-4-5, 20-msg rolling history per terminal |
| `tests/test-agents.js` | ✅ 47 tests — all passing |
| `tests/smoke-test-agents.js` | ✅ live streaming test (requires ANTHROPIC_API_KEY in .env) |

### ✅ Launcher Scripts — COMPLETE (bonus, not in original plan)

| File | Status |
|---|---|
| `scripts/launch.sh` | ✅ auto-opens 7 windows — bridge server + 5 agent REPLs + bus monitor (iTerm2 or Terminal.app) |
| `scripts/tmux-layout.sh` | ✅ tmux session with 7 windows (windows 0–6) |
| `scripts/agent-repl.js` | ✅ per-agent REPL: coloured streaming output, /clear /status /quit /msg /reply |

### ✅ Observability Layer — COMPLETE (bonus, early Phase 5 foundation)

| File | Status |
|---|---|
| `core/message-bus.js` | ✅ EventEmitter bus — publish/subscribe/subscribeAll/readLog/getUnread; validates from/to/type; appends to messages.log |
| `scripts/bus-monitor.js` | ✅ live traffic monitor — replays last 20 msgs, subscribeAll fan-out, 500ms log poll, status bar |
| `scripts/agent-repl.js` | ✅ updated — incoming messages displayed inline with colour-coded banners; /msg and /reply commands |

All message flow tests passing: targeted delivery, subscribeAll fan-out, log persistence, invalid-agent rejection, invalid-type rejection.

### ✅ End-to-End Testing — COMPLETE (May 2026)

Full live test suite verified against the real stack (bridge server + all 5 agents + message bus + context injection + bus monitor + navigation) using the real Claude API.

| # | Test Area | Result | Detail |
|---|-----------|--------|--------|
| 1 | Bridge server | ✅ Pass | `/health`, `/volume` (down/up/hold), `/state`, 300ms debounce all working |
| 2 | All 5 agents — Claude API | ✅ Pass | T1 1797ms · T2 1666ms · T3 2211ms · T4 2264ms · T5 2371ms — all correct identity responses |
| 3 | Agent-to-agent messaging | ✅ Pass | `/msg`, `/reply`, targeted delivery, `subscribeAll` fan-out, all 3 validation rejections correct |
| 4 | Message bus | ✅ 11/11 | publish/subscribe/readLog/getUnread, invalid agent/type/payload all rejected correctly |
| 5 | Context injection | ✅ 17/18 | PROJECT, GIT, TASKS, MESSAGES, HANDOFF sections present in every agent call |
| 6 | Bus monitor | ✅ Pass | History replay, live `subscribeAll` feed, 500ms cross-process poll confirmed |
| 7 | Navigation + state | ✅ 15/15 | DOWN 1→2→3→4→5→1, UP 1→5→4→3→2→1→5, HOLD toggle manual↔auto, debounce 100ms |
| 8 | Full E2E pipeline | ✅ 25/25 | PM → Claude → task → junior-dev context → Claude impl → escalation → senior-dev Claude review |

**E2E pipeline summary:** PM (T5) called Claude to create a task → published to `junior-dev` via message bus with `taskId: task-e2e-001` → Junior Dev's `buildAgentContext()` injected the unread task → Junior Dev (T1) called Claude, wrote implementation + unit test, escalated → escalation published to `senior-dev` with same taskId → Senior Dev (T2) called Claude, reviewed and approved. Full trace confirmed in `messages.log`. Zero regressions.

### ✅ Phase 4: TUI (Ink) — COMPLETE (May 2026)

Full-screen Ink TUI built and verified. All 5 agents run side-by-side in one terminal window with streaming output, per-agent input, live bus monitor panel, and real-time status bar.

| File | Status |
|---|---|
| `ui/App.jsx` | ✅ Root component — full layout, state, streaming, Tab/Shift+Tab navigation, /clear /status /msg /reply |
| `ui/AgentPane.jsx` | ✅ Per-agent pane — active (double border, TextInput, full conversation) / inactive (single border, last 8 lines) |
| `ui/StatusBar.jsx` | ✅ Top bar — brand, MANUAL/AUTO mode badge, active agent, 5 status dots, message count, key hints |
| `ui/BusMonitorPanel.jsx` | ✅ Right-column live bus feed — timestamp, from→to emojis, type icon, payload preview |
| `ui/TerminalColorManager.jsx` | ✅ Agent info + status → colour/label/dot mappings used across all panes |
| `scripts/ui.js` | ✅ Entry point — loads .env, validates API key, hides cursor, renders App, restores cursor on exit |
| `tsconfig.json` | ✅ Added — `"jsx": "react-jsx"` for tsx JSX transform |
| `package.json` | ✅ Updated — added `npm run ui`, `npm run ui:debug`, ink, react, ink-text-input, tsx |

Launch: `npm run ui` — renders all 5 agents + bus monitor in one fullscreen window.
Keyboard: Tab (next agent), Shift+Tab (prev agent), Enter (submit), Ctrl+C (quit).

### ✅ Phase 3: Voice Layer — COMPLETE (May 2026)

Full voice pipeline built. Three modes: push-to-talk (spacebar), auto-VAD (always-listening), wake-word ("Hey Forge"). Transcription runs fully offline via faster-whisper. TUI auto-submits transcribed text to the active agent.

| File | Status |
|---|---|
| `voice/pipeline.py` | ✅ Main coordinator — push-to-talk / auto-vad / wake-word modes, POSTs to bridge |
| `voice/transcriber.py` | ✅ faster-whisper wrapper — loads model once, transcribe(audio_array) → str, fully offline |
| `voice/vad.py` | ✅ sounddevice mic capture + silero-vad VADIterator streaming (512-sample chunks @ 16kHz) |
| `voice/wake-word.py` | ✅ openWakeWord detector — "Hey Forge" or built-in fallback for testing |
| `voice/tts.py` | ✅ TTS output — macOS `say` (non-blocking, default) or ElevenLabs; unified speak() |
| `voice/__init__.py` | ✅ Python package marker |
| `voice/wake_word.py` | ✅ Importable re-export of wake-word.py (hyphen workaround for Python imports) |
| `bridge/hotkey-fallback.js` | ✅ Spacebar/R/F5 push-to-talk toggle — writes voice_state.json atomically |
| `bridge/server.js` | ✅ Updated — added POST /voice (writes voice_input.json) + GET /voice/state |
| `core/state.js` | ✅ Updated — added writeVoiceInput, readVoiceInput, consumeVoiceInput, readVoiceState, writeVoiceState |
| `ui/App.jsx` | ✅ Updated — polls voice_input.json every 500ms, auto-submits transcriptions, voiceStatus state |
| `ui/StatusBar.jsx` | ✅ Updated — 👂 Listening / 🎤 Recording / ⌨ Transcribing indicator |
| `requirements.txt` | ✅ Python deps: faster-whisper, silero-vad, sounddevice, numpy, loguru, requests, openwakeword |

**Integration flow:** Python pipeline → POST localhost:3333/voice → bridge writes voice_input.json (atomic rename) → TUI polls every 500ms → auto-submits to active agent via handleSubmit().

### ✅ Startup Script — COMPLETE (May 2026)

Single-command launcher that handles all setup and starts the full stack.

| File | Status |
|---|---|
| `scripts/start.sh` | ✅ Full startup script — checks Node.js/Python, installs deps, validates .env, starts bridge + voice + TUI |
| `start.sh` | ✅ Root symlink → scripts/start.sh |
| `package.json` | ✅ Updated — added npm run go, go:voice, go:auto, go:no-voice, go:debug, voice:hotkey, voice:tts |

Launch: `./start.sh` or `npm run go` — interactive voice mode selector, starts everything, cleans up on Ctrl+C.

### 🔜 Phase 5: Agent Communication (message bus ✅ done — PM orchestrator loop remaining)
### 🔜 Phase 6: Polish

---

## MONOREPO STRUCTURE

```
terminalforge/
├── CLAUDE.md                    ← Project rules for Claude Code
├── README.md                    ✅ BUILT — project overview + quickstart
├── package.json                 ← Root package (Node.js)
├── .terminalforge/              ← Runtime state (git-ignored)
│   ├── state.json               ← Active terminal index + mode + terminalStatus
│   ├── messages.log             ← Agent-to-agent message log (newline-delimited JSON)
│   ├── project.md               ← Current project description
│   ├── open_tasks.json          ← Task list
│   ├── handoffs.md              ← Cross-agent handoff notes
│   └── config.json              ← maxSteps:20, debounceMs:300, voiceMode
├── core/
│   ├── event-listener.js        ✅ BUILT
│   ├── agent-router.js          ✅ BUILT
│   ├── message-bus.js           ✅ BUILT — EventEmitter bus, publish/subscribe/subscribeAll
│   ├── context-manager.js       ✅ BUILT
│   └── state.js                 ✅ BUILT
├── agents/
│   ├── junior-dev.js            ✅ BUILT
│   ├── senior-dev.js            ✅ BUILT
│   ├── qa-engineer.js           ✅ BUILT
│   ├── devops-engineer.js       ✅ BUILT
│   └── project-manager.js       ✅ BUILT
├── scripts/
│   ├── start.sh                 ✅ BUILT — one-command full-stack launcher
│   ├── launch.sh                ✅ BUILT — 7 windows (bridge + 5 agents + bus monitor)
│   ├── tmux-layout.sh           ✅ BUILT — 7 tmux windows (Ctrl+B 0-6)
│   ├── agent-repl.js            ✅ BUILT — /msg /reply inline message display
│   ├── bus-monitor.js           ✅ BUILT — live inter-agent traffic monitor
│   └── ui.js                    ✅ BUILT — TUI entry point
├── start.sh                     ✅ BUILT — root symlink → scripts/start.sh
├── voice/
│   ├── pipeline.py              ✅ BUILT — main coordinator, 3 modes, POSTs to bridge
│   ├── transcriber.py           ✅ BUILT — faster-whisper, fully offline
│   ├── vad.py                   ✅ BUILT — sounddevice + silero-vad VADIterator
│   ├── wake-word.py             ✅ BUILT — openWakeWord "Hey Forge"
│   ├── wake_word.py             ✅ BUILT — importable re-export (hyphen workaround)
│   ├── tts.py                   ✅ BUILT — macOS say / ElevenLabs
│   └── __init__.py              ✅ BUILT — Python package marker
├── requirements.txt             ✅ BUILT — Python deps for voice pipeline
├── bridge/
│   ├── server.js                ✅ BUILT — updated: POST /voice + GET /voice/state
│   └── hotkey-fallback.js       ✅ BUILT — spacebar/R/F5 push-to-talk toggle
├── tests/
│   ├── test-switch.js           ✅ BUILT (19 tests)
│   ├── test-agents.js           ✅ BUILT (47 tests)
│   └── smoke-test-agents.js     ✅ BUILT
└── ui/
    ├── App.jsx                      ✅ BUILT — root Ink component, state management, streaming
    ├── AgentPane.jsx                ✅ BUILT — active/inactive pane, TextInput, conversation render
    ├── StatusBar.jsx                ✅ BUILT — top bar with mode, agent, status dots, hints
    ├── BusMonitorPanel.jsx          ✅ BUILT — right-column live inter-agent message feed
    └── TerminalColorManager.jsx     ✅ BUILT — agent info + status colour/label/dot mappings
```

---

## TECHNOLOGY STACK

| Layer | Technology |
|---|---|
| AI / Agents | Anthropic Claude API — `claude-sonnet-4-5` streaming |
| Voice STT | faster-whisper (local, CTranslate2) |
| Voice Activity | silero-vad (Python) |
| Wake Word | openWakeWord ("Hey Forge") |
| Voice TTS | ElevenLabs API or macOS `say` (off by default) |
| Terminal UI | Ink (React-for-terminal, Node.js) |
| iPhone Bridge | iOS Shortcuts → HTTP POST → localhost:3333 |
| macOS Listener | Node.js Express daemon |
| Message Bus | Node.js EventEmitter (in-process, no broker) |
| Shared Context | JSON + Markdown flat files in `.terminalforge/` |
| Git Integration | simple-git (Node.js) |
| Runtime | Node.js 18+ and Python 3.11+ |

---

## TERMINAL COLOUR SYSTEM — TASK STATE INDICATOR

Every agent terminal must visually reflect the current task state through background colour. This is a core UX feature, not optional styling.

### Colour Rules (non-negotiable)

| Task State | Terminal Background Colour | Meaning |
|---|---|---|
| `working` | **Yellow** (`#FFD700` / Ink: `bgYellow`) | Agent is actively executing a task right now |
| `done` | **Green** (`#00C853` / Ink: `bgGreen`) | Task completed successfully |
| `failed` | **Red** (`#FF1744` / Ink: `bgRed`) | Task failed — needs attention or retry |
| `idle` | **Default** (no colour / terminal default) | Agent is waiting for a prompt, no active task |

### Implementation Rules

- The colour wraps the **entire active terminal panel** in the TUI — background, header, and streaming output area all change together
- Colour updates must be **real-time**: yellow fires the instant a task is dispatched to an agent, not after the first token streams
- On task completion (agent emits `task:done`), colour transitions from yellow → green within **< 100ms**
- On task failure (agent emits `task:failed` or API error), colour transitions to red immediately
- When the user **switches away** from a terminal mid-task, the agent badge in the sidebar must retain its colour (yellow/green/red) so the user can see all 5 terminals' states at a glance
- Colour resets to idle (default) only when the user explicitly starts a new task on that terminal, OR when the PM dispatches a new task to it in Autonomous Mode

### State stored in `state.json`

```json
{
  "activeTerminal": 2,
  "mode": "manual",
  "lastSwitch": "2026-04-27T10:00:00Z",
  "autonomousStepCount": 0,
  "terminalStatus": {
    "1": "idle",
    "2": "working",
    "3": "done",
    "4": "failed",
    "5": "idle"
  }
}
```

### File to implement: `ui/TerminalColorManager.js`

```javascript
// ui/TerminalColorManager.js
export const STATUS_COLOURS = {
  idle:    { bg: '',          label: ''        },
  working: { bg: 'bgYellow',  label: 'WORKING' },
  done:    { bg: 'bgGreen',   label: 'DONE'    },
  failed:  { bg: 'bgRed',     label: 'FAILED'  },
};

export function getTerminalColour(terminalIndex, terminalStatus) {
  const status = terminalStatus[String(terminalIndex)] || 'idle';
  return STATUS_COLOURS[status];
}
```

### Events that trigger colour changes

- `task:dispatched` (from PM or user prompt) → set terminal status to `working` → yellow
- `task:done` (agent finishes successfully) → set status to `done` → green
- `task:failed` (error, timeout, or explicit failure signal) → set status to `failed` → red
- `agent:reset` (user types `reset agent`) → set status to `idle` → default
- New task dispatched to a terminal already showing green or red → immediately back to yellow

### Sidebar overview (all 5 terminals visible)

When the user is on Terminal 2 (active), the sidebar must show all 5 terminals with their colour state:

```
┌─ TERMINALS ─────────────┐
│ [T1]  Junior Dev   IDLE │
│ [T2]  Senior Dev   ████ │  ← active, yellow if working
│ [T3]  QA Engineer  ████ │  ← green if done
│ [T4]  DevOps       ████ │  ← red if failed
│ [T5]  PM           IDLE │
└─────────────────────────┘
```

This is built in Phase 4 (TUI) and wired to the message bus events in Phase 5.

---

## MESSAGE BUS — BUILT (core/message-bus.js)

The message bus is the backbone of agent-to-agent communication. It is already implemented.

### Envelope format

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

### API

```javascript
import { publish, subscribe, subscribeAll, readLog, getUnread } from './core/message-bus.js';

// Send a message
await publish({ from: 'junior-dev', to: 'senior-dev', type: 'escalation', payload: '...', taskId: 'task-001' });

// Receive messages for this agent (used in agent-repl.js)
subscribe('senior-dev', (envelope) => { /* render it */ });

// Receive ALL messages (used in bus-monitor.js)
subscribeAll((envelope) => { /* render it */ });
```

### Validation rules
- `from` and `to` must be valid agent IDs: `junior-dev`, `senior-dev`, `qa-engineer`, `devops-engineer`, `project-manager`
- `type` must be one of: `task`, `review`, `escalation`, `bug-report`, `handoff`, `summary`
- `payload` is required (non-empty string)
- `taskId` is optional

### Bus Monitor (scripts/bus-monitor.js)

Run in a dedicated 7th terminal window. Shows all inter-agent traffic in real time:

```
  ────────────────────────────────────────────────────────────────────────
  10:30:15   👨‍💻 Junior Developer       →  🧠 Senior Developer        🚨 ESCALATION
             Stuck on JWT refresh token logic — the token keeps expiring after
             60 seconds even when rememberMe is true. Need senior review.
  ············································································
```

- Replays last 20 messages from `messages.log` on start
- Subscribes to all live traffic via `subscribeAll()`
- Polls `messages.log` every 500ms to catch messages from other processes
- Periodic status bar shows all 5 terminal states + mode

---

## BUILD PHASES — WORK IN THIS ORDER

### ✅ Phase 1: Foundation — COMPLETE
**Goal:** Core infrastructure. Volume button events reach the system. API streaming works.

Files built:
- `core/state.js` — read/write `.terminalforge/state.json`
- `bridge/server.js` — Express on :3333, accepts `POST /volume` with `{button: "up"|"down"}`, updates active terminal (1–5 wrapping), writes state
- `core/event-listener.js` — consumes bridge events, emits `agent:switch` events
- `.terminalforge/state.json` — initial state: `{ "activeTerminal": 1, "mode": "manual" }`
- Test script: `npm run test:switch` — 19 tests all passing

Success criteria met: pressing Vol DOWN 3 times advances terminal 1→2→3, Vol UP goes back, state persists, debounce working.

### ✅ Phase 2: Agent Engine — COMPLETE
**Goal:** 5 live Claude API sessions, each with distinct identity, shared context, git awareness.

Files built:
- `agents/junior-dev.js` through `agents/project-manager.js` — system prompts + tools
- `core/agent-router.js` — reads `state.json`, routes prompts to correct agent, streaming
- `core/context-manager.js` — injects `.terminalforge/project.md`, `open_tasks.json`, `handoffs.md` into each API call
- Git integration: injects `git log --oneline -10`, `git status` into context on every call
- `tests/test-agents.js` — 47 tests all passing
- `tests/smoke-test-agents.js` — live Claude API test passing

### ✅ Launcher Scripts + Observability — COMPLETE (bonus, built ahead of schedule)
**Goal:** Full launch automation + real-time inter-agent observability.

Files built:
- `scripts/launch.sh` — opens 7 terminal windows (bridge + 5 agents + bus monitor) in iTerm2 or Terminal.app
- `scripts/tmux-layout.sh` — tmux session with 7 windows (Ctrl+B 0-6 to switch)
- `scripts/agent-repl.js` — interactive per-agent REPL; incoming messages display inline with banners; `/msg` and `/reply` commands
- `core/message-bus.js` — full EventEmitter bus with publish/subscribe/subscribeAll/readLog/getUnread
- `scripts/bus-monitor.js` — standalone live traffic monitor with history replay + 500ms file poll

### ✅ Phase 3: Voice Layer (Week 5) — COMPLETE (May 2026)
**Goal:** Speak a prompt → faster-whisper transcribes → agent receives it. ✅ DONE

Files built:
- `voice/pipeline.py` — main coordinator; 3 modes (push-to-talk, auto-vad, wake-word); POSTs transcription to bridge
- `voice/transcriber.py` — faster-whisper WhisperModel wrapper; loads once; transcribe(np.ndarray) → str; int8 CPU inference
- `voice/vad.py` — sounddevice InputStream + silero-vad VADIterator (512-sample chunks @ 16kHz); push_to_talk and record_auto_vad modes
- `voice/wake-word.py` — openWakeWord Model; "Hey Forge" or built-in fallback; listen_for_wake_word() → bool
- `voice/tts.py` — speak() unified interface; macOS say (async Popen, default) or ElevenLabs
- `bridge/hotkey-fallback.js` — raw stdin; spacebar/R/F5 toggles voice_state.json; polls pipeline status; opens in separate terminal
- `bridge/server.js` updated — POST /voice writes voice_input.json via writeVoiceInput(); GET /voice/state
- `core/state.js` updated — writeVoiceInput, readVoiceInput, consumeVoiceInput, readVoiceState, writeVoiceState; all atomic writes
- `ui/App.jsx` updated — 500ms voice_input.json poll; auto-submits new transcriptions; voiceStatus state passed to StatusBar
- `ui/StatusBar.jsx` updated — VOICE_DISPLAY map; 👂/🎤/⌨ indicator shown when pipeline active
- `requirements.txt` — faster-whisper, silero-vad, sounddevice, numpy, loguru, requests, openwakeword

Success criteria met: pipeline.py → faster-whisper transcription → POST /voice → voice_input.json → TUI auto-submits to active agent.

### ✅ Phase 4: TUI + Switching (Week 6) — COMPLETE (May 2026)
**Goal:** Full terminal UI using Ink (React for terminal), including the live terminal colour system.

Files built:
- `ui/App.jsx` — root component: full layout (StatusBar + 5 AgentPanes + BusMonitorPanel), state management, streaming via onToken callback, Tab/Shift+Tab navigation, /clear /status /msg /reply commands
- `ui/AgentPane.jsx` — active pane: double border, wider (36%), TextInput, full conversation; inactive pane: single border, compact (equal split), last 8 lines
- `ui/StatusBar.jsx` — top bar: brand, MANUAL/AUTO badge, active agent name+emoji, 5 mini status dots, message count, key hints
- `ui/BusMonitorPanel.jsx` — right-column (12% width): live feed of all bus messages — timestamp, from→to, type icon, payload preview
- `ui/TerminalColorManager.jsx` — AGENT_INFO map (emoji, name, colour per agent), STATUS_STYLES map (bgColor, label, dot per status state)
- `scripts/ui.js` — entry point: loads .env, validates API key, hides cursor, renders `<App />`, restores cursor on SIGINT/exit
- `tsconfig.json` — added: `"jsx": "react-jsx"`, `"jsxImportSource": "react"` for tsx JSX transform

Width logic: terminal >= 160 cols → active pane 36%, each inactive 16%, bus 12%. Narrower → equal panes.
Colour behaviour wired: task status (idle/working/done/failed) reflected in pane border colours and status dots.

### 🔜 Phase 5: Agent Communication (Week 7)
**Goal:** PM orchestrates the full team autonomously.

**Message bus is already built** (`core/message-bus.js`). What remains:
- PM orchestrator loop in `agents/project-manager.js` — receives high-level goal, creates task list, dispatches with `publish()`
- Wire `task:dispatched`, `task:done`, `task:failed` bus events to `terminalStatus` in `state.json`
- Max-step budget: 20 (configurable in `.terminalforge/config.json`)
- Log all dispatch decisions to `messages.log`

### 🔜 Phase 6: Polish (Week 8)
- Error handling + retry logic on API calls
- Onboarding guide (`docs/QUICKSTART.md`)
- Demo: build a full CRUD REST API end-to-end using only TerminalForge

---

## CODING STANDARDS

- **Node.js**: ES modules (`import/export`), async/await throughout, no callbacks
- **Python**: Type hints, `asyncio` for async voice pipeline
- **Error handling**: Every API call wrapped in try/catch with meaningful error messages
- **Logging**: Use `debug` npm package. Namespaces: `tf:core`, `tf:bridge`, `tf:agent`, `tf:voice`
- **Config**: All secrets (API keys) via `.env` file. Never hardcode. Never commit `.env`
- **Claude API**: Always use streaming (`stream: true`). Model: `claude-sonnet-4-5`
- **State**: `.terminalforge/state.json` is the single source of truth for active terminal and mode
- **No external message brokers**: EventEmitter only. No Redis, no RabbitMQ.
- **Context window**: Inject only the last 3 handoff notes + current git summary per agent call. Do not inject full history.

---

## AGENT SYSTEM PROMPTS (SUMMARY)

When writing system prompts for each agent, use these identities:

| Agent | Identity | Tone | Tools |
|---|---|---|---|
| Junior Dev | Eager, thorough, asks for clarification | Eager, precise | file read/write, git commit, run linter |
| Senior Dev | Authoritative architect, code reviewer | Confident, detailed | file read/write, git review, design patterns |
| QA Engineer | Methodical tester, bug hunter | Systematic, thorough | test runner, bug filing, diff reading |
| DevOps Engineer | Infrastructure expert | Pragmatic, reliable | Dockerfile, CI YAML, Terraform, deploy scripts |
| Project Manager | Orchestrator, planner, summarizer | Clear, directive | task dispatch, sprint planning, stakeholder summaries |

Each system prompt must begin with: `"You are [Agent Name] on the TerminalForge AI development team. Your terminal number is [N]. You have access to the shared project context in .terminalforge/. [Role-specific instructions follow...]"`

---

## MESSAGE BUS ROUTING MAP

| From | To | When |
|---|---|---|
| PM | Junior Dev | Implementation task dispatched |
| PM | Senior Dev | Architecture / complex feature assigned |
| PM | QA Engineer | Feature branch marked complete → trigger testing |
| PM | DevOps | Code merged to main → request pipeline setup |
| Junior Dev | Senior Dev | Blocker escalation |
| Senior Dev | Junior Dev | Code review returned with fix instructions |
| Senior Dev | QA | Feature code-complete, ready for QA |
| QA | Junior Dev | Bug report with repro steps + severity |
| QA | Senior Dev | Architectural bug escalation |
| DevOps | Senior Dev | Infra change requires config confirmation |

---

## VOLUME BUTTON NAVIGATION LOGIC

```javascript
// core/state.js — navigation logic
const TOTAL_TERMINALS = 5;

function navigate(direction, currentTerminal) {
  if (direction === 'down') {
    return (currentTerminal % TOTAL_TERMINALS) + 1; // 1→2, 5→1
  }
  if (direction === 'up') {
    return ((currentTerminal - 2 + TOTAL_TERMINALS) % TOTAL_TERMINALS) + 1; // 1→5, 2→1
  }
}
```

---

## HANDOFF INJECTION (on every agent switch)

When switching to a new agent, inject this into their context:

```
=== HANDOFF FROM [Previous Agent] ===
Last output: [last 500 chars of previous agent's response]
Git status: [git status --short]
Git diff summary: [git diff HEAD --stat]
Open tasks for you: [tasks from open_tasks.json addressed to this agent]
Messages for you: [unread messages from messages.log addressed to this agent]
=== END HANDOFF ===
```

---

## CURRENT STATUS

- Phase 1: ✅ COMPLETE — Foundation built and tested
- Phase 2: ✅ COMPLETE — Agent engine built and tested
- Launcher Scripts: ✅ COMPLETE — 7-window launch (bridge + 5 agents + bus monitor)
- Observability Layer: ✅ COMPLETE — message bus + bus monitor + inline REPL banners
- End-to-End Testing: ✅ COMPLETE — all 8 test areas pass, full PM→JuniorDev→SeniorDev pipeline verified live
- Phase 4: ✅ COMPLETE — Full Ink TUI: 5 agents side-by-side, streaming, Tab navigation, bus monitor panel (`npm run ui`)
- Phase 3: ✅ COMPLETE — Voice pipeline: faster-whisper STT, silero-vad, 3 modes, TUI auto-submit (`npm run voice`)
- Startup Script: ✅ COMPLETE — `./start.sh` one-command launcher (checks deps, installs, starts bridge + voice + TUI)
- Phase 5: 🔜 NEXT — PM Orchestrator Loop
- Active branch: push to current `p1vN` branch
- Tests passing: 19 (Phase 1) + 47 (Phase 2) + 25 (E2E pipeline) = 91 total verified checks

---

## HOW TO START RIGHT NOW

When starting a new session, immediately:
1. Check current branch: `git branch`
2. Confirm what phase is next in CLAUDE.md Current Build Phase section
3. Review what files already exist: `ls core/ agents/ voice/ ui/ bridge/ scripts/`
4. Check tests still pass: `npm run test:switch && npm run test:agents`
5. Start building the next phase — do NOT rebuild what already exists

Ask the user to confirm before moving to the next phase.

---

## USEFUL COMMANDS

```bash
# ONE-COMMAND full-stack launcher (RECOMMENDED) — checks deps, installs, starts everything
./start.sh                  # interactive voice mode selector
npm run go                  # same as ./start.sh
npm run go:voice            # push-to-talk voice + hotkey controller
npm run go:auto             # always-listening auto-VAD voice
npm run go:no-voice         # text-only, skip voice pipeline
npm run go:debug            # everything with DEBUG=tf:* logging

# Launch full-screen TUI only (bridge must already be running)
npm run ui
npm run ui:debug    # same with DEBUG=tf:* logging enabled

# Voice pipeline (run separately alongside npm run ui)
npm run voice               # push-to-talk mode
npm run voice:auto          # auto-VAD mode
npm run voice:wake          # wake-word mode
npm run voice:hotkey        # keyboard push-to-talk controller (separate terminal)
npm run voice:debug         # voice pipeline with verbose logging

# Launch full platform (opens 7 terminal windows automatically)
npm run launch

# Launch with tmux (7 windows in one terminal, Ctrl+B 0-6 to switch)
npm run launch:tmux

# Open a single agent REPL manually
npm run agent 1   # Junior Developer
npm run agent 2   # Senior Developer
npm run agent 3   # QA Engineer
npm run agent 4   # DevOps Engineer
npm run agent 5   # Project Manager

# Open the bus monitor standalone
npm run monitor

# Start bridge server only
npm start

# Simulate volume presses
curl -X POST http://localhost:3333/volume -H "Content-Type: application/json" -d '{"button":"down"}'
curl -X POST http://localhost:3333/volume -H "Content-Type: application/json" -d '{"button":"up"}'
curl -X POST http://localhost:3333/volume -H "Content-Type: application/json" -d '{"button":"hold"}'

# Check state
cat .terminalforge/state.json

# Watch message log live
tail -f .terminalforge/messages.log

# Run tests
npm run test:switch    # Phase 1 — 19 tests
npm run test:agents    # Phase 2 — 47 tests
npm run test:smoke     # Phase 2 — live API test (requires .env)

# Lint
npm run lint

# Kill everything
kill $(lsof -ti:3333)
pkill -f "agent-repl.js"
pkill -f "bus-monitor.js"
tmux kill-session -t terminalforge
```

---

## COMPLETE USER COMMANDS REFERENCE

### Starting the Application

```bash
./start.sh                  # interactive — prompts for voice mode (RECOMMENDED)
npm run go                  # same as ./start.sh
npm run go:voice            # start with push-to-talk voice
npm run go:auto             # start with auto-VAD (always-listening) voice
npm run go:no-voice         # start without voice (text-only)
npm run go:debug            # start everything + DEBUG=tf:* verbose logging
npm run ui                  # TUI only (bridge server must already be running)
npm run ui:debug            # TUI with verbose debug logging
npm start                   # bridge server only (port 3333)
npm run launch              # opens 7 separate windows in iTerm2 / Terminal.app
npm run launch:tmux         # opens 7 tmux windows (Ctrl+B 0-6 to switch)
```

### Stopping the Application

```bash
Ctrl+C                             # clean stop — works in TUI or start.sh
kill $(lsof -ti:3333)              # kill bridge server
pkill -f "pipeline.py"             # kill voice pipeline
pkill -f "agent-repl.js"           # kill agent REPLs
pkill -f "bus-monitor.js"          # kill bus monitor
tmux kill-session -t terminalforge  # kill tmux session
```

### Switching Agents

```bash
# Inside the TUI:
Tab                    # → next agent  (T1 → T2 → T3 → T4 → T5 → T1)
Shift+Tab              # → previous agent (T1 → T5 → T4 → T3 → T2 → T1)

# iPhone Volume Buttons:
Vol DOWN               # → next agent
Vol UP                 # → previous agent
Hold 2s                # → toggle Manual ↔ Autonomous Mode

# Simulate via curl:
curl -X POST http://localhost:3333/volume -H "Content-Type: application/json" -d '{"button":"down"}'
curl -X POST http://localhost:3333/volume -H "Content-Type: application/json" -d '{"button":"up"}'
curl -X POST http://localhost:3333/volume -H "Content-Type: application/json" -d '{"button":"hold"}'
```

### TUI Keyboard Controls

```
Tab           → next agent
Shift+Tab     → previous agent
Enter         → submit typed prompt to active agent
Space         → push-to-talk toggle (only when input box is empty;
                voice pipeline must be running)
Ctrl+C        → quit
```

### In-TUI Slash Commands (type in the active agent input box)

```
/clear                              → clear conversation history for active agent
/status                             → show active terminal, mode, task status
/msg <agentId> <type> <message>     → send a message to another agent
/reply <message>                    → reply to the last received message
```

Examples:
```
/msg senior-dev escalation JWT refresh tokens expire after 60s — need review
/msg qa-engineer task Write tests for POST /auth/login
/reply Approved — looks good, add a timestamp field
/status
/clear
```

### Standalone Agent REPL Commands (npm run agent N)

```
/msg <agentId> <type> <message>     → send message to another agent
/reply <message>                    → reply to last received message
/clear                              → clear conversation history
/status                             → show state from state.json
/quit                               → close this REPL
```

### Voice Pipeline

```bash
npm run voice               # push-to-talk (Space/R/F5 to toggle)
npm run voice:auto          # auto-VAD (1.5s silence sends)
npm run voice:wake          # wake-word ("Hey Forge" to activate)
npm run voice:hotkey        # separate hotkey controller terminal
npm run voice:debug         # verbose debug logging

# Direct Python:
python3 -m voice.pipeline --mode push-to-talk
python3 -m voice.pipeline --mode auto-vad
python3 -m voice.pipeline --mode wake-word
python3 -m voice.pipeline --model small.en   # larger model for better accuracy
python3 -m voice.pipeline --debug
```

Push-to-talk keys: `Space` in TUI (when input empty) · `Space/R/F5` in hotkey terminal · `ESC` to cancel

### Agent IDs and Message Types

```
Agent IDs:    junior-dev · senior-dev · qa-engineer · devops-engineer · project-manager
Message types: task · review · escalation · bug-report · handoff · summary
```

### Inspecting State

```bash
cat .terminalforge/state.json           # active terminal, mode, all 5 task statuses
cat .terminalforge/messages.log         # full agent-to-agent message log
tail -f .terminalforge/messages.log     # live message feed
cat .terminalforge/voice_state.json     # voice pipeline status
cat .terminalforge/voice_input.json     # latest transcription
cat .terminalforge/project.md           # current project description
cat .terminalforge/open_tasks.json      # current task list
cat .terminalforge/config.json          # user config (maxSteps, voiceMode, etc.)
curl http://localhost:3333/health       # bridge health check
curl http://localhost:3333/state        # bridge — live state.json
```
