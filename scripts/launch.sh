#!/usr/bin/env bash
# TerminalForge — Launch Script
# Opens 7 terminal windows: 1 bridge server + 5 agent REPLs + 1 bus monitor
# Supports: iTerm2 (preferred) → Terminal.app (fallback)

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPL="$DIR/scripts/agent-repl.js"
BRIDGE="$DIR/bridge/server.js"
MONITOR="$DIR/scripts/bus-monitor.js"

AGENT_NAMES=(
  ""
  "Junior Developer"
  "Senior Developer"
  "QA Engineer"
  "DevOps Engineer"
  "Project Manager"
)

# ── Preflight checks ─────────────────────────────────────────────────────────

if [ ! -f "$DIR/.env" ]; then
  echo "❌  .env not found. Copy .env.example to .env and add your ANTHROPIC_API_KEY."
  exit 1
fi

if ! grep -q "ANTHROPIC_API_KEY=sk-" "$DIR/.env" 2>/dev/null; then
  echo "❌  ANTHROPIC_API_KEY missing or invalid in .env"
  exit 1
fi

if [ ! -d "$DIR/node_modules" ]; then
  echo "📦  node_modules not found — running npm install..."
  npm install --prefix "$DIR"
fi

# Ensure .terminalforge exists with initial state
mkdir -p "$DIR/.terminalforge"
if [ ! -f "$DIR/.terminalforge/state.json" ]; then
  cat > "$DIR/.terminalforge/state.json" <<'JSON'
{
  "activeTerminal": 1,
  "mode": "manual",
  "lastSwitch": "2026-04-26T00:00:00Z",
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
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       TerminalForge — Launching          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── iTerm2 launcher ──────────────────────────────────────────────────────────

launch_iterm2() {
  echo "🖥️  Detected iTerm2 — opening split pane layout..."

  osascript <<APPLESCRIPT
tell application "iTerm2"
  activate
  set newWindow to (create window with default profile)

  tell newWindow
    -- Tab 1: Bridge Server
    tell current tab
      tell current session
        set name to "🌉 Bridge Server"
        write text "cd '$DIR' && echo '🌉 Bridge Server — TerminalForge' && node bridge/server.js"
      end tell
    end tell

    -- Agents T1–T5: each in its own tab
    set agentNames to {"👨‍💻 T1 · Junior Dev", "🧠 T2 · Senior Dev", "🔍 T3 · QA Engineer", "⚙️  T4 · DevOps", "📋 T5 · PM"}
    set agentIndexes to {1, 2, 3, 4, 5}

    repeat with i from 1 to 5
      set agentTab to (create tab with default profile)
      tell agentTab
        tell current session
          set name to item i of agentNames
          write text "cd '$DIR' && node scripts/agent-repl.js " & item i of agentIndexes
        end tell
      end tell
    end repeat

    -- Tab 7: Bus Monitor
    set monitorTab to (create tab with default profile)
    tell monitorTab
      tell current session
        set name to "📡 Bus Monitor"
        write text "cd '$DIR' && node scripts/bus-monitor.js"
      end tell
    end tell

    -- Focus the first agent tab (tab 2)
    tell tab 2 to select
  end tell
end tell
APPLESCRIPT

  echo "✅  iTerm2 launched with 7 tabs (6 windows + bus monitor)."
}

# ── Terminal.app launcher ────────────────────────────────────────────────────

launch_terminal_app() {
  echo "🖥️  Opening Terminal.app windows..."

  # Bridge server window
  osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "cd '$DIR' && echo '🌉 Bridge Server — TerminalForge' && node bridge/server.js"
  set the custom title of front window to "🌉 Bridge Server"
end tell
APPLESCRIPT

  sleep 0.5

  # Agent windows T1–T5
  EMOJIS=("👨‍💻" "🧠" "🔍" "⚙️" "📋")
  for i in 1 2 3 4 5; do
    EMOJI="${EMOJIS[$((i-1))]}"
    AGENT="${AGENT_NAMES[$i]}"
    osascript <<APPLESCRIPT
tell application "Terminal"
  do script "cd '$DIR' && node scripts/agent-repl.js $i"
  set the custom title of front window to "$EMOJI T$i · $AGENT"
end tell
APPLESCRIPT
    sleep 0.3
  done

  # Bus Monitor window
  osascript <<APPLESCRIPT
tell application "Terminal"
  do script "cd '$DIR' && node scripts/bus-monitor.js"
  set the custom title of front window to "📡 Bus Monitor"
end tell
APPLESCRIPT

  echo "✅  Terminal.app opened 7 windows (1 bridge + 5 agents + 1 bus monitor)."
}

# ── Detect and launch ────────────────────────────────────────────────────────

if [ -d "/Applications/iTerm.app" ]; then
  launch_iterm2
else
  launch_terminal_app
fi

echo ""
echo "┌─────────────────────────────────────────────┐"
echo "│  Windows opened:                            │"
echo "│   🌉  Bridge Server  (port 3333)            │"
echo "│   👨‍💻  T1 · Junior Developer                 │"
echo "│   🧠  T2 · Senior Developer                 │"
echo "│   🔍  T3 · QA Engineer                      │"
echo "│   ⚙️   T4 · DevOps Engineer                  │"
echo "│   📋  T5 · Project Manager                  │"
echo "│   📡  Bus Monitor  (all inter-agent msgs)   │"
echo "└─────────────────────────────────────────────┘"
echo ""
echo "  Simulate Vol DOWN:  curl -X POST http://localhost:3333/volume -H 'Content-Type: application/json' -d '{\"button\":\"down\"}'"
echo "  Simulate Vol UP:    curl -X POST http://localhost:3333/volume -H 'Content-Type: application/json' -d '{\"button\":\"up\"}'"
echo "  Toggle mode:        curl -X POST http://localhost:3333/volume -H 'Content-Type: application/json' -d '{\"button\":\"hold\"}'"
echo ""
