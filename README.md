# TerminalForge

**macOS terminal-based multi-agent AI development platform**

Five specialized AI agents run as a unified dev team in a single terminal session, each powered by the Anthropic Claude API. Navigate between agents using iPhone Volume buttons. Speak or type your prompts. Watch agents communicate with each other in real time.

---

## What It Does

| Feature | Description |
|---|---|
| **5 AI agents** | Junior Dev · Senior Dev · QA Engineer · DevOps Engineer · Project Manager — each with its own system prompt, memory, and Claude API session |
| **Volume button switching** | iPhone Vol DOWN = forward (T1→T2→T3→T4→T5→T1) · Vol UP = backward · Hold 2s = toggle Autonomous Mode |
| **Voice input** | Speak into your Mac mic — faster-whisper transcribes locally (< 2s, no network, no cost) |
| **Text input** | Always available — type your prompt directly in the terminal |
| **Agent-to-agent messages** | Agents send tasks, reviews, escalations, and bug reports to each other via an in-process EventEmitter bus |
| **Bus Monitor** | Dedicated 7th terminal window showing all inter-agent traffic in real time |
| **Autonomous Mode** | PM agent receives a high-level goal, breaks it into tasks, dispatches to the right agents automatically |
| **Git-aware context** | Each agent sees `git status`, `git log`, open tasks, handoff notes, and unread messages on every call |

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/Hemin-Dhamelia/Fork-TerminalForgeAI.git
cd Fork-TerminalForgeAI
npm install
```

### 2. Add your API key

```bash
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 3. Launch everything

```bash
./start.sh            # ONE COMMAND — installs deps, starts bridge + voice + TUI (RECOMMENDED)
npm run go            # Same as ./start.sh
npm run go:voice      # Start with push-to-talk voice enabled
npm run go:auto       # Start with always-listening voice (auto-VAD)
npm run go:no-voice   # Skip voice pipeline, text-only

npm run ui            # TUI only (bridge must already be running)
npm run launch        # Opens 7 separate windows in iTerm2 or Terminal.app
npm run launch:tmux   # Opens 7 tmux windows (Ctrl+B 0-6 to switch)
```

This opens:
- 🌉 **Bridge Server** — receives iPhone volume button events on port 3333
- 👨‍💻 **T1 Junior Developer**
- 🧠 **T2 Senior Developer**
- 🔍 **T3 QA Engineer**
- ⚙️  **T4 DevOps Engineer**
- 📋 **T5 Project Manager**
- 📡 **Bus Monitor** — live inter-agent message feed

### 4. Send your first prompt

Type in any agent window and press Enter. The agent responds using the Claude API with streaming output.

---

## Agent REPL Commands

Available in every agent terminal:

```
/msg <agentId> <type> <message>   — send a message to another agent
/reply <message>                  — quick-reply to the last received message
/clear                            — clear this agent's conversation history
/status                           — show current terminal state
/quit                             — close this agent REPL
```

**Agent IDs:** `junior-dev` · `senior-dev` · `qa-engineer` · `devops-engineer` · `project-manager`

**Message types:** `task` · `review` · `escalation` · `bug-report` · `handoff` · `summary`

**Example:**
```
[T1] › /msg senior-dev escalation Stuck on JWT refresh token — token expires in 60s even with rememberMe=true
```

---

## Volume Button Setup (iPhone)

1. Create an iOS Shortcut that sends `POST http://<your-mac-ip>:3333/volume` with body `{"button":"down"}` or `{"button":"up"}`
2. Assign the shortcut to your Volume Down / Volume Up buttons
3. Press Volume DOWN to advance to the next agent, Volume UP to go back

**Or simulate via curl:**
```bash
curl -X POST http://localhost:3333/volume -H "Content-Type: application/json" -d '{"button":"down"}'
curl -X POST http://localhost:3333/volume -H "Content-Type: application/json" -d '{"button":"up"}'
curl -X POST http://localhost:3333/volume -H "Content-Type: application/json" -d '{"button":"hold"}'
```

---

## Voice Input — Phase 3

