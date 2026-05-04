/**
 * TerminalForge -- Agent Pane
 * One vertical pane per agent. Active pane shows full streaming output + input.
 * Inactive panes show compact last-N-lines + status colour badge.
 */

import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { getAgentInfo, getStatusStyle } from './TerminalColorManager.jsx';

const MSG_TYPE_ICONS = {
  task: '📋', review: '🔍', escalation: '🚨',
  'bug-report': '🐛', handoff: '🤝', summary: '📊',
};

// -- Estimate physical lines a message takes given available column width -------
// This is approximate (assumes Ink wraps at innerW) but good enough for scrolling.
function estimateLines(msg, innerW) {
  const wrapCount = (text) => Math.max(1, Math.ceil((text || ' ').length / Math.max(1, innerW)));

  if (msg.role === 'user') {
    // "you ▸ " prefix = 6 chars
    return Math.max(1, Math.ceil((msg.text.length + 6) / Math.max(1, innerW)));
  }
  if (msg.role === 'assistant') {
    const raw = msg.text || '';
    const lines = raw.split('\n');
    const total = lines.reduce((sum, l) => sum + wrapCount(l), 0);
    return total + (msg.streaming ? 1 : 0);
  }
  if (msg.role === 'notification') {
    return 4; // divider + from+type + text + divider
  }
  if (msg.role === 'system') {
    return wrapCount(msg.text || '');
  }
  return 1;
}

// -- Pick the tail of conversation that fits in maxLines physical rows ----------
// Always shows the NEWEST content (scrolled to bottom automatically).
function getVisibleEntries(conversation, maxLines, innerW) {
  if (!conversation.length) return [];
  let budget = maxLines;
  let startIdx = conversation.length;

  for (let i = conversation.length - 1; i >= 0; i--) {
    const needed = estimateLines(conversation[i], innerW);
    if (budget - needed < 0 && startIdx < conversation.length) {
      // This entry won't fully fit AND we already have newer content — stop here
      break;
    }
    budget  -= needed;
    startIdx = i;
    if (budget <= 0) break;
  }

  return conversation.slice(startIdx);
}

// -- Render a single conversation entry ----------------------------------------

function ConvLine({ msg, isActive, innerW }) {
  // User messages: clearly labelled "you ▸ …" so the user can verify what they
  // typed or what the voice pipeline transcribed. Dim + distinct from agent output.
  // TTS never speaks this — only the agent's response is spoken aloud.
  if (msg.role === 'user') {
    return (
      <Box flexDirection="row" flexShrink={0}>
        <Text color="cyan" dimColor bold>you ▸ </Text>
        <Text color="cyan" dimColor wrap={isActive ? 'wrap' : 'truncate'}>
          {msg.text}
        </Text>
      </Box>
    );
  }

  if (msg.role === 'assistant') {
    const lines = (msg.text || '').split('\n');
    return (
      <>
        {lines.map((line, i) => (
          <Text
            key={i}
            color="white"
            dimColor={!isActive}
            wrap={isActive ? 'wrap' : 'truncate'}
          >
            {line || ' '}
          </Text>
        ))}
        {msg.streaming && <Text color="cyan">▌</Text>}
      </>
    );
  }

  if (msg.role === 'notification') {
    const icon = MSG_TYPE_ICONS[msg.type] || '📨';
    return (
      <Box flexDirection="column" flexShrink={0}>
        <Text color="gray" dimColor>{'-'.repeat(Math.min(innerW, 20))}</Text>
        <Text color="yellow" bold wrap="truncate">
          {icon} {msg.from} [{msg.type?.toUpperCase()}]
        </Text>
        <Text color="yellow" dimColor wrap={isActive ? 'wrap' : 'truncate'}>
          {msg.text}
        </Text>
        <Text color="gray" dimColor>{'-'.repeat(Math.min(innerW, 20))}</Text>
      </Box>
    );
  }

  if (msg.role === 'system') {
    const color = msg.text.startsWith('v') ? 'green'
                : msg.text.startsWith('x') ? 'red'
                : 'white';
    return (
      <Text color={color} wrap={isActive ? 'wrap' : 'truncate'}>
        {msg.text}
      </Text>
    );
  }

  return null;
}

// -- Main AgentPane component ---------------------------------------------------

