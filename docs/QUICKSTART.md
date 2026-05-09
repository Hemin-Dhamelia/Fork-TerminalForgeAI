# TerminalForge — Quick Start Guide

Get FORGE running in under 5 minutes.

---

## Prerequisites

| Requirement | Version | Check |
|---|---|---|
| Node.js | 18+ | `node --version` |
| Python | 3.11+ | `python3 --version` |
| Anthropic API key | — | [console.anthropic.com](https://console.anthropic.com) |
| macOS | 13+ | — |

---

## 1. Clone and install

```bash
git clone https://github.com/Hemin-Dhamelia/Fork-TerminalForgeAI.git
cd Fork-TerminalForgeAI
npm install
```

---

## 2. Add your API key

```bash
cp .env.example .env
```

Open `.env` and set your key:

```env
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Everything else in `.env` has sensible defaults — you don't need to change anything else for a first run.

---

## 3. Launch

```bash
./start.sh
```

You'll be asked which voice mode you want:

```
Voice mode:
  1) push-to-talk  (press Space to record — recommended)
  2) auto-VAD      (always listening)
  3) wake word     (say "Hey Forge")
  4) none          (text only)
```

Choose **4 (none)** if you just want to try it out without setting up the Python voice pipeline. You can always add voice later.

The TUI opens in your current terminal window — 5 agent panes side by side with a live bus monitor on the right.

---

## 4. Your first prompt

Press **Tab** to move between agents. The active pane has a double border and an input box at the bottom.

Type a message and press **Enter**:

```
[T1 Junior Dev] › Hello! What can you help me with?
```

The agent responds with streaming output.

---

## 5. Navigate between agents

| Action | Keyboard | iPhone |
|---|---|---|
| Next agent | `Tab` | Volume DOWN |
| Previous agent | `Shift+Tab` | Volume UP |
| Toggle AUTO mode | — | Hold either button 2s |

Agent colours in the status bar tell you what each terminal is doing:
- **Grey dot** — idle
- **Yellow dot** — working
- **Green dot** — done
- **Red dot** — failed

---

## 6. Try Autonomous Mode

Switch to the Project Manager (T5) with Tab, then hold the volume button or type `/toggle` to enter AUTO mode. The status bar will show **AUTO**.

Then give a high-level goal:

```
[T5 Project Manager] › Build a simple Express REST API with GET /health and GET /users endpoints
```

FORGE will:
1. PM plans the work and creates a task list
2. Junior Dev implements the code (T1 turns yellow → green)
3. QA Engineer writes tests (T3 turns yellow → green)
4. You can watch all inter-agent messages in the Bus Monitor on the right

---

## 7. Send messages between agents

From any agent pane, type:

```
/msg senior-dev escalation I'm stuck on the JWT implementation — can you review?
/msg qa-engineer task Please write integration tests for POST /auth/login
/reply Looks good — approved for merge
```

---

## 8. Voice input (optional)

Install the Python dependencies first:

```bash
pip install -r requirements.txt
```

Then launch with voice:

```bash
./start.sh --voice          # push-to-talk (press Space in TUI)
./start.sh --voice=auto     # always listening
./start.sh --voice=wake     # say "Hey Forge" to activate
```

The status bar shows a voice indicator: 👂 Listening · 🎤 Recording · ⌨ Transcribing

---

## 9. Run with Ollama (offline, free)

If you want to run agents without an Anthropic API key:

```bash
brew install ollama
ollama pull qwen2.5-coder:7b   # one-time download (~5 GB)
npm run go:ollama
```

Or mix Claude and Ollama per agent in `.env`:

```env
AGENT_1_PROVIDER=ollama      # Junior Dev  — local
AGENT_2_PROVIDER=anthropic   # Senior Dev  — Claude
AGENT_5_PROVIDER=anthropic   # PM          — Claude
```

---

## Useful commands

```bash
# Launch options
./start.sh                  # interactive — prompts for voice mode
npm run go:claude           # all agents → Claude
npm run go:ollama           # all agents → Ollama (offline)
npm run go:no-voice         # no voice pipeline

# Test the setup
npm run test:switch         # navigation tests (no API key needed)
npm run test:agents         # agent unit tests (no API key needed)
npm run test:smoke          # live Claude API test (requires ANTHROPIC_API_KEY)

# Inspect state
cat .terminalforge/state.json
tail -f .terminalforge/messages.log

# Kill everything
kill $(lsof -ti:3333) && pkill -f "pipeline.py"
```

---

## Troubleshooting

**Bridge server won't start (port 3333 in use)**
```bash
kill $(lsof -ti:3333)
```

**`ANTHROPIC_API_KEY` not found**
Make sure `.env` exists and the key starts with `sk-ant-`. Run `cat .env` to verify.

**Voice pipeline fails to start**
```bash
pip install -r requirements.txt
python3 -c "import faster_whisper; print('ok')"
```
If faster-whisper is missing, install it: `pip install faster-whisper`.

**TUI looks broken / misaligned**
Your terminal needs to be at least 160 columns wide. Run `echo $COLUMNS` to check. Drag the window wider or zoom out.

**Ollama not responding**
```bash
ollama serve          # start the Ollama server
ollama list           # check which models are pulled
ollama pull qwen2.5-coder:7b
```

**Agent gives an error about rate limits**
The router retries automatically (up to 3 times with exponential backoff). If it keeps failing, check your [Anthropic usage limits](https://console.anthropic.com).

---

## What's next?

- Read the full [README](../README.md) for all commands and configuration options
- See [TerminalForge_ProjectPlan_v5.0](TerminalForge_ProjectPlan_v4.md) for the full roadmap including the JARVIS 3D web app
- Open an issue or PR at [github.com/TerminalForgeAI/TerminalForgeAI](https://github.com/TerminalForgeAI/TerminalForgeAI)
