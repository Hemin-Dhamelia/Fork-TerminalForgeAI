#!/usr/bin/env bash
# =============================================================================
#  TerminalForge — Full Stack Startup Script
#  Checks every dependency, installs what's missing, then starts everything.
#
#  Usage:
#    bash scripts/start.sh                  # interactive — prompts for voice mode
#    bash scripts/start.sh --voice          # start with push-to-talk voice
#    bash scripts/start.sh --voice=auto     # start with always-listening voice
#    bash scripts/start.sh --voice=wake     # start with "Hey Forge" wake word
#    bash scripts/start.sh --no-voice       # skip voice pipeline entirely
#    bash scripts/start.sh --debug          # enable DEBUG=tf:* logging
#    bash scripts/start.sh --help           # show this help
#
#  What it does:
#    1. Checks Node.js and Python versions
#    2. Runs npm install if node_modules is missing or stale
#    3. Runs pip install -r requirements.txt if any Python package is missing
#    4. Validates .env (ANTHROPIC_API_KEY)
#    5. Creates .terminalforge/ runtime directory with initial state
#    6. Kills anything already running on port 3333
#    7. Starts bridge server in background
#    8. Optionally starts voice pipeline in background
#    9. Starts full-screen TUI (foreground — Ctrl+C to quit everything)
#   10. Cleans up all background processes on exit
# =============================================================================

set -uo pipefail

