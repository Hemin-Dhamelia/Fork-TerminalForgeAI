/**
 * TerminalForge — Terminal Colour Manager
 * Maps agent identity and task state → Ink colour props.
 * Used by every component that needs to colour-code agents or status.
 */

export const AGENT_INFO = {
  1: { name: 'Junior Dev',  fullName: 'Junior Developer',  emoji: '👨‍💻', id: 'junior-dev',      colour: 'cyan'    },
  2: { name: 'Senior Dev',  fullName: 'Senior Developer',  emoji: '🧠',  id: 'senior-dev',      colour: 'blue'    },
  3: { name: 'QA Engineer', fullName: 'QA Engineer',       emoji: '🔍',  id: 'qa-engineer',     colour: 'yellow'  },
  4: { name: 'DevOps',      fullName: 'DevOps Engineer',   emoji: '⚙️',  id: 'devops-engineer', colour: 'magenta' },
  5: { name: 'PM',          fullName: 'Project Manager',   emoji: '📋',  id: 'project-manager', colour: 'green'   },
};

export const STATUS_STYLES = {
  idle:    { bgColor: undefined, color: 'gray',  label: 'IDLE',    dot: '○' },
  working: { bgColor: 'yellow',  color: 'black', label: 'WORKING', dot: '◉' },
  done:    { bgColor: 'green',   color: 'black', label: 'DONE',    dot: '✓' },
  failed:  { bgColor: 'red',     color: 'white', label: 'FAILED',  dot: '✗' },
};

export function getStatusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.idle;
}

export function getAgentInfo(terminalIndex) {
  return AGENT_INFO[terminalIndex] || { name: 'Unknown', emoji: '?', id: 'unknown', colour: 'white', fullName: 'Unknown' };
}
