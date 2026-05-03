/**
 * TerminalForge -- Status Bar
 * Top bar showing: active agent, mode, processing state, message count, key hints.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { AGENT_INFO, getStatusStyle } from './TerminalColorManager.jsx';

// Voice status → display config
const VOICE_DISPLAY = {
  idle:         null,
  listening:    { icon: '👂', label: 'Listening',    color: 'cyan'    },
  recording:    { icon: '🎤', label: 'Recording',    color: 'red'     },
  transcribing: { icon: '⌨ ', label: 'Transcribing', color: 'magenta' },
};

// Voice mode idle hints (shown when pipeline is connected but idle)
const VOICE_IDLE_HINT = {
  'push-to-talk': { icon: '🎙', label: 'Space=record', color: 'gray' },
  'auto-vad':     { icon: '👂', label: 'Listening',    color: 'cyan' },
  'wake-word':    { icon: '👂', label: '"Hey Forge"',  color: 'cyan' },
};

export default function StatusBar({
  activeTerminal,
  mode,
  terminalStatus,
  isProcessing,
  busMessageCount,
  voiceStatus,
  voiceMode,
  providerBadge,
  ollamaModel,
  width,
}) {
  const agent   = AGENT_INFO[activeTerminal] || {};
  const modeCol = mode === 'auto' ? 'yellow' : 'gray';

  // Active voice state overrides idle hint
  const voice   = VOICE_DISPLAY[voiceStatus] || (voiceMode ? VOICE_IDLE_HINT[voiceMode] : null);
  // providerBadge = { label, short, color } from getAgentProviderBadge()
  const pBadge  = providerBadge || { label: 'Claude', color: 'magenta' };
  const modelLabel = pBadge.label === 'Ollama' && ollamaModel ? ollamaModel : '';

  return (
    <Box width={width} paddingX={1} backgroundColor="black" flexShrink={0}>
      {/* Brand */}
      <Text bold color="cyan">TerminalForge</Text>
      <Text color="gray">  .  </Text>

      {/* Mode */}
      <Text bold color={modeCol}>{(mode || 'manual').toUpperCase()}</Text>
      <Text color="gray">  .  </Text>

      {/* LLM provider badge */}
      <Text bold color={pBadge.color}>{pBadge.label}</Text>
      {modelLabel ? <Text color="gray"> ({modelLabel})</Text> : null}
      <Text color="gray">  .  </Text>

      {/* Active agent */}
      <Text color="gray">Active: </Text>
      <Text bold color={agent.colour || 'white'}>
        {agent.emoji} T{activeTerminal} {agent.name}
      </Text>

      {/* Processing spinner */}
      {isProcessing && (
        <>
          <Text color="gray">  .  </Text>
          <Text color="yellow">* processing...</Text>
        </>
      )}

      {/* Voice status indicator — only shown when pipeline is active */}
      {voice && (
        <>
          <Text color="gray">  .  </Text>
          <Text color={voice.color} bold>{voice.icon} {voice.label}</Text>
        </>
      )}

      {/* Mini status for all 5 terminals */}
      <Text color="gray">  .  </Text>
      {[1, 2, 3, 4, 5].map(t => {
        const s   = terminalStatus?.[String(t)] || 'idle';
        const st  = getStatusStyle(s);
        const a   = AGENT_INFO[t];
        return (
          <Text key={t} color={st.bgColor || 'gray'} dimColor={s === 'idle'}>
            {a?.emoji}{st.dot}
          </Text>
        );
      })}

      {/* Msg count */}
      <Text color="gray">  .  msgs:{busMessageCount}</Text>

      {/* Key hints */}
      <Text color="gray" dimColor>  .  Tab=next  Shift+Tab=prev  Ctrl+C=quit</Text>
    </Box>
  );
}
