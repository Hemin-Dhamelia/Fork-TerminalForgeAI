#!/usr/bin/env bash
# TerminalForge — tmux layout
# Creates a tmux session with 7 windows: bridge + 5 agent REPLs + bus monitor
# Usage: bash scripts/tmux-layout.sh

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION="terminalforge"

if ! command -v tmux &>/dev/null; then
  echo "❌  tmux not found. Install with: brew install tmux"
  exit 1
fi

# Kill existing session if running
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Create session with bridge server in window 0
tmux new-session -d -s "$SESSION" -n "🌉 Bridge" -x 220 -y 50
tmux send-keys -t "$SESSION:0" "cd '$DIR' && node bridge/server.js" Enter

# Window 1–5: one per agent
WINDOWS=(
  "👨‍💻 T1-JuniorDev"
  "🧠 T2-SeniorDev"
  "🔍 T3-QA"
  "⚙️  T4-DevOps"
  "📋 T5-PM"
)

for i in 1 2 3 4 5; do
  tmux new-window -t "$SESSION" -n "${WINDOWS[$((i-1))]}"
  tmux send-keys -t "$SESSION:$i" "cd '$DIR' && node scripts/agent-repl.js $i" Enter
done

# Window 6: Bus Monitor
tmux new-window -t "$SESSION" -n "📡 BusMonitor"
tmux send-keys -t "$SESSION:6" "cd '$DIR' && node scripts/bus-monitor.js" Enter

# Focus window 1 (Junior Dev) on attach
tmux select-window -t "$SESSION:1"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   TerminalForge tmux session: '$SESSION'         ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Window 0 — 🌉 Bridge Server                    ║"
echo "║  Window 1 — 👨‍💻 T1 Junior Developer               ║"
echo "║  Window 2 — 🧠 T2 Senior Developer               ║"
echo "║  Window 3 — 🔍 T3 QA Engineer                    ║"
echo "║  Window 4 — ⚙️  T4 DevOps Engineer                ║"
echo "║  Window 5 — 📋 T5 Project Manager                ║"
echo "║  Window 6 — 📡 Bus Monitor (live agent msgs)    ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Attach:  tmux attach -t terminalforge           ║"
echo "║  Switch:  Ctrl+B then 0-6                        ║"
echo "║  Kill:    tmux kill-session -t terminalforge     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Auto-attach
tmux attach -t "$SESSION"
