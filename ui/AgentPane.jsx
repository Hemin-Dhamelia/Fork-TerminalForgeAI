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

// -- Render a single conversation entry ---------------------------------------

function ConvLine({ msg, isActive, innerW }) {
  if (msg.role === 'user') {
    return (
      <Text color="cyan" bold wrap={isActive ? 'wrap' : 'truncate'}>
        > {msg.text}
      </Text>
    );
  }

  if (msg.role === 'assistant') {
    // Split multi-line responses; each rendered as its own Text
    const lines = msg.text.split('\n');
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
        {msg.streaming && (
          <Text color="cyan">|</Text>
        )}
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
    return (
      <Text
        color={msg.text.startsWith('v') ? 'green' : 'red'}
        wrap="truncate"
      >
        {msg.text}
      </Text>
    );
  }

  return null;
}

// -- Main AgentPane component --------------------------------------------------

export default function AgentPane({
  terminalIndex,
  isActive,
  status,
  conversation,
  inputValue,
  onInputChange,
  onSubmit,
  isProcessing,
  width,
  height,
}) {
  const agent       = getAgentInfo(terminalIndex);
  const statusStyle = getStatusStyle(status);
  const innerW      = Math.max(4, width - 2); // inside border

  // Layout heights
  const HEADER_H = 2;   // badge + divider
  const INPUT_H  = isActive ? 3 : 0;  // input box + divider
  const CONTENT_H = Math.max(1, height - HEADER_H - INPUT_H - 2); // -2 for border

  // How many recent conversation entries to show
  // Active pane: show all (scrolled to bottom via slicing)
  // Inactive pane: show last 6 lines worth
  const MAX_LINES_INACTIVE = 8;

  // Flatten conversation into display lines for inactive panes
  const flatLines = [];
  for (const msg of conversation) {
    if (msg.role === 'user') {
      flatLines.push({ type: 'user', text: `> ${msg.text}` });
    } else if (msg.role === 'assistant') {
      msg.text.split('\n').forEach(l => flatLines.push({ type: 'assistant', text: l || ' ' }));
      if (msg.streaming) flatLines.push({ type: 'cursor', text: '|' });
    } else if (msg.role === 'notification') {
      flatLines.push({ type: 'notif', text: `${MSG_TYPE_ICONS[msg.type] || '📨'} ${msg.from}: ${msg.text.slice(0, 30)}...` });
    } else if (msg.role === 'system') {
      flatLines.push({ type: 'system', text: msg.text });
    }
  }

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
          {agent.emoji} T{terminalIndex} {isActive ? agent.name : `T${terminalIndex}`}
        </Text>
        <Text color={statusStyle.bgColor ? statusStyle.color : 'gray'} dimColor={status === 'idle'}>
          {' '}{statusStyle.dot}{isActive ? ` ${statusStyle.label}` : ''}
        </Text>
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
          // Active: render full conversation entries (last CONTENT_H messages)
          conversation.slice(-CONTENT_H).map((msg, i) => (
            <ConvLine key={i} msg={msg} isActive={true} innerW={innerW} />
          ))
        ) : (
          // Inactive: compact flat lines
          flatLines.slice(-MAX_LINES_INACTIVE).map((line, i) => (
            <Text
              key={i}
              color={
                line.type === 'user'    ? 'cyan'   :
                line.type === 'notif'   ? 'yellow' :
                line.type === 'system'  ? 'green'  :
                line.type === 'cursor'  ? 'cyan'   : 'gray'
              }
              dimColor={line.type === 'assistant'}
              wrap="truncate"
            >
              {line.text || ' '}
            </Text>
          ))
        )}
      </Box>

      {/* -- Input box (active pane only) -- */}
      {isActive && (
        <>
          <Box flexShrink={0}>
            <Text color={agent.colour} dimColor>{'-'.repeat(innerW)}</Text>
          </Box>
          <Box paddingX={1} flexShrink={0}>
            <Text color={agent.colour} bold>[T{terminalIndex}] > </Text>
            {isProcessing ? (
              <Text color="yellow" dimColor>processing...</Text>
            ) : (
              <TextInput
                value={inputValue || ''}
                onChange={onInputChange || (() => {})}
                onSubmit={onSubmit || (() => {})}
                placeholder="/msg  /reply  /clear  /status  or type a prompt"
                placeholderTextColor="gray"
              />
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