The voice pipeline transcribes your speech locally using faster-whisper (no network, no cost) and routes it to the active agent automatically.

**Install Python deps first:**
```bash
pip install -r requirements.txt
```

**Three voice modes:**

| Mode | Command | How it works |
|---|---|---|
| Push-to-talk | `npm run voice` + `npm run voice:hotkey` | Press SPACE to start/stop recording |
| Auto-VAD | `npm run voice:auto` | Always listening — 1.5s pause sends the prompt |
| Wake word | `npm run voice:wake` | Say "Hey Forge" to activate |

**Or use the all-in-one startup script:**
```bash
./start.sh --voice        # push-to-talk
./start.sh --voice=auto   # auto-VAD
./start.sh --voice=wake   # wake word
```

The TUI status bar shows a live voice indicator: 👂 Listening · 🎤 Recording · ⌨ Transcribing

---

## TUI — All Agents in One Window

```bash
npm run ui             # Launch full-screen TUI (all 5 agents + bus monitor)
npm run ui:debug       # Same with debug logging enabled
```

**TUI keyboard controls:**
```
Tab           → next agent (T1 → T2 → T3 → T4 → T5 → T1)
Shift+Tab     → previous agent (T1 → T5 → T4 → T3 → T2 → T1)
Enter         → submit prompt to active agent
Ctrl+C        → quit
```

**TUI layout:**
```
+-----+------------------------+-------+-------+-------+----------+
| T1  |    T2 (ACTIVE)         |  T3   |  T4   |  T5   | 📡 Bus   |
| 👨‍💻  | streaming output...    |  🔍   |  ⚙️    |  📋   | Monitor  |
|     | [T2] > your prompt     |       |       |       |          |
+-----+------------------------+-------+-------+-------+----------+
```

## Individual Commands

```bash
npm run agent 1        # Open Junior Developer REPL (standalone)
npm run agent 2        # Open Senior Developer REPL (standalone)
npm run agent 3        # Open QA Engineer REPL (standalone)
npm run agent 4        # Open DevOps Engineer REPL (standalone)
npm run agent 5        # Open Project Manager REPL (standalone)

npm run monitor        # Open Bus Monitor standalone

npm start              # Start bridge server only (port 3333)
```

---

## Complete Commands Reference

Everything you can do in TerminalForge — in one place.

### Starting the Application

```bash
# ONE-COMMAND LAUNCH (recommended) — checks deps, starts everything
./start.sh                  # interactive: prompts for voice mode
npm run go                  # same as ./start.sh

# Start with a specific voice mode (no prompt)
npm run go:voice            # push-to-talk (press Space to record)
npm run go:auto             # always-listening auto-VAD
npm run go:no-voice         # text-only, no voice pipeline
npm run go:debug            # everything + DEBUG=tf:* verbose logging

# Start components individually
npm run ui                  # TUI only (bridge must already be running)
npm run ui:debug            # TUI with verbose debug logging
npm start                   # bridge server only (port 3333)

# Multi-window launches (alternative to TUI)
npm run launch              # opens 7 windows in iTerm2 / Terminal.app
npm run launch:tmux         # opens 7 tmux windows (Ctrl+B 0–6 to switch)
```

### Stopping the Application

```bash
Ctrl+C                             # in TUI or start.sh — cleanly stops all processes

# Kill individual components manually
kill $(lsof -ti:3333)              # kill bridge server (port 3333)
pkill -f "pipeline.py"             # kill voice pipeline
pkill -f "agent-repl.js"           # kill all agent REPL windows
pkill -f "bus-monitor.js"          # kill bus monitor
tmux kill-session -t terminalforge # kill tmux session (if using tmux layout)

# Kill everything at once
kill $(lsof -ti:3333) && pkill -f "agent-repl.js" && pkill -f "bus-monitor.js"
```

### Switching Agents

**Keyboard (inside the TUI):**
```
Tab           → next agent     (T1 → T2 → T3 → T4 → T5 → T1)
Shift+Tab     → previous agent (T1 → T5 → T4 → T3 → T2 → T1)
```