export default function AgentPane({
  terminalIndex,
  isActive,
  status,
  conversation,
  inputValue,
  onInputChange,
  onSubmit,
  isProcessing,
  voiceStatus,
  provider,
  width,
  height,
}) {
  const agent       = getAgentInfo(terminalIndex);
  const statusStyle = getStatusStyle(status);
  const innerW      = Math.max(4, width - 4); // inside border + padding

  // Layout heights
  const HEADER_H  = 2;                                          // badge + divider
  const INPUT_H   = isActive ? 2 : 0;                          // divider + input row
  const BORDER_H  = 2;                                          // top + bottom border
  const CONTENT_H = Math.max(2, height - HEADER_H - INPUT_H - BORDER_H);

  // Max inactive flat lines
  const MAX_LINES_INACTIVE = 8;

  // Flatten conversation into display lines for inactive panes
  const flatLines = [];
  for (const msg of conversation) {
    if (msg.role === 'user') {
      flatLines.push({ type: 'user', text: `you ▸ ${msg.text}` });
    } else if (msg.role === 'assistant') {
      (msg.text || '').split('\n').forEach(l => flatLines.push({ type: 'assistant', text: l || ' ' }));
      if (msg.streaming) flatLines.push({ type: 'cursor', text: '▌' });
    } else if (msg.role === 'notification') {
      flatLines.push({ type: 'notif', text: `${MSG_TYPE_ICONS[msg.type] || '📨'} ${msg.from}: ${(msg.text || '').slice(0, 30)}...` });
    } else if (msg.role === 'system') {
      flatLines.push({ type: 'system', text: msg.text });
    }
  }

  // Active pane: pick the tail of conversation that physically fits
  const visibleEntries = isActive
    ? getVisibleEntries(conversation, CONTENT_H, innerW)
    : [];

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle={isActive ? 'double' : 'single'}
      borderColor={isActive ? agent.colour : 'gray'}
      flexShrink={0}
      overflow="hidden"
    >
      {/* -- Header badge -- */}
      <Box paddingX={1} flexShrink={0} backgroundColor={statusStyle.bgColor}>
        <Text
          bold
          color={isActive ? agent.colour : (statusStyle.bgColor ? statusStyle.color : 'gray')}
          wrap="truncate"
        >
          {isActive
            ? `${agent.emoji} T${terminalIndex} ${agent.name}`
            : `${agent.emoji} ${agent.name}`}
        </Text>
        <Text
          color={statusStyle.bgColor ? statusStyle.color : 'gray'}
          dimColor={status === 'idle'}
        >
          {' '}{statusStyle.dot}{isActive ? ` ${statusStyle.label}` : ''}
        </Text>
        {provider && (
          <Text color={provider.color} bold>
            {' '}[{provider.short}]
          </Text>
        )}
      </Box>

      {/* -- Divider -- */}
      <Box flexShrink={0}>
        <Text color={isActive ? agent.colour : 'gray'} dimColor={!isActive}>
          {'-'.repeat(innerW)}
        </Text>
      </Box>

      {/* -- Content area -- */}
      <Box
        flexDirection="column"
        height={CONTENT_H}
        overflow="hidden"
        flexShrink={0}
      >
        {isActive ? (
          // Voice overlays take priority
          voiceStatus === 'recording' ? (
            <Box flexDirection="column" paddingX={1} paddingY={1}>
              <Text color="red" bold>🎤  Say something...</Text>
              <Text> </Text>
              <Text color="gray" dimColor>Press Space again to stop</Text>
              <Text color="gray" dimColor>(auto-vad: pause 1.5s to send)</Text>
            </Box>
          ) : voiceStatus === 'transcribing' ? (
            <Box flexDirection="column" paddingX={1} paddingY={1}>
              <Text color="magenta" bold>⌨   Transcribing...</Text>
              <Text color="gray" dimColor>Sending to {agent.name}</Text>
            </Box>
          ) : conversation.length === 0 ? (
            // Empty state
            <Box flexDirection="column" paddingX={1} paddingY={1}>
              <Text color={agent.colour} dimColor bold>{agent.emoji} {agent.name} ready</Text>
              <Text> </Text>
              <Text color="gray" dimColor>Type a prompt below and press Enter</Text>
              <Text color="gray" dimColor>Use Tab / Shift+Tab to switch agents</Text>
              <Text> </Text>
              <Text color="gray" dimColor>Commands: /msg  /reply  /clear  /status</Text>
            </Box>
          ) : (
            // Newest-last scroll: always shows most recent content
            visibleEntries.map((msg, i) => (
              <ConvLine key={`${msg.role}-${i}`} msg={msg} isActive={true} innerW={innerW} />
            ))
          )
        ) : (
          // Inactive: compact flat lines
          flatLines.length === 0 ? (
            <Text color="gray" dimColor paddingX={1}> idle</Text>
          ) : (
            flatLines.slice(-MAX_LINES_INACTIVE).map((line, i) => (
              <Text
                key={i}
                color={
                  line.type === 'user'   ? 'cyan'   :
                  line.type === 'notif'  ? 'yellow' :
                  line.type === 'system' ? 'green'  :
                  line.type === 'cursor' ? 'cyan'   : 'gray'
                }
                dimColor={line.type === 'assistant'}
                wrap="truncate"
              >
                {line.text || ' '}
              </Text>
            ))
          )
        )}
      </Box>

      {/* -- Input box (active pane only) -- */}
      {isActive && (
        <>
          <Box flexShrink={0}>
            <Text color={agent.colour} dimColor>{'-'.repeat(innerW)}</Text>
          </Box>
          <Box paddingX={1} flexShrink={0}>
            <Text color={agent.colour} bold>[T{terminalIndex}] &gt; </Text>
            {voiceStatus === 'recording' ? (
              <Text color="red" bold>🎤 listening... (Space to stop)</Text>
            ) : voiceStatus === 'transcribing' ? (
              <Text color="magenta">⌨  transcribing...</Text>
            ) : isProcessing ? (
              <Text color="yellow">● thinking...</Text>
            ) : (
              <TextInput
                value={inputValue || ''}
                onChange={onInputChange || (() => {})}
                onSubmit={onSubmit || (() => {})}
                placeholder="type a prompt and press Enter"
                placeholderTextColor="gray"
              />
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