# -- Resolve project root regardless of where script is called from -----------
# Resolve symlinks so ./start.sh (symlink) and scripts/start.sh both work
SCRIPT_PATH="${BASH_SOURCE[0]}"
while [ -L "$SCRIPT_PATH" ]; do
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
  SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
  [[ "$SCRIPT_PATH" != /* ]] && SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_PATH"
done
DIR="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
cd "$DIR"

# -- Colours ------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'   # reset

# -- PID tracking for cleanup -------------------------------------------------
BRIDGE_PID=""
VOICE_PID=""
HOTKEY_PID=""
LAUNCHED=false   # set to true once bridge is confirmed running

cleanup() {
  # Only print shutdown banner if we actually started services
  if $LAUNCHED; then
    echo ""
    echo -e "${DIM}  Shutting down TerminalForge...${NC}"
    [ -n "$BRIDGE_PID" ] && kill "$BRIDGE_PID" 2>/dev/null && echo -e "${DIM}  Stopped bridge server (pid $BRIDGE_PID)${NC}"
    [ -n "$VOICE_PID"  ] && kill "$VOICE_PID"  2>/dev/null && echo -e "${DIM}  Stopped voice pipeline (pid $VOICE_PID)${NC}"
    [ -n "$HOTKEY_PID" ] && kill "$HOTKEY_PID" 2>/dev/null && echo -e "${DIM}  Stopped hotkey controller (pid $HOTKEY_PID)${NC}"
    # Reset voice state to idle
    if [ -d "$DIR/.terminalforge" ]; then
      printf '{"status":"idle","mode":"push-to-talk","recording":false,"updatedAt":"%s"}' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DIR/.terminalforge/voice_state.json" 2>/dev/null || true
    fi
    echo -e "${CYAN}  TerminalForge stopped.${NC}"
  else
    # Silent cleanup — kill any stray PIDs without banner
    [ -n "$BRIDGE_PID" ] && kill "$BRIDGE_PID" 2>/dev/null || true
    [ -n "$VOICE_PID"  ] && kill "$VOICE_PID"  2>/dev/null || true
    [ -n "$HOTKEY_PID" ] && kill "$HOTKEY_PID" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# -- Load .env into bash so OLLAMA_MODEL, OLLAMA_BASE_URL etc. are available ----
# We parse it manually (grep + sed) instead of `source .env` so comments and
# multi-line values don't break the shell.  Only KEY=VALUE lines are imported;
# lines starting with # and blank lines are ignored.
if [ -f "$DIR/.env" ]; then
  while IFS='=' read -r key rest; do
    # Skip comments and empty lines
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    # Only export valid identifier keys; strip leading/trailing whitespace
    key=$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    rest=$(echo "$rest" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    # Don't override values already set in the environment
    [ -z "${!key+x}" ] && export "$key=$rest"
  done < "$DIR/.env"
fi

# -- Provider (can be overridden by LLM_PROVIDER env var before calling this script)
# e.g.  LLM_PROVIDER=ollama bash scripts/start.sh --voice
PROVIDER="${LLM_PROVIDER:-anthropic}"

# -- Detect which providers are actually needed (global + per-agent overrides) -
NEEDS_OLLAMA=false
NEEDS_ANTHROPIC=false
[ "$PROVIDER" = "ollama" ]    && NEEDS_OLLAMA=true
[ "$PROVIDER" = "anthropic" ] && NEEDS_ANTHROPIC=true
for _i in 1 2 3 4 5; do
  _VAR="AGENT_${_i}_PROVIDER"
  _VAL="${!_VAR:-}"
  [ "$_VAL" = "ollama" ]    && NEEDS_OLLAMA=true
  [ "$_VAL" = "anthropic" ] && NEEDS_ANTHROPIC=true
done
OLLAMA_MDL="${OLLAMA_MODEL:-llama3.1:8b}"

# -- Argument parsing ---------------------------------------------------------
VOICE_MODE=""          # empty = ask, "none" = skip, "push-to-talk"|"auto"|"wake" = start
START_HOTKEY=false
DEBUG_MODE=false
SHOW_HELP=false

for arg in "$@"; do
  case "$arg" in
    --voice)          VOICE_MODE="push-to-talk" ; START_HOTKEY=true ;;
    --voice=push)     VOICE_MODE="push-to-talk" ; START_HOTKEY=true ;;
    --voice=auto)     VOICE_MODE="auto"          ;;
    --voice=wake)     VOICE_MODE="wake"          ;;
    --no-voice)       VOICE_MODE="none"          ;;
    --debug)          DEBUG_MODE=true            ;;
    --help|-h)        SHOW_HELP=true             ;;
    *)
      echo -e "${RED}  Unknown argument: $arg${NC}" >&2
      echo "  Run with --help for usage." >&2
      exit 1
      ;;
  esac
done

if $SHOW_HELP; then
  echo ""
  echo "  TerminalForge Startup Script"
  echo ""
  echo "  Usage:"
  echo "    bash scripts/start.sh [options]"
  echo ""
  echo "  Options:"
  echo "    --voice          Start voice pipeline in push-to-talk mode + hotkey controller"
  echo "    --voice=auto     Start voice pipeline in always-listening (auto-VAD) mode"
  echo "    --voice=wake     Start voice pipeline with 'Hey Forge' wake word"
  echo "    --no-voice       Skip voice pipeline entirely"
  echo "    --debug          Enable verbose debug logging (DEBUG=tf:*)"
  echo "    --help           Show this help"
  echo ""
  exit 0
fi

# =============================================================================
#  BANNER
# =============================================================================

clear
echo ""
echo -e "${CYAN}${BOLD}"
echo "  ████████╗███████╗██████╗ ███╗   ███╗██╗███╗   ██╗ █████╗ ██╗"
echo "     ██╔══╝██╔════╝██╔══██╗████╗ ████║██║████╗  ██║██╔══██╗██║"
echo "     ██║   █████╗  ██████╔╝██╔████╔██║██║██╔██╗ ██║███████║██║"
echo "     ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║"
echo "     ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗"
echo "     ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝"
echo -e "${NC}"
echo -e "  ${DIM}macOS multi-agent AI development platform${NC}"
if $NEEDS_OLLAMA && $NEEDS_ANTHROPIC; then
  echo -e "  ${DIM}5 agents · Mixed (Claude + Ollama/${OLLAMA_MDL}) · Voice input · Agent-to-agent messaging${NC}"
elif $NEEDS_OLLAMA; then
  echo -e "  ${DIM}5 agents · Ollama (${OLLAMA_MDL}) · Voice input · Agent-to-agent messaging${NC}"
else
  echo -e "  ${DIM}5 agents · Anthropic Claude · Voice input · Agent-to-agent messaging${NC}"
fi
echo ""
echo -e "  ${DIM}────────────────────────────────────────────────────────────${NC}"
echo ""

# =============================================================================
#  STEP 1 — Check Node.js
# =============================================================================

step() { echo -e "  ${CYAN}${BOLD}[$1]${NC} $2"; }
ok()   { echo -e "  ${GREEN}✓${NC}  $1"; }
warn() { echo -e "  ${YELLOW}!${NC}  $1"; }
fail() { echo -e "  ${RED}✗${NC}  $1"; }
info() { echo -e "  ${DIM}    $1${NC}"; }

step "1/7" "Checking Node.js..."

if ! command -v node &>/dev/null; then
  fail "Node.js not found."
  info "Install from https://nodejs.org (v18+) or: brew install node"
  exit 1
fi

NODE_VER=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js v$NODE_VER found — v18+ required."
  info "Upgrade: brew install node  or  nvm install 20"
  exit 1
fi
ok "Node.js v$NODE_VER"

# =============================================================================
#  STEP 2 — Check Python
# =============================================================================

step "2/7" "Checking Python..."

PYTHON=""
for cmd in python3 python; do
  if command -v "$cmd" &>/dev/null; then
    PY_VER=$("$cmd" --version 2>&1 | awk '{print $2}')
    PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
    if [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -ge 11 ]; then
      PYTHON="$cmd"
      break
    fi
  fi
done

if [ -z "$PYTHON" ]; then
  warn "Python 3.11+ not found — voice pipeline will be unavailable."
  info "Install: brew install python@3.12  or  https://python.org"
  if [ "$VOICE_MODE" != "none" ] && [ "$VOICE_MODE" != "" ]; then
    warn "Continuing without voice. Use --no-voice to suppress this warning."
  fi
  VOICE_MODE="none"
else
  ok "Python $($PYTHON --version 2>&1 | awk '{print $2}')"
fi

# =============================================================================
#  STEP 3 — Install Node.js dependencies
# =============================================================================

step "3/7" "Checking Node.js dependencies..."

NEEDS_INSTALL=false
if [ ! -d "$DIR/node_modules" ]; then
  NEEDS_INSTALL=true
  info "node_modules not found"
elif [ "$DIR/package.json" -nt "$DIR/node_modules/.package-lock.json" ] 2>/dev/null; then
  NEEDS_INSTALL=true
  info "package.json is newer than installed modules"
fi

if $NEEDS_INSTALL; then
  echo -e "  ${YELLOW}→${NC}  Running npm install..."
  if npm install 2>&1 | sed 's/^/      /'; then
    ok "npm install complete"
  else
    fail "npm install failed — check the output above"
    exit 1
  fi
else
  ok "Node.js dependencies up to date"
fi

# =============================================================================
#  STEP 4 — Install Python dependencies
# =============================================================================

if [ "$VOICE_MODE" != "none" ] && [ -n "$PYTHON" ]; then
  step "4/7" "Checking Python dependencies..."

  MISSING_PKGS=()
  REQUIRED_PKGS=("faster_whisper" "silero_vad" "sounddevice" "numpy" "loguru" "requests")

  for pkg in "${REQUIRED_PKGS[@]}"; do
    if ! "$PYTHON" -c "import $pkg" 2>/dev/null; then
      MISSING_PKGS+=("$pkg")
    fi
  done

  if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
    echo -e "  ${YELLOW}→${NC}  Missing packages: ${MISSING_PKGS[*]}"
    echo -e "  ${YELLOW}→${NC}  Running: pip install -r requirements.txt"
    echo ""
    "$PYTHON" -m pip install -r "$DIR/requirements.txt" 2>&1 | \
      grep -E "^(Collecting|Installing|Successfully|Requirement already|ERROR|error)" | \
      sed 's/^/      /' || {
        warn "pip install encountered errors. Voice pipeline may not work."
        info "Try manually: pip install -r requirements.txt"
      }
    true  # don't let grep's exit code kill the script
    echo ""
    ok "Python dependencies installed"
  else
    ok "Python dependencies up to date"
  fi

  # Check openwakeword separately (optional — only needed for wake-word mode)
  if [ "$VOICE_MODE" = "wake" ]; then
    if ! "$PYTHON" -c "import openwakeword" 2>/dev/null; then
      echo -e "  ${YELLOW}→${NC}  Installing openwakeword (wake-word mode)..."
      "$PYTHON" -m pip install openwakeword --quiet || warn "openwakeword install failed — wake-word mode may not work"
    fi
  fi
else
  step "4/7" "Skipping Python dependencies (voice disabled)"
  ok "Skipped"
fi

# =============================================================================
#  STEP 5 — Validate .env
# =============================================================================

step "5/7" "Checking environment configuration..."

if [ ! -f "$DIR/.env" ]; then
  fail ".env file not found."
  info "Create it: cp .env.example .env"
  exit 1
fi

# NEEDS_OLLAMA / NEEDS_ANTHROPIC / OLLAMA_MDL already set above (before the banner)

# Validate Anthropic key if any agent uses it
if $NEEDS_ANTHROPIC; then
  if ! grep -q "ANTHROPIC_API_KEY=sk-" "$DIR/.env" 2>/dev/null; then
    fail "ANTHROPIC_API_KEY missing or invalid in .env"
    info "Edit .env and set ANTHROPIC_API_KEY=sk-ant-api03-..."
    exit 1
  fi
  ok "Anthropic API key found"
fi

# Validate Ollama if any agent uses it
if $NEEDS_OLLAMA; then
  OLLAMA_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"
  if ! curl -sf "$OLLAMA_URL" &>/dev/null; then
    fail "Ollama server not running at $OLLAMA_URL"
    info "Start it with: ollama serve"
    info "Or install from: https://ollama.com"
    exit 1
  fi
  # Check the model is actually pulled (OLLAMA_MDL was read from .env earlier)
  if ! ollama list 2>/dev/null | grep -q "^${OLLAMA_MDL}"; then
    fail "Model '${OLLAMA_MDL}' not found in Ollama."
    info "Pull it with: ollama pull ${OLLAMA_MDL}"
    info "Or change OLLAMA_MODEL in .env"
    exit 1
  fi
  ok "Ollama running · model: ${OLLAMA_MDL}"
fi

# =============================================================================
#  STEP 6 — Initialise runtime directory
# =============================================================================

step "6/7" "Initialising runtime state..."

mkdir -p "$DIR/.terminalforge"

# Write initial state.json if missing
if [ ! -f "$DIR/.terminalforge/state.json" ]; then
  cat > "$DIR/.terminalforge/state.json" <<'JSON'
{
  "activeTerminal": 1,
  "mode": "manual",
  "lastSwitch": "2026-01-01T00:00:00.000Z",
  "autonomousStepCount": 0,
  "terminalStatus": {
    "1": "idle",
    "2": "idle",
    "3": "idle",
    "4": "idle",
    "5": "idle"
  }
}
JSON
  info "Created .terminalforge/state.json"
fi

# Reset voice state to idle
cat > "$DIR/.terminalforge/voice_state.json" <<'JSON'
{
  "status": "idle",
  "mode": "push-to-talk",
  "recording": false,
  "wakeWordDetected": false,
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
JSON

# Clear any stale voice input from a previous session
rm -f "$DIR/.terminalforge/voice_input.json" 2>/dev/null || true

ok "Runtime directory ready"

# =============================================================================
#  STEP 7 — Voice mode selection (interactive if not passed as flag)
# =============================================================================

step "7/7" "Configuring launch options..."

if [ -n "$PYTHON" ] && [ "$VOICE_MODE" = "" ]; then
  echo ""
  echo -e "  ${BOLD}Voice pipeline options:${NC}"
  echo -e "  ${DIM}  1)  Push-to-talk  — press SPACE to toggle recording (default)${NC}"
  echo -e "  ${DIM}  2)  Auto-VAD       — always listening, 1.5s pause sends prompt${NC}"
  echo -e "  ${DIM}  3)  Wake word      — say 'Hey Forge' to activate (needs training)${NC}"
  echo -e "  ${DIM}  4)  No voice       — text-only, skip voice pipeline${NC}"
  echo ""
  read -r -p "  Select voice mode [1-4, default=1]: " VOICE_CHOICE
  case "${VOICE_CHOICE:-1}" in
    1) VOICE_MODE="push-to-talk" ; START_HOTKEY=true ;;
    2) VOICE_MODE="auto"         ;;
    3) VOICE_MODE="wake"         ;;
    4) VOICE_MODE="none"         ;;
    *) VOICE_MODE="push-to-talk" ; START_HOTKEY=true ; warn "Invalid choice — defaulting to push-to-talk" ;;
  esac
fi

case "$VOICE_MODE" in
  push-to-talk) ok "Voice: push-to-talk (spacebar toggle)" ;;
  auto)         ok "Voice: auto-VAD (always listening)"    ;;
  wake)         ok "Voice: wake word ('Hey Forge')"        ;;
  none)         ok "Voice: disabled"                       ;;
  *)            ok "Voice: disabled"                       ;;
esac

# =============================================================================
#  LAUNCH
# =============================================================================

echo ""
echo -e "  ${DIM}────────────────────────────────────────────────────────────${NC}"
echo ""

# Kill anything already on port 3333 (stale bridge from previous session)
if lsof -ti:3333 &>/dev/null; then
  warn "Port 3333 in use — killing stale process..."
  lsof -ti:3333 | xargs kill -9 2>/dev/null || true
  sleep 0.5
fi

# -- Start bridge server -------------------------------------------------------
echo -e "  ${CYAN}→${NC}  Starting bridge server..."

if $DEBUG_MODE; then
  DEBUG=tf:* node "$DIR/bridge/server.js" &
else
  node "$DIR/bridge/server.js" > "$DIR/.terminalforge/bridge.log" 2>&1 &
fi
BRIDGE_PID=$!

# Wait for bridge to come up (up to 5s)
READY=false
for i in $(seq 1 10); do
  sleep 0.5
  if curl -sf http://127.0.0.1:3333/health &>/dev/null; then
    READY=true
    break
  fi
done

if $READY; then
  ok "Bridge server running  (pid $BRIDGE_PID, port 3333)"
  LAUNCHED=true   # services are up — cleanup will now print the shutdown banner
else
  fail "Bridge server failed to start. Check .terminalforge/bridge.log"
  cat "$DIR/.terminalforge/bridge.log" 2>/dev/null | tail -10 | sed 's/^/      /'
  exit 1
fi

# -- Start voice pipeline (if enabled) ----------------------------------------
if [ "$VOICE_MODE" != "none" ] && [ "$VOICE_MODE" != "" ] && [ -n "$PYTHON" ]; then
  echo -e "  ${CYAN}→${NC}  Starting voice pipeline (${VOICE_MODE})..."

  PIPELINE_MODE_ARG="push-to-talk"
  case "$VOICE_MODE" in
    auto) PIPELINE_MODE_ARG="auto-vad"    ;;
    wake) PIPELINE_MODE_ARG="wake-word"   ;;
    *)    PIPELINE_MODE_ARG="push-to-talk" ;;
  esac

  # -u = unbuffered so logs flush immediately to voice.log
  # -m = run as module so `from voice.X import Y` resolves from project root
  if $DEBUG_MODE; then
    cd "$DIR" && "$PYTHON" -u -m voice.pipeline --mode "$PIPELINE_MODE_ARG" --debug \
      > "$DIR/.terminalforge/voice.log" 2>&1 &
  else
    cd "$DIR" && "$PYTHON" -u -m voice.pipeline --mode "$PIPELINE_MODE_ARG" \
      > "$DIR/.terminalforge/voice.log" 2>&1 &
  fi
  VOICE_PID=$!

  # Wait for model to load (up to 8s — base.en takes ~3s from cache)
  info "Loading Whisper model (base.en, first call may take 3-5s)..."
  for _i in $(seq 1 8); do
    sleep 1
    if ! kill -0 "$VOICE_PID" 2>/dev/null; then break; fi
    if grep -q "Push-to-talk mode ready\|Auto-VAD mode ready\|Wake-word mode" \
        "$DIR/.terminalforge/voice.log" 2>/dev/null; then break; fi
  done

  if kill -0 "$VOICE_PID" 2>/dev/null; then
    ok "Voice pipeline running  (pid $VOICE_PID, mode: $PIPELINE_MODE_ARG)"
    info "Logs: .terminalforge/voice.log"
  else
    warn "Voice pipeline exited early. Check .terminalforge/voice.log"
    cat "$DIR/.terminalforge/voice.log" 2>/dev/null | tail -5 | sed 's/^/      /'
    VOICE_PID=""
  fi

  # Push-to-talk hotkey is now built into the TUI (Space key)
  # No separate hotkey window is needed anymore.
  if $START_HOTKEY && [ -n "$VOICE_PID" ]; then
    ok "Push-to-talk ready — press Space inside the TUI to toggle recording"
  fi
fi

# -- Summary banner -----------------------------------------------------------

echo ""
echo -e "  ${DIM}────────────────────────────────────────────────────────────${NC}"
echo ""
if $NEEDS_OLLAMA && $NEEDS_ANTHROPIC; then
  echo -e "  ${GREEN}${BOLD}Everything is ready.${NC}  Launching TUI with ${MAGENTA}Claude${NC} + ${GREEN}Ollama (${OLLAMA_MDL})${NC}...\n"
elif $NEEDS_OLLAMA; then
  echo -e "  ${GREEN}${BOLD}Everything is ready.${NC}  Launching TUI with ${GREEN}Ollama (${OLLAMA_MDL})${NC}...\n"
else
  echo -e "  ${GREEN}${BOLD}Everything is ready.${NC}  Launching TUI with ${MAGENTA}Anthropic Claude${NC}...\n"
fi
echo -e "  ${DIM}Services running in background:${NC}"
echo -e "  ${DIM}  🌉  Bridge server     http://127.0.0.1:3333${NC}"
[ -n "$VOICE_PID" ] && echo -e "  ${DIM}  🎤  Voice pipeline   mode=$PIPELINE_MODE_ARG${NC}"
echo ""
echo -e "  ${DIM}TUI controls:${NC}"
echo -e "  ${DIM}  Tab / Shift+Tab   — switch between agents${NC}"
echo -e "  ${DIM}  Enter             — submit prompt to active agent${NC}"
echo -e "  ${DIM}  Ctrl+C            — quit everything${NC}"
[ "$VOICE_MODE" = "push-to-talk" ] && [ -n "$VOICE_PID" ] && \
  echo -e "  ${DIM}  Space             — toggle recording (press when input is empty)${NC}"
[ "$VOICE_MODE" = "auto" ] && [ -n "$VOICE_PID" ] && \
  echo -e "  ${DIM}  Speak naturally   — 1.5s pause sends to active agent${NC}"
echo ""
echo -e "  ${DIM}Logs: .terminalforge/bridge.log${NC}"
[ -n "$VOICE_PID" ] && echo -e "  ${DIM}       .terminalforge/voice.log${NC}"
echo ""
sleep 1

# -- Start TUI (foreground — Ctrl+C exits everything via trap) ----------------
# Pass LLM_PROVIDER explicitly so the TUI always uses the correct provider
# regardless of what is set in .env
if $DEBUG_MODE; then
  LLM_PROVIDER="$PROVIDER" DEBUG=tf:* npx tsx "$DIR/scripts/ui.js"
else
  LLM_PROVIDER="$PROVIDER" npx tsx "$DIR/scripts/ui.js"
fi