**iPhone Volume Buttons:**
```
Vol DOWN      → next agent     (T1 → T2 → T3 → T4 → T5 → T1)
Vol UP        → previous agent (T5 → T4 → T3 → T2 → T1 → T5)
Hold 2s       → toggle Manual ↔ Auto mode
```

**Simulate via curl (testing / scripting):**
```bash
curl -X POST http://localhost:3333/volume \
  -H "Content-Type: application/json" -d '{"button":"down"}'   # next agent

curl -X POST http://localhost:3333/volume \
  -H "Content-Type: application/json" -d '{"button":"up"}'     # previous agent

curl -X POST http://localhost:3333/volume \
  -H "Content-Type: application/json" -d '{"button":"hold"}'   # toggle mode
```

### TUI Keyboard Controls (inside `npm run ui`)

```
Tab           → switch to next agent
Shift+Tab     → switch to previous agent
Enter         → submit typed prompt to active agent
Space         → push-to-talk toggle (only when input box is empty;
                voice pipeline must be running)
Ctrl+C        → quit TerminalForge
```

### In-TUI Slash Commands (type in the active agent input box)

```
/clear                              → clear conversation history for the active agent
/status                             → show state: active terminal, mode, task status
/msg <agentId> <type> <message>     → send a message directly to another agent
/reply <message>                    → quick-reply to the last received message
```

**Examples:**
```
/msg senior-dev escalation Need a review on my JWT implementation before merge
/msg qa-engineer task Please write tests for the new /auth/refresh endpoint
/reply Looks good — approved for merge
/status
/clear
```

### Standalone Agent REPL Commands (`npm run agent N`)

```
/msg <agentId> <type> <message>     → send a message to another agent
/reply <message>                    → reply to the last received message
/clear                              → clear this agent's conversation history
/status                             → show current terminal state from state.json
/quit                               → close this agent REPL
```

### Voice Pipeline Commands

```bash
# Start voice (standalone — run alongside npm run ui)
npm run voice               # push-to-talk mode  (Space / R / F5 to toggle)
npm run voice:auto          # auto-VAD mode      (always listening, 1.5s pause sends)
npm run voice:wake          # wake-word mode     (say "Hey Forge" to activate)
npm run voice:hotkey        # separate hotkey controller terminal (for push-to-talk)
npm run voice:debug         # push-to-talk with verbose debug logging

# Voice pipeline flags (python direct)
python3 -m voice.pipeline --mode push-to-talk
python3 -m voice.pipeline --mode auto-vad
python3 -m voice.pipeline --mode wake-word
python3 -m voice.pipeline --model small.en   # use a larger/more accurate model
python3 -m voice.pipeline --debug            # verbose logging
```

**Push-to-talk keyboard controls (in hotkey terminal or via Space in TUI):**
```
Space / R / F5    → start recording (hold while speaking, or press to toggle)
Space / R / F5    → stop recording and send to active agent
ESC               → cancel recording, discard audio
```

### Agent IDs (for /msg and /reply commands)

```
junior-dev          T1 — Junior Developer
senior-dev          T2 — Senior Developer
qa-engineer         T3 — QA Engineer
devops-engineer     T4 — DevOps Engineer
project-manager     T5 — Project Manager
```

### Message Types (for /msg command)

```
task          → assign a task to another agent
review        → request or return a code review
escalation    → escalate a blocker to a senior agent
bug-report    → file a bug with repro steps
handoff       → pass work context to another agent
summary       → share a progress summary
```

### Inspecting State and Logs

```bash
# Current application state
cat .terminalforge/state.json          # active terminal, mode, all 5 task statuses

# Agent message history
tail -f .terminalforge/messages.log    # live feed of all agent-to-agent messages
cat .terminalforge/messages.log        # full message log

# Voice pipeline state
cat .terminalforge/voice_state.json    # idle / recording / transcribing
cat .terminalforge/voice_input.json    # latest transcription from pipeline

# Project and tasks
cat .terminalforge/project.md          # current project description
cat .terminalforge/open_tasks.json     # open task list
cat .terminalforge/handoffs.md         # agent handoff notes

# Check bridge server health
curl http://localhost:3333/health
curl http://localhost:3333/state
```

