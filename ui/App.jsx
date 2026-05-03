/**
 * TerminalForge -- Root App Component
 * Full-screen Ink TUI. Renders 5 agent panes side by side + bus monitor panel.
 * All agents are connected through the existing message bus and agent router.
 *
 * Layout:
 *   +-------------------------------------------------------------+
 *   |  STATUS BAR (active agent . mode . mini status . hints)     |
 *   +------+------------------------------+------+------+------+--+
 *   | T1   |       T2 (ACTIVE)            |  T3  |  T4  |  T5  |📡|
 *   | idle | ==========================   | idle | done | idle |  |
 *   |      | streaming output...            |      |      |      |  |
 *   |      | [T2] > _                     |      |      |      |  |
 *   +------+------------------------------+------+------+------+--+
 *
 * Keys:
 *   Tab         -> next agent (T1->T2->T3->T4->T5->T1)
 *   Shift+Tab   -> previous agent (T1->T5->T4->T3->T2->T1)
 *   Enter       -> submit prompt to active agent
 *   Ctrl+C      -> quit
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, useInput, useStdout, useStdin } from 'ink';

import { routePrompt, clearHistory, activeProvider, activeModel, getAgentProviderBadge } from '../core/agent-router.js';
import { subscribe, subscribeAll, unsubscribe, publish, readLog, AGENT_NAMES } from '../core/message-bus.js';
import { readState, setTerminalStatus, switchTerminal, writeState, readVoiceInput, consumeVoiceInput, readVoiceState, writeVoiceState } from '../core/state.js';
import { getAgentIdByTerminal } from '../core/context-manager.js';

import StatusBar      from './StatusBar.jsx';
import AgentPane      from './AgentPane.jsx';
import BusMonitorPanel from './BusMonitorPanel.jsx';

const TOTAL = 5;

// -- Initial empty conversation state -----------------------------------------
function emptyConversations() {
  return { 1: [], 2: [], 3: [], 4: [], 5: [] };
}

// -- App -----------------------------------------------------------------------
export default function App() {
  const { stdout } = useStdout();
  const { isRawModeSupported } = useStdin();

  // -- Shared state (synced with state.json) ----------------------------------
  const [activeTerminal,   setActiveTerminal]   = useState(1);
  const [mode,             setMode]             = useState('manual');
  const [terminalStatus,   setTerminalStatusState] = useState(
    { '1':'idle', '2':'idle', '3':'idle', '4':'idle', '5':'idle' }
  );

  // -- Per-agent conversation buffers ----------------------------------------
  const [conversations, setConversations] = useState(emptyConversations);

  // -- Input state (only for active pane) -----------------------------------
  const [inputValue,   setInputValue]   = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // -- Bus monitor -----------------------------------------------------------
  const [busMessages, setBusMessages] = useState([]);

  // -- Voice status (reflects Python pipeline state) -------------------------
  const [voiceStatus, setVoiceStatus] = useState('idle'); // 'idle'|'listening'|'recording'|'transcribing'
  const [voiceMode,   setVoiceMode]   = useState('');     // 'push-to-talk'|'auto-vad'|'wake-word'|''

  // -- Track last consumed voice input to avoid double-submit ----------------
  const lastVoiceTimestamp = useRef(null);

  // -- Stable ref to handleSubmit so voice effect never has a stale closure --
  const handleSubmitRef = useRef(null);

  // -- Stable refs for use inside callbacks / intervals ---------------------
  const activeRef      = useRef(1);
  const processingRef  = useRef(false);
  const subHandlers    = useRef({});   // agentId -> handler, for cleanup

  useEffect(() => { activeRef.current     = activeTerminal; }, [activeTerminal]);
  useEffect(() => { processingRef.current = isProcessing;   }, [isProcessing]);

  // -- Poll state.json every second for bridge server vol-button changes -----
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const s = await readState();
        if (!mounted) return;
        setActiveTerminal(s.activeTerminal || 1);
        setMode(s.mode || 'manual');
        setTerminalStatusState(s.terminalStatus || {});
      } catch { /* ignore -- state file may not exist yet */ }
    };
    poll();
    const iv = setInterval(poll, 1000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  // -- Poll voice_input.json every 500ms (faster than state poll for snappy voice UX)
  useEffect(() => {
    let mounted = true;
    const pollVoice = async () => {
      try {
        // Poll voice pipeline status for indicator
        const vs = await readVoiceState();
        if (mounted) {
          setVoiceStatus(vs.status || 'idle');
          if (vs.mode) setVoiceMode(vs.mode);  // track mode for push-to-talk hint
        }

        // Check for new transcription to submit
        const vi = await readVoiceInput();
        if (!mounted || !vi) return;
        if (vi.consumed) return;
        if (lastVoiceTimestamp.current === vi.timestamp) return;

        // New unconsumed voice input — mark consumed first to prevent double-submit
        lastVoiceTimestamp.current = vi.timestamp;
        await consumeVoiceInput();

        if (vi.text?.trim() && !processingRef.current) {
          // Flash transcribed text in input box so user can see what was heard
          setInputValue(vi.text.trim());
          // Short delay so user can read it, then submit
          await new Promise(r => setTimeout(r, 900));
          if (mounted && !processingRef.current) {
            handleSubmitRef.current?.(vi.text.trim());
          }
        }
      } catch { /* non-fatal — voice pipeline may not be running */ }
    };
    const iv = setInterval(pollVoice, 150); // 150ms — was 500ms, reduces perceived latency
    return () => { mounted = false; clearInterval(iv); };
  }, []); // no deps — uses refs only, never stale

  // -- Load historical bus messages from messages.log on mount --------------
  useEffect(() => {
    readLog().then(msgs => {
      if (msgs.length) setBusMessages(msgs.slice(-50));
    }).catch(() => {});
  }, []);

  // -- Subscribe to all live bus messages (bus monitor panel) ----------------
  useEffect(() => {
    const handler = (envelope) => {
      setBusMessages(prev => [...prev.slice(-99), envelope]);
    };
    subscribeAll(handler);
    return () => {
      // subscribeAll doesn't support unsubscribe by design -- that's fine
    };
  }, []);

  // -- Subscribe each agent to its targeted incoming messages ----------------
  useEffect(() => {
    for (let t = 1; t <= TOTAL; t++) {
      const agentId    = getAgentIdByTerminal(t);
      const termIndex  = t;

      const handler = (envelope) => {
        setConversations(prev => ({
          ...prev,
          [termIndex]: [
            ...prev[termIndex],
            {
              role:      'notification',
              from:      envelope.from,
              type:      envelope.type,
              text:      envelope.payload,
              taskId:    envelope.taskId,
              timestamp: envelope.timestamp,
            },
          ],
        }));
      };

      subscribe(agentId, handler);
      subHandlers.current[agentId] = handler;
    }

    return () => {
      for (let t = 1; t <= TOTAL; t++) {
        const agentId = getAgentIdByTerminal(t);
        if (subHandlers.current[agentId]) {
          unsubscribe(agentId, subHandlers.current[agentId]);
        }
      }
    };
  }, []);

  // -- Navigate to a specific terminal index ---------------------------------
  const goToTerminal = useCallback(async (newIndex) => {
    if (processingRef.current) return;
    const clamped = ((newIndex - 1 + TOTAL) % TOTAL) + 1;
    setActiveTerminal(clamped);
    setInputValue('');
    try {
      // Directly write state rather than using direction-based switchTerminal
      const current = await readState();
      await writeState({ ...current, activeTerminal: clamped, lastSwitch: new Date().toISOString() });
    } catch { /* non-fatal */ }
  }, []);

  // -- Push-to-talk toggle: Space bar in the TUI --------------------------------
  // This replaces the separate hotkey-fallback.js window — no extra terminal needed.
  const toggleRecording = useCallback(async () => {
    try {
      const vs = await readVoiceState();
      if (vs.status === 'recording') {
        // Stop recording → pipeline picks up the audio
        await writeVoiceState({ status: 'idle', mode: vs.mode || 'push-to-talk', recording: false });
        setVoiceStatus('idle');
      } else if (vs.status === 'idle' && (vs.mode === 'push-to-talk' || vs.mode === '')) {
        // Start recording
        await writeVoiceState({ status: 'recording', mode: 'push-to-talk', recording: true });
        setVoiceStatus('recording');
      }
      // In auto-vad / wake-word mode, Space does nothing (pipeline controls state)
    } catch { /* non-fatal */ }
  }, []);

  // -- Keyboard navigation (only when TTY raw mode is available) ------------
  useInput((input, key) => {
    if (key.tab && !key.shift) {
      if (processingRef.current) return;
      goToTerminal(activeRef.current + 1);
      return;
    }
    if (key.tab && key.shift) {
      if (processingRef.current) return;
      goToTerminal(activeRef.current - 1);
      return;
    }
    // Space = push-to-talk toggle (when not typing — only fires if input is empty/whitespace)
    // Use .trim() so ink-text-input's space character accumulation doesn't block repeated presses
    if (input === ' ' && !inputValue.trim()) {
      setInputValue('');  // clear any space chars ink-text-input may have appended
      toggleRecording();
      return;
    }
  }, { isActive: Boolean(isRawModeSupported) });

  // -- Prompt submit handler -------------------------------------------------
  const handleSubmit = useCallback(async (value) => {
    if (!value?.trim() || processingRef.current) return;
    const terminal = activeRef.current;
    const trimmed  = value.trim();
    setInputValue('');

    // -- /clear ------------------------------------------------------------
    if (trimmed === '/clear') {
      clearHistory(terminal);
      setConversations(prev => ({ ...prev, [terminal]: [] }));
      return;
    }

    // -- /status -----------------------------------------------------------
    if (trimmed === '/status') {
      try {
        const s    = await readState();
        const stat = s.terminalStatus?.[String(terminal)] || 'idle';
        const act  = s.activeTerminal === terminal ? '[ACTIVE]' : '[background]';
        setConversations(prev => ({
          ...prev,
          [terminal]: [
            ...prev[terminal],
            { role: 'system', text: `T${terminal} . status: ${stat.toUpperCase()} ${act} . mode: ${s.mode}` },
          ],
        }));
      } catch (err) {
        setConversations(prev => ({
          ...prev,
          [terminal]: [...prev[terminal], { role: 'system', text: `x Could not read state: ${err.message}` }],
        }));
      }
      return;
    }

    // -- /msg <agentId> <type> <text> --------------------------------------
    if (trimmed.startsWith('/msg ')) {
      const parts = trimmed.slice(5).split(' ');
      const toId  = parts[0];
      const type  = parts[1];
      const text  = parts.slice(2).join(' ');
      if (!toId || !type || !text) {
        setConversations(prev => ({
          ...prev,
          [terminal]: [...prev[terminal], { role: 'system', text: 'x Usage: /msg <agentId> <type> <message>' }],
        }));
        return;
      }
      try {
        const fromId   = getAgentIdByTerminal(terminal);
        const envelope = await publish({ from: fromId, to: toId, type, payload: text });
        const toInfo   = AGENT_NAMES[toId];
        setConversations(prev => ({
          ...prev,
          [terminal]: [
            ...prev[terminal],
            { role: 'system', text: `v ${type.toUpperCase()} sent -> ${toInfo?.emoji || ''} ${toInfo?.label || toId}  [id: ${envelope.id}]` },
          ],
        }));
      } catch (err) {
        setConversations(prev => ({
          ...prev,
          [terminal]: [...prev[terminal], { role: 'system', text: `x ${err.message}` }],
        }));
      }
      return;
    }

    // -- /reply <text> -----------------------------------------------------
    if (trimmed.startsWith('/reply ')) {
      const text = trimmed.slice(7).trim();
      // Find the last notification in this agent's conversation
      const conv = conversations[terminal] || [];
      const last = [...conv].reverse().find(m => m.role === 'notification');
      if (!last) {
        setConversations(prev => ({
          ...prev,
          [terminal]: [...prev[terminal], { role: 'system', text: 'x No incoming message to reply to.' }],
        }));
        return;
      }
      try {
        const fromId   = getAgentIdByTerminal(terminal);
        const envelope = await publish({ from: fromId, to: last.from, type: 'review', payload: text, taskId: last.taskId });
        const toInfo   = AGENT_NAMES[last.from];
        setConversations(prev => ({
          ...prev,
          [terminal]: [
            ...prev[terminal],
            { role: 'system', text: `v Reply sent -> ${toInfo?.emoji || ''} ${toInfo?.label || last.from}` },
          ],
        }));
      } catch (err) {
        setConversations(prev => ({
          ...prev,
          [terminal]: [...prev[terminal], { role: 'system', text: `x ${err.message}` }],
        }));
      }
      return;
    }

    // -- Normal prompt -> Claude API ----------------------------------------
    // Add user message + empty streaming assistant placeholder
    setConversations(prev => ({
      ...prev,
      [terminal]: [
        ...prev[terminal],
        { role: 'user',      text: trimmed },
        { role: 'assistant', text: '', streaming: true },
      ],
    }));

    setIsProcessing(true);
    await setTerminalStatus(terminal, 'working').catch(() => {});
    setTerminalStatusState(prev => ({ ...prev, [String(terminal)]: 'working' }));

    try {
      await routePrompt(trimmed, {
        terminalIndex: terminal,
        onToken: (chunk) => {
          setConversations(prev => {
            const conv = [...prev[terminal]];
            const last = conv[conv.length - 1];
            if (last?.role === 'assistant') {
              conv[conv.length - 1] = { ...last, text: last.text + chunk };
            }
            return { ...prev, [terminal]: conv };
          });
        },
      });

      // Mark streaming complete
      setConversations(prev => {
        const conv = [...prev[terminal]];
        const last = conv[conv.length - 1];
        if (last?.role === 'assistant') {
          conv[conv.length - 1] = { ...last, streaming: false };
        }
        return { ...prev, [terminal]: conv };
      });

      await setTerminalStatus(terminal, 'done').catch(() => {});
      setTerminalStatusState(prev => ({ ...prev, [String(terminal)]: 'done' }));

    } catch (err) {
      // Replace streaming placeholder with error
      setConversations(prev => {
        const conv = [...prev[terminal]];
        const last = conv[conv.length - 1];
        if (last?.role === 'assistant' && last.streaming) {
          conv[conv.length - 1] = { role: 'system', text: `x ${err.message}` };
        } else {
          conv.push({ role: 'system', text: `x ${err.message}` });
        }
        return { ...prev, [terminal]: conv };
      });

      await setTerminalStatus(terminal, 'failed').catch(() => {});
      setTerminalStatusState(prev => ({ ...prev, [String(terminal)]: 'failed' }));
    } finally {
      setIsProcessing(false);
    }
  }, [conversations]);

  // Keep ref in sync so the voice polling effect always calls the latest version
  handleSubmitRef.current = handleSubmit;

  // -- Dimensions ------------------------------------------------------------
  const totalW   = stdout?.columns || 220;
  const totalH   = stdout?.rows    || 50;
  const STATUS_H = 1;
  const paneH    = totalH - STATUS_H;

  // Layout: active pane always gets the most space
  // Bus monitor: 18 cols minimum, capped at 22 cols so agents get max room
  const busW       = Math.min(22, Math.max(18, Math.floor(totalW * 0.14)));
  const agentAreaW = totalW - busW;

  // Active pane = 44% of agent area; 4 inactive panes share the rest equally
  // On very narrow terminals (< 120) active gets 50% so it's still readable
  const activeRatio  = totalW < 120 ? 0.50 : 0.44;
  const activePaneW  = Math.floor(agentAreaW * activeRatio);
  const inactiveW    = Math.floor((agentAreaW - activePaneW) / (TOTAL - 1));

  return (
    <Box flexDirection="column" width={totalW} height={totalH}>

      {/* -- Status bar -- */}
      <StatusBar
        activeTerminal={activeTerminal}
        mode={mode}
        terminalStatus={terminalStatus}
        isProcessing={isProcessing}
        busMessageCount={busMessages.length}
        voiceStatus={voiceStatus}
        voiceMode={voiceMode}
        providerBadge={getAgentProviderBadge(activeTerminal)}
        ollamaModel={activeModel}
        width={totalW}
      />

      {/* -- Main pane row -- */}
      <Box flexDirection="row" height={paneH} flexShrink={0}>

        {[1, 2, 3, 4, 5].map(t => {
          const isActive = t === activeTerminal;
          return (
            <AgentPane
              key={t}
              terminalIndex={t}
              isActive={isActive}
              status={terminalStatus[String(t)] || 'idle'}
              conversation={conversations[t] || []}
              inputValue={isActive ? inputValue : ''}
              onInputChange={isActive ? setInputValue : undefined}
              onSubmit={isActive ? handleSubmit : undefined}
              isProcessing={isActive && isProcessing}
              voiceStatus={isActive ? voiceStatus : 'idle'}
              provider={getAgentProviderBadge(t)}
              width={isActive ? activePaneW : inactiveW}
              height={paneH}
            />
          );
        })}

        {/* -- Bus monitor -- */}
        <BusMonitorPanel
          messages={busMessages}
          width={busW}
          height={paneH}
        />

      </Box>
    </Box>
  );
}
