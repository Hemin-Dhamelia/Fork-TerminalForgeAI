/**
 * TerminalForge -- Bus Monitor Panel
 * Right-column panel showing all inter-agent messages in real time.
 * Mirrors scripts/bus-monitor.js but embedded inside the Ink TUI.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { AGENT_NAMES } from '../core/message-bus.js';

const TYPE_ICONS = {
  task:         '📋',
  review:       '🔍',
  escalation:   '🚨',
  'bug-report': '🐛',
  handoff:      '🤝',
  summary:      '📊',
};

const TYPE_COLORS = {
  task:         'cyan',
  review:       'blue',
  escalation:   'red',
  'bug-report': 'red',
  handoff:      'yellow',
  summary:      'green',
};

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return '??:??:??';
  }
}

export default function BusMonitorPanel({ messages, width, height }) {
  // Each message takes ~3 lines; show as many as fit
  const headerLines = 3;
  const contentLines = height - headerLines;
  const maxMsgs = Math.max(1, Math.floor(contentLines / 3));
  const visible = messages.slice(-maxMsgs);
  const innerW = Math.max(4, width - 2); // inside border

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor="cyan"
      flexShrink={0}
    >
      {/* Header */}
      <Box paddingX={1} flexShrink={0}>
        <Text bold color="cyan">📡 Bus</Text>
      </Box>

      {/* Divider */}
      <Box flexShrink={0}>
        <Text color="cyan" dimColor>{'-'.repeat(innerW)}</Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" overflow="hidden" flexGrow={1}>
        {visible.length === 0 ? (
          <Text color="gray" dimColor> waiting...</Text>
        ) : (
          visible.map((msg, i) => {
            const from     = AGENT_NAMES[msg.from] || { emoji: '?', label: msg.from };
            const to       = AGENT_NAMES[msg.to]   || { emoji: '?', label: msg.to };
            const typeCol  = TYPE_COLORS[msg.type] || 'white';
            const typeIcon = TYPE_ICONS[msg.type]  || '💬';
            const time     = fmtTime(msg.timestamp);
            const preview  = msg.payload?.slice(0, innerW - 2) || '';

            return (
              <Box key={i} flexDirection="column" flexShrink={0}>
                {/* Line 1: time + route */}
                <Text wrap="truncate">
                  <Text color="gray" dimColor>{time} </Text>
                  <Text color={typeCol} bold>{typeIcon}</Text>
                  <Text bold color="white"> {from.emoji}->{to.emoji}</Text>
                </Text>

                {/* Line 2: payload preview */}
                <Text color="gray" dimColor wrap="truncate"> {preview}</Text>

                {/* Separator */}
                <Text color="gray" dimColor wrap="truncate">{'.'.repeat(innerW)}</Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