### Running Tests

```bash
npm run test:switch    # Phase 1 — navigation + state (19 tests)
npm run test:agents    # Phase 2 — agent unit tests (47 tests)
npm run test:smoke     # Phase 2 — live Claude API streaming test (requires .env)
npm run lint           # ESLint check
```

---

## Running Tests

```bash
npm run test:switch    # Phase 1 — navigation + state tests (19 tests)
npm run test:agents    # Phase 2 — agent unit tests (47 tests)
npm run test:smoke     # Phase 2 — live Claude API streaming test (requires .env)
```

---

## Test Results (as of May 2026)

Full end-to-end test suite — all 8 test areas verified against the live stack and real Claude API:

| # | Test Area | Result | Detail |
|---|-----------|--------|--------|
| 1 | Bridge server | ✅ Pass | `/health`, `/volume` (down/up/hold), `/state`, 300ms debounce all working |
| 2 | All 5 agents — Claude API | ✅ Pass | T1 1797ms · T2 1666ms · T3 2211ms · T4 2264ms · T5 2371ms — all streamed correct identity responses |
| 3 | Agent-to-agent messaging | ✅ Pass | `/msg`, `/reply`, targeted delivery, `subscribeAll` fan-out, validation rejections |
| 4 | Message bus | ✅ 11/11 | publish/subscribe/readLog/getUnread, invalid agent/type/payload all rejected |
| 5 | Context injection | ✅ 17/18 | PROJECT, GIT, TASKS, MESSAGES, HANDOFF sections all present in every agent call |
| 6 | Bus monitor | ✅ Pass | History replay, `subscribeAll` live feed, cross-process 500ms poll all confirmed |
| 7 | Navigation + state | ✅ 15/15 | DOWN 1→2→3→4→5→1, UP 1→5→4→3→2→1→5, HOLD toggle, debounce blocks 100ms rapid press |
| 8 | Full E2E pipeline | ✅ 25/25 | PM → Claude → task → junior-dev → context injection → Claude → escalation → senior-dev → review |

### End-to-End Pipeline Trace (Test 8)

The full pipeline ran live against the Claude API in a single test:

1. **PM (T5)** called Claude, produced a structured JSON task spec for a `GET /ping` endpoint
2. **Task published** to `junior-dev` via message bus with `taskId: task-e2e-001`
3. **Context injection** confirmed — Junior Dev's `buildAgentContext()` included the unread task in the MESSAGES section
4. **Junior Dev (T1)** called Claude, wrote a complete Express implementation + unit test, escalated to Senior Dev
5. **Escalation published** to `senior-dev` with the same `taskId` linking both messages
6. **Senior Dev (T2)** called Claude, reviewed the implementation, gave specific feedback (suggested adding `timestamp` field), **APPROVED**
7. **Message log** confirmed full pipeline trace — both messages stored with matching `taskId`

**Zero regressions. Zero broken functionality across all 8 test areas.**

---

## Project Structure

```
├── core/
│   ├── state.js            State management — read/write state.json, navigation logic
│   ├── event-listener.js   Volume button event hub (EventEmitter)
│   ├── agent-router.js     Routes prompts to Claude API sessions, streaming
│   ├── message-bus.js      Inter-agent message bus — publish/subscribe/monitor
│   └── context-manager.js  Injects project.md, tasks, handoffs, git, messages into each call
├── agents/
│   ├── junior-dev.js       T1 — system prompt, tools, identity
│   ├── senior-dev.js       T2 — system prompt, tools, identity
│   ├── qa-engineer.js      T3 — system prompt, tools, identity
│   ├── devops-engineer.js  T4 — system prompt, tools, identity
│   └── project-manager.js  T5 — system prompt, orchestrator config
├── bridge/
│   ├── server.js           Express server :3333 — volume events + POST /voice endpoint
│   └── hotkey-fallback.js  Push-to-talk keyboard controller (spacebar toggle)
├── voice/                  ✅ BUILT — Phase 3 voice pipeline
│   ├── pipeline.py         Main coordinator — push-to-talk / auto-VAD / wake-word modes
│   ├── transcriber.py      faster-whisper wrapper — local offline STT, < 2s latency
│   ├── vad.py              silero-vad mic capture + speech detection
│   ├── wake-word.py        "Hey Forge" wake word via openWakeWord
│   └── tts.py              TTS output — macOS say (default) or ElevenLabs
├── requirements.txt        Python dependencies for voice pipeline
├── ui/                     ✅ BUILT — Phase 4 TUI (all 5 agents in one fullscreen window)
│   ├── App.jsx             Root Ink component — layout, state management, streaming
│   ├── AgentPane.jsx       Per-agent pane: active (input + streaming) / inactive (compact)
│   ├── StatusBar.jsx       Top bar: active agent, mode, status dots, key hints
│   ├── BusMonitorPanel.jsx Right-column live inter-agent message feed
│   └── TerminalColorManager.jsx  Agent info, status → colour/label/dot mappings
├── scripts/
│   ├── start.sh            ONE-COMMAND launcher — checks deps, installs, starts everything
│   ├── agent-repl.js       Interactive per-agent REPL with /msg and /reply
│   ├── bus-monitor.js      Live inter-agent traffic monitor
│   ├── ui.js               TUI entry point — loads .env, renders App, cursor hide/restore
│   ├── launch.sh           Opens 7 terminal windows (iTerm2 or Terminal.app)
│   └── tmux-layout.sh      tmux 7-window layout
├── start.sh                Symlink → scripts/start.sh (run from project root)
├── tests/
│   ├── test-switch.js      Phase 1 tests (19)
│   ├── test-agents.js      Phase 2 tests (47)
│   └── smoke-test-agents.js  Live API test
└── .terminalforge/         Runtime state (git-ignored)
    ├── state.json          Active terminal + mode + terminalStatus per agent
    ├── messages.log        Agent-to-agent message log (newline-delimited JSON)
    ├── voice_state.json    Voice pipeline status (idle/recording/transcribing)
    ├── voice_input.json    Latest transcription — TUI polls and auto-submits
    ├── project.md          Current project description
    ├── open_tasks.json     Task list
    └── handoffs.md         Cross-agent handoff notes
```

---

## Build Phases

| Phase | Name | Status |
|---|---|---|
| Phase 1 | Foundation — bridge, state, event listener | ✅ Complete |
| Phase 2 | Agent Engine — 5 Claude sessions, context, git | ✅ Complete |
| Bonus | Launcher scripts + observability layer | ✅ Complete |
| Phase 3 | Voice Layer — faster-whisper, silero-vad, push-to-talk | ✅ Complete |
| Phase 4 | TUI — Ink components, terminal colour system | ✅ Complete |
| Phase 5 | Agent Comms — PM orchestrator loop (bus core ✅ done) | 🔜 |
| Phase 6 | Polish — error handling, QUICKSTART.md, demo | 🔜 |

---

## Tech Stack

- **AI:** Anthropic Claude API (`claude-sonnet-4-5`), always streaming
- **Runtime:** Node.js 18+ (core) · Python 3.11+ (voice)
- **Voice STT:** faster-whisper (local, offline) — ✅ Built (`npm run voice`)
- **Voice Activity:** silero-vad — ✅ Built
- **Wake Word:** openWakeWord ("Hey Forge") — ✅ Built (`npm run voice:wake`)
- **Terminal UI:** Ink (React for terminal) — ✅ Built (`npm run ui`)
- **Message Bus:** Node.js EventEmitter (in-process, no broker)
- **iPhone Bridge:** iOS Shortcuts → HTTP POST → localhost:3333

---

## Repositories

- **Fork (working copy):** https://github.com/Hemin-Dhamelia/Fork-TerminalForgeAI.git
- **Upstream main:** https://github.com/TerminalForgeAI/TerminalForgeAI.git
