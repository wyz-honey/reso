// @ts-nocheck — large workbench surface; tighten types incrementally
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import {
  apiAgentChatTurnStream,
  apiAppendCliWorkbenchChatMessage,
  apiCreateSession,
  apiCursorRun,
  apiCursorStop,
  apiDeleteSession,
  apiEnsureSessionExternalThread,
  apiSaveParagraph,
  fetchChatThread,
  fetchCliWorkbenchChat,
  fetchCursorRunStatus,
  fetchCursorSessionPaths,
  fetchSessionExternalThreads,
} from '../api';
import { cliEnvForApi, normalizeCliEnvRecord } from '../cliEnv';
import AssistantMarkdown from '../components/AssistantMarkdown';
import {
  getAgentThreadIdForSession,
  removeAgentThreadIdForSession,
  removeAllAgentThreadIdsForMode,
  removeThreadId,
  setAgentThreadIdForSession,
} from '../chatThreadStorage';
import {
  getResolvedResoChatApiKey,
  getResolvedResoChatApiModelId,
  getResolvedSpeechApiKey,
  getResolvedSpeechAsrApiModelId,
} from '../stores/modelProvidersStore';
import {
  AGENT_VOICE_SILENCE_SEC,
  END_MODES,
  getAsrLanguageHintsArray,
  getVoiceSettings,
  matchesEndPhrase,
  dedupeTranscriptJoin,
  normalizePartialTranscriptText,
  normalizeTranscriptText,
  stripMatchedPhrase,
} from '../stores/voiceSettingsStore';
import {
  OUTPUT_VOICE_DEFAULTS,
  formatOutputVoiceControlHint,
} from '../outputVoiceControl';
import VoiceWaveVisualizer from '../components/VoiceWaveVisualizer';
import {
  buildAllCustomAngleSlots,
  mergeAngleSlotsWithDefaults,
} from '../cliSubstitute';
import {
  addCustomHttpMode,
  addCustomXiaoaiMode,
  DEFAULT_CLI_TEMPLATE,
  getAllModes,
  removeCustomMode,
  saveActiveModeId,
  updateCliModeFields,
  updateHttpModeFields,
} from '../workModes';
import {
  CURSOR_EXTERNAL_THREAD_PROVIDER,
  QODER_EXTERNAL_THREAD_PROVIDER,
} from '../constants/builtins';
import {
  CURSOR_CLI_PANEL_STATUS_PREPARING,
  CURSOR_CLI_PANEL_STATUS_RUNNING,
  CURSOR_CLI_PANEL_STATUS_WAIT_OUTPUT,
} from '../constants/cursorCliUi';
import { CURSOR_RUN_STATUS_POLL_MS } from '../constants/cursorRun';
import {
  CURSOR_CLI_DEFAULT_TEMPLATE,
  saveBuiltinOutputOverride,
  updateCustomOutput,
} from '../outputCatalog';
import { getResolvedExternalThreadProvider } from '../resolvedExternalThread';
import {
  cursorCliFillHint,
  cursorCliReady,
  cursorCliReadyIgnoringProvisioningDeps,
  cursorTriadCustomValues,
  cursorTriadLabelsInTemplate,
  deriveCursorCliWorkspace,
} from '../cursorTriad';
import CursorCliStructuredView from '../components/CursorCliStructuredView';
import CursorWorkbenchDbAssistantBody from './home/CursorWorkbenchDbAssistantBody';
import {
  looksLikeCursorStreamJson,
  parseCliOutputForDelivery,
  sanitizeCursorStderrForDisplay,
} from '../cliOutputFormats/index';
import '../App.css';
import WorkModeSelect from '../components/WorkModeSelect';
import pcmWorkletUrl from 'virtual:pcm-worklet-url';
import { wsUrl, cursorTailWsUrl } from './home/workbenchUrls';
import { micErrorMessage, acquireMicStream } from './home/workbenchMic';
import {
  SESSION_UUID_RE,
  agentChatStateKey,
  formatWorkbenchSessionLabel,
} from './home/workbenchSession';
import {
  computeWorkbenchCliCommand,
  consumeCursorOmitResumeAndBuildCommand,
} from './home/workbenchCliCommand';
import {
  IconPlay,
  IconPause,
  IconCliParams,
  IconMic,
  IconMicMuted,
  IconPlus,
  IconClock,
  IconSidebarToggle,
  IconContext,
} from './home/HomeWorkbenchIcons';
import HomeWorkbenchAddModeModal from './home/HomeWorkbenchAddModeModal';
import HomeWorkbenchModals from './home/HomeWorkbenchModals';
import { useHomeWorkbenchBootstrap } from './home/useHomeWorkbenchBootstrap';
import { useHomeWorkbenchEditor } from './home/useHomeWorkbenchEditor';
import { useHomeWorkbenchModesStore } from '../stores/homeWorkbenchModesStore';
import { useHomeWorkbenchUiStore } from '../stores/homeWorkbenchUiStore';
import { useWorkbenchNavigationGuardStore } from '../stores/workbenchNavigationGuardStore';
import { useHomeWorkbenchRuntimeStore } from '../stores/homeWorkbenchRuntimeStore';

export default function HomePage() {
  const modes = useHomeWorkbenchModesStore((s) => s.modes);
  const setModes = useHomeWorkbenchModesStore((s) => s.setModes);
  const activeModeId = useHomeWorkbenchModesStore((s) => s.activeModeId);
  const setActiveModeId = useHomeWorkbenchModesStore((s) => s.setActiveModeId);

  const setCliParamsModalOpen = useHomeWorkbenchUiStore((s) => s.setCliParamsModalOpen);
  const setQuickInputsModalOpen = useHomeWorkbenchUiStore((s) => s.setQuickInputsModalOpen);
  const openAddCustomModeModal = useHomeWorkbenchUiStore((s) => s.openAddCustomModeModal);

  const {
    editorContent,
    setEditorContent,
    editorContentRef,
    editorTextareaRef,
    editorSelRef,
    captureEditorSelection,
    onEditorBlur,
    insertQuickContent,
  } = useHomeWorkbenchEditor();

  const {
    phase,
    setPhase,
    status,
    setStatus,
    partialText,
    setPartialText,
    copyBusy,
    setCopyBusy,
    chatByModeId,
    setChatByModeId,
    agentSendingByKey,
    setAgentSendingByKey,
    httpSendingByKey,
    setHttpSendingByKey,
    asrSessionId,
    setAsrSessionId,
    cursorSessionFilePaths,
    setCursorSessionFilePaths,
    cursorTailInfo,
    setCursorTailInfo,
    cursorTailError,
    setCursorTailError,
    cursorPendingUserPrompt,
    setCursorPendingUserPrompt,
    externalThreadsByProvider,
    setExternalThreadsByProvider,
    cursorEnsureStatus,
    setCursorEnsureStatus,
    cursorEnsureErrorMsg,
    setCursorEnsureErrorMsg,
    cursorEnsureRetryNonce,
    setCursorEnsureRetryNonce,
    cursorStreamLoading,
    setCursorStreamLoading,
    cursorWorkbenchBusySessionId,
    setCursorWorkbenchBusySessionId,
    cursorRunActiveSessionId,
    setCursorRunActiveSessionId,
    cursorAwaitingCliPaste,
    setCursorAwaitingCliPaste,
    cursorQuietPrepare,
    setCursorQuietPrepare,
    workbenchSplitTabIds,
    setWorkbenchSplitTabIds,
    workbenchSessionAttachSelectKey,
    setWorkbenchSessionAttachSelectKey,
    cursorWorkbenchDbMessages,
    setCursorWorkbenchDbMessages,
  } = useHomeWorkbenchRuntimeStore(
    useShallow((s) => ({
      phase: s.phase,
      setPhase: s.setPhase,
      status: s.status,
      setStatus: s.setStatus,
      partialText: s.partialText,
      setPartialText: s.setPartialText,
      copyBusy: s.copyBusy,
      setCopyBusy: s.setCopyBusy,
      chatByModeId: s.chatByModeId,
      setChatByModeId: s.setChatByModeId,
      agentSendingByKey: s.agentSendingByKey,
      setAgentSendingByKey: s.setAgentSendingByKey,
      httpSendingByKey: s.httpSendingByKey,
      setHttpSendingByKey: s.setHttpSendingByKey,
      asrSessionId: s.asrSessionId,
      setAsrSessionId: s.setAsrSessionId,
      cursorSessionFilePaths: s.cursorSessionFilePaths,
      setCursorSessionFilePaths: s.setCursorSessionFilePaths,
      cursorTailInfo: s.cursorTailInfo,
      setCursorTailInfo: s.setCursorTailInfo,
      cursorTailError: s.cursorTailError,
      setCursorTailError: s.setCursorTailError,
      cursorPendingUserPrompt: s.cursorPendingUserPrompt,
      setCursorPendingUserPrompt: s.setCursorPendingUserPrompt,
      externalThreadsByProvider: s.externalThreadsByProvider,
      setExternalThreadsByProvider: s.setExternalThreadsByProvider,
      cursorEnsureStatus: s.cursorEnsureStatus,
      setCursorEnsureStatus: s.setCursorEnsureStatus,
      cursorEnsureErrorMsg: s.cursorEnsureErrorMsg,
      setCursorEnsureErrorMsg: s.setCursorEnsureErrorMsg,
      cursorEnsureRetryNonce: s.cursorEnsureRetryNonce,
      setCursorEnsureRetryNonce: s.setCursorEnsureRetryNonce,
      cursorStreamLoading: s.cursorStreamLoading,
      setCursorStreamLoading: s.setCursorStreamLoading,
      cursorWorkbenchBusySessionId: s.cursorWorkbenchBusySessionId,
      setCursorWorkbenchBusySessionId: s.setCursorWorkbenchBusySessionId,
      cursorRunActiveSessionId: s.cursorRunActiveSessionId,
      setCursorRunActiveSessionId: s.setCursorRunActiveSessionId,
      cursorAwaitingCliPaste: s.cursorAwaitingCliPaste,
      setCursorAwaitingCliPaste: s.setCursorAwaitingCliPaste,
      cursorQuietPrepare: s.cursorQuietPrepare,
      setCursorQuietPrepare: s.setCursorQuietPrepare,
      workbenchSplitTabIds: s.workbenchSplitTabIds,
      setWorkbenchSplitTabIds: s.setWorkbenchSplitTabIds,
      workbenchSessionAttachSelectKey: s.workbenchSessionAttachSelectKey,
      setWorkbenchSessionAttachSelectKey: s.setWorkbenchSessionAttachSelectKey,
      cursorWorkbenchDbMessages: s.cursorWorkbenchDbMessages,
      setCursorWorkbenchDbMessages: s.setCursorWorkbenchDbMessages,
    }))
  );
  const cursorRunActiveSessionIdRef = useRef(null);

  const wsRef = useRef(null);
  const cursorWsRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);
  const sourceRef = useRef(null);
  const analyserRef = useRef(null);
  const dbSessionIdRef = useRef(null);
  /** 与 cursorSessionFilePaths 对应的 `会话id:cursor|qoder`，切换内置 CLI 目标时需重拉路径 */
  const cursorPathsFetchKeyRef = useRef(null);
  /** 当前/最近一次服务端子进程对应的 CLI 工作台种类（与 run-status / stop 一致） */
  const cursorRunCliKindRef = useRef('cursor');
  const agentMessagesRef = useRef(null);
  const cursorPanelScrollRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const autoSubmitLockRef = useRef(false);
  const partialTextRef = useRef('');
  const phaseRef = useRef('idle');
  const copyBusyRef = useRef(false);
  const agentSendingKeysRef = useRef(new Set());
  const httpSendingKeysRef = useRef(new Set());
  const activeModeIdRef = useRef(activeModeId);
  const runAutoSubmitRef = useRef(null);
  const stopRecognitionRef = useRef(() => {});
  /** 输入静音：关轨道 + 不发 PCM，避免环境声触发识别/自动发送 */
  const [micInputMuted, setMicInputMuted] = useState(false);
  const [inputPaneCollapsed, setInputPaneCollapsed] = useState(false);
  const micInputMutedRef = useRef(false);
  const cursorTailInfoRef = useRef('');
  const cursorTailErrorRef = useRef('');
  const cursorTailPollBaselineRef = useRef({ info: '', error: '' });
  /** 下一次 Cursor CLI 是否省略自动 `--resume`（对应 ensure 刚 create-chat） */
  const cursorOmitResumeNextInvokeRef = useRef(false);
  /** 仅当 (会话, provider) 变化时清空外部线程映射，避免改模板/槽位等导致 threadId 被清空、--resume 丢失 */
  const cursorExternalThreadEnsureKeyRef = useRef('');
  const cliEnvPayloadForEnsureRef = useRef(null);
  const cursorVoiceBlockRef = useRef(false);
  /** 切换 Cursor 会话时缓存各 Tab 的输出区，避免来回切换丢内容 */
  const cursorTabOutputCacheRef = useRef(new Map());
  const cursorTabCachePrevSidRef = useRef(null);
  const cursorPendingPromptRef = useRef(null);
  /** 为 true 时，切换/创建会话的 effect 勿清空 pending/loading（发送流程中） */
  const cursorSendInFlightRef = useRef(false);
  const isCliWorkbenchRef = useRef(false);
  const agentSessionAttachRef = useRef(null);
  const cliSessionAttachRef = useRef(null);
  const asrSessionAttachRef = useRef(null);

  const activeMode = modes.find((m) => m.id === activeModeId) || modes[0];
  const isAsr = activeMode?.kind === 'asr';
  const isAgent = activeMode?.kind === 'agent';
  const isCli = activeMode?.kind === 'cli';
  const isHttp = activeMode?.kind === 'http';
  const isXiaoaiCli = isCli && activeMode?.cliVariant === 'xiaoai';
  const isCursorCli = isCli && activeMode?.cliVariant === 'cursor';
  const isQoderCli = isCli && activeMode?.cliVariant === 'qoder';
  const isCliWorkbench = isCursorCli || isQoderCli;

  useEffect(() => {
    isCliWorkbenchRef.current = isCliWorkbench;
  }, [isCliWorkbench]);

  useLayoutEffect(() => {
    micInputMutedRef.current = micInputMuted;
  }, [micInputMuted]);

  /** 与 ref 同步，供 startRecognition 在 setState 前拿到麦克风流后立即应用 */
  const syncMicTracksFromMuteRef = useCallback(() => {
    const stream = streamRef.current;
    if (!stream?.getAudioTracks) return;
    const enabled = !micInputMutedRef.current;
    for (const t of stream.getAudioTracks()) {
      t.enabled = enabled;
    }
  }, []);

  useEffect(() => {
    syncMicTracksFromMuteRef();
    if (micInputMuted) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, [micInputMuted, phase, syncMicTracksFromMuteRef]);

  useEffect(() => {
    if (phase === 'idle') setMicInputMuted(false);
  }, [phase]);

  const {
    quickInputs,
    serverWorkspaceFallback,
    workspacePickSessions,
    workspacePickLoading,
    workspacePickErr,
    loadWorkspacePickSessions,
    workspacePickOptions,
  } = useHomeWorkbenchBootstrap({ isAsr, isCli, isHttp, isAgent, asrSessionId });

  const loadCursorWorkbenchDbHistory = useCallback(async () => {
    if (!isCliWorkbench) {
      setCursorWorkbenchDbMessages([]);
      return;
    }
    if (!activeMode?.id || !asrSessionId || !SESSION_UUID_RE.test(String(asrSessionId))) {
      setCursorWorkbenchDbMessages([]);
      return;
    }
    try {
      const { messages } = await fetchCliWorkbenchChat(String(asrSessionId), activeMode.id);
      setCursorWorkbenchDbMessages(messages);
    } catch {
      /* 保留已有列表，避免短暂请求失败时多轮历史像被清空 */
    }
  }, [isCliWorkbench, activeMode?.id, asrSessionId]);

  useEffect(() => {
    void loadCursorWorkbenchDbHistory();
  }, [loadCursorWorkbenchDbHistory]);

  const agentMessages = isAgent
    ? chatByModeId[agentChatStateKey(activeMode.id, asrSessionId)] || []
    : [];
  const workbenchActivityKey = useMemo(
    () => agentChatStateKey(activeMode?.id, asrSessionId),
    [activeMode?.id, asrSessionId]
  );
  const agentSendingCurrent = Boolean(agentSendingByKey[workbenchActivityKey]);
  const httpSendingCurrent = Boolean(httpSendingByKey[workbenchActivityKey]);
  const voiceControlHint = formatOutputVoiceControlHint(
    activeMode?.voiceControl ?? OUTPUT_VOICE_DEFAULTS
  );

  const cliEnvPayloadForEnsure = useMemo(
    () => cliEnvForApi(activeMode),
    [activeMode?.id, JSON.stringify(normalizeCliEnvRecord(activeMode?.cliEnv))]
  );
  cliEnvPayloadForEnsureRef.current = cliEnvPayloadForEnsure;
  const isAgentRef = useRef(false);
  useEffect(() => {
    isAgentRef.current = isAgent;
  }, [isAgent]);

  const modeVoiceRef = useRef(OUTPUT_VOICE_DEFAULTS);
  useEffect(() => {
    modeVoiceRef.current = activeMode?.voiceControl ?? OUTPUT_VOICE_DEFAULTS;
  }, [activeMode]);

  const assignAsrSession = useCallback((id) => {
    const sid = String(id ?? '').trim();
    dbSessionIdRef.current = sid || null;
    setAsrSessionId(sid || null);
  }, []);

  const clearAsrSession = () => {
    dbSessionIdRef.current = null;
    setAsrSessionId(null);
  };

  useEffect(() => {
    if (!isCliWorkbench || !asrSessionId || !SESSION_UUID_RE.test(String(asrSessionId))) {
      setCursorSessionFilePaths(null);
      cursorPathsFetchKeyRef.current = null;
      return;
    }
    let cancelled = false;
    const sid = String(asrSessionId);
    const kind = isQoderCli ? 'qoder' : 'cursor';
    const fetchKey = `${sid}:${kind}`;
    fetchCursorSessionPaths(sid, kind)
      .then((d) => {
        if (!cancelled) {
          setCursorSessionFilePaths(d);
          cursorPathsFetchKeyRef.current = fetchKey;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCursorSessionFilePaths(null);
          cursorPathsFetchKeyRef.current = null;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isCliWorkbench, isQoderCli, asrSessionId]);

  useEffect(() => {
    cursorPendingPromptRef.current = cursorPendingUserPrompt;
  }, [cursorPendingUserPrompt]);

  /**
   * 仅随「当前绑定的 DB 会话」切换恢复/缓存侧栏输出。
   * 不可依赖 cursorRunActiveSessionId：子进程结束时该值变 null 会触发本 effect，
   * 若当前 tab 尚无缓存会误走「无缓存」分支并清空 cursorTailInfo，导致流式输出一结束就消失。
   */
  useEffect(() => {
    if (!isCliWorkbench) {
      cursorTabCachePrevSidRef.current = null;
      return;
    }
    const map = cursorTabOutputCacheRef.current;
    const prev = cursorTabCachePrevSidRef.current;
    const next =
      asrSessionId && SESSION_UUID_RE.test(String(asrSessionId))
        ? String(asrSessionId)
        : null;
    if (prev && prev !== next) {
      map.set(prev, {
        tailInfo: cursorTailInfoRef.current,
        tailError: cursorTailErrorRef.current,
        pending: cursorPendingPromptRef.current,
      });
    }
    cursorTabCachePrevSidRef.current = next;
    const runSid = cursorRunActiveSessionIdRef.current;
    if (!next) {
      setCursorTailInfo('');
      setCursorTailError('');
      if (!cursorSendInFlightRef.current) {
        setCursorPendingUserPrompt(null);
        if (!runSid) {
          setCursorStreamLoading(false);
        }
      }
      return;
    }
    const cached = map.get(next);
    if (cached) {
      setCursorTailInfo(cached.tailInfo);
      setCursorTailError(cached.tailError);
      setCursorPendingUserPrompt(cached.pending ?? null);
      if (runSid && String(runSid) === next) {
        setCursorStreamLoading(true);
      }
    } else {
      setCursorTailInfo('');
      setCursorTailError('');
      if (!cursorSendInFlightRef.current) {
        setCursorPendingUserPrompt(null);
      }
      if (runSid && String(runSid) === next) {
        setCursorStreamLoading(true);
      }
    }
    if (!cursorSendInFlightRef.current) {
      if (!runSid || String(runSid) !== next) {
        setCursorStreamLoading(false);
      }
    }
  }, [isCliWorkbench, asrSessionId]);

  useEffect(() => {
    if (!isCliWorkbench && !isAgent) {
      setWorkbenchSplitTabIds([]);
    }
  }, [isCliWorkbench, isAgent]);

  useEffect(() => {
    if (!isCliWorkbench && !isAgent) return;
    const sid =
      asrSessionId && SESSION_UUID_RE.test(String(asrSessionId))
        ? String(asrSessionId)
        : '';
    if (!sid) return;
    setWorkbenchSplitTabIds((prev) => (prev.includes(sid) ? prev : [...prev, sid]));
  }, [isCliWorkbench, isAgent, asrSessionId]);

  useEffect(() => {
    cursorTailInfoRef.current = cursorTailInfo;
    cursorTailErrorRef.current = cursorTailError;
  }, [cursorTailInfo, cursorTailError]);

  useEffect(() => {
    if (!isCliWorkbench || !asrSessionId || !SESSION_UUID_RE.test(String(asrSessionId))) {
      if (cursorWsRef.current) {
        try {
          cursorWsRef.current.close();
        } catch {
          /* ignore */
        }
        cursorWsRef.current = null;
      }
      return;
    }
    const ws = new WebSocket(cursorTailWsUrl());
    cursorWsRef.current = ws;
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          sessionId: String(asrSessionId),
          cliKind: isQoderCli ? 'qoder' : 'cursor',
        })
      );
    };
    ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === 'files') {
          const info = typeof d.info === 'string' ? d.info : '';
          const error = typeof d.error === 'string' ? d.error : '';
          setCursorTailInfo(info);
          setCursorTailError(error);
        }
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      if (cursorWsRef.current === ws) cursorWsRef.current = null;
    };
    return () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      if (cursorWsRef.current === ws) cursorWsRef.current = null;
    };
  }, [isCliWorkbench, isQoderCli, asrSessionId]);

  useEffect(() => {
    cursorRunActiveSessionIdRef.current = cursorRunActiveSessionId;
  }, [cursorRunActiveSessionId]);

  useEffect(() => {
    if (!cursorRunActiveSessionId) return undefined;
    const sid = String(cursorRunActiveSessionId);
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const st = await fetchCursorRunStatus(sid, cursorRunCliKindRef.current);
        if (!cancelled && !st.running) {
          const modeId = activeModeIdRef.current;
          if (isCliWorkbenchRef.current && modeId) {
            const info = String(cursorTailInfoRef.current || '').trim();
            const err = String(cursorTailErrorRef.current || '').trim();
            const combined =
              [info && `stdout:\n${info}`, err && `stderr:\n${err}`].filter(Boolean).join('\n\n') ||
              '(本轮无文件输出)';
            try {
              await apiAppendCliWorkbenchChatMessage(sid, modeId, 'assistant', combined);
              const { messages } = await fetchCliWorkbenchChat(sid, modeId);
              if (!cancelled) setCursorWorkbenchDbMessages(messages);
            } catch {
              /* 落库失败不阻塞 UI */
            }
          }
          setCursorRunActiveSessionId(null);
          cursorRunActiveSessionIdRef.current = null;
          setCursorWorkbenchBusySessionId(null);
          setCursorStreamLoading(false);
        }
      } catch {
        /* 单次失败不结束轮询 */
      }
    };
    const id = setInterval(poll, CURSOR_RUN_STATUS_POLL_MS);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [cursorRunActiveSessionId]);

  const cursorExternalThreadProvider = useMemo(() => {
    if (!activeMode || activeMode.kind !== 'cli') return CURSOR_EXTERNAL_THREAD_PROVIDER;
    if (activeMode.cliVariant === 'qoder') return QODER_EXTERNAL_THREAD_PROVIDER;
    if (activeMode.cliVariant === 'cursor') return getResolvedExternalThreadProvider();
    return CURSOR_EXTERNAL_THREAD_PROVIDER;
  }, [activeMode, serverWorkspaceFallback]);

  useEffect(() => {
    if (!isCliWorkbench || !asrSessionId || !SESSION_UUID_RE.test(String(asrSessionId))) {
      setExternalThreadsByProvider({});
      cursorExternalThreadEnsureKeyRef.current = '';
      setCursorEnsureStatus('idle');
      setCursorEnsureErrorMsg('');
      return;
    }
    const prov = cursorExternalThreadProvider;
    const ensureKey = `${String(asrSessionId)}:${prov}`;
    if (cursorExternalThreadEnsureKeyRef.current !== ensureKey) {
      cursorExternalThreadEnsureKeyRef.current = ensureKey;
      setExternalThreadsByProvider({});
    }
    let cancelled = false;
    setCursorEnsureStatus('loading');
    setCursorEnsureErrorMsg('');
    cursorOmitResumeNextInvokeRef.current = false;
    fetchSessionExternalThreads(asrSessionId)
      .then((rows) => {
        if (cancelled) return;
        const mapped = rows.reduce((acc, row) => {
          const p = String(row.provider || '').trim();
          const tid = String(row.threadId || '').trim();
          if (p && tid) acc[p] = tid;
          return acc;
        }, {});
        setExternalThreadsByProvider(mapped);
        setCursorEnsureStatus('ok');
      })
      .catch((e) => {
        if (cancelled) return;
        cursorOmitResumeNextInvokeRef.current = false;
        setCursorEnsureStatus('error');
        setCursorEnsureErrorMsg(e.message || '加载关联失败');
        setExternalThreadsByProvider({});
      });
    return () => {
      cancelled = true;
    };
  }, [
    isCliWorkbench,
    asrSessionId,
    cursorExternalThreadProvider,
    cursorEnsureRetryNonce,
  ]);

  const cursorResolvedExternalThreadId = useMemo(() => {
    const p = cursorExternalThreadProvider;
    return String(externalThreadsByProvider[p] || '').trim();
  }, [cursorExternalThreadProvider, externalThreadsByProvider]);

  const sanitizedCursorStderr = useMemo(
    () => sanitizeCursorStderrForDisplay(cursorTailError),
    [cursorTailError]
  );

  const cursorParsedOutput = useMemo(
    () =>
      parseCliOutputForDelivery(
        activeMode?.cliVariant === 'qoder' ? 'qoder_cli' : 'cursor_cli',
        cursorTailInfo,
        sanitizedCursorStderr
      ),
    [activeMode?.cliVariant, cursorTailInfo, sanitizedCursorStderr]
  );

  const cursorStreamFormatHint = useMemo(() => {
    if (!String(cursorTailInfo || '').trim()) return null;
    if (looksLikeCursorStreamJson(cursorTailInfo)) return null;
    return '无法按分行解析，已按整段原文显示。';
  }, [cursorTailInfo]);

  /** 本轮是否已有 CLI 流式内容（有则不再占位的「准备/等待」条） */
  const hasCursorCliStreamContent = useMemo(
    () =>
      Boolean(String(cursorTailInfo || '').trim() || String(sanitizedCursorStderr || '').trim()),
    [cursorTailInfo, sanitizedCursorStderr]
  );

  const cursorSidePanelLoading =
    Boolean(isCliWorkbench) &&
    cursorStreamLoading &&
    !hasCursorCliStreamContent &&
    (cursorAwaitingCliPaste ||
      (cursorWorkbenchBusySessionId != null &&
        String(cursorWorkbenchBusySessionId) === String(asrSessionId)) ||
      (cursorRunActiveSessionId != null &&
        String(cursorRunActiveSessionId) === String(asrSessionId)));

  useEffect(() => {
    if (!cursorPendingUserPrompt?.trim()) return;
    const t = cursorTailInfo;
    if (!String(t).trim()) return;
    const p = cursorPendingUserPrompt.trim();
    if (
      t.includes('"type":"user"') ||
      (p.length > 0 && t.includes(p.slice(0, Math.min(48, p.length))))
    ) {
      setCursorPendingUserPrompt(null);
    }
  }, [cursorTailInfo, cursorPendingUserPrompt]);

  useEffect(() => {
    const el = cursorPanelScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [
    cursorTailInfo,
    sanitizedCursorStderr,
    cursorPendingUserPrompt,
    cursorParsedOutput.blocks.length,
    cursorSidePanelLoading,
  ]);

  const cliWorkspaceFallbackStr =
    serverWorkspaceFallback === undefined ? '' : serverWorkspaceFallback;

  const cursorTriadInputs = useMemo(() => {
    if (!isCliWorkbench || !activeMode) {
      return { 模型: '', 工作空间: '', 输出路径: '' };
    }
    return cursorTriadCustomValues(activeMode);
  }, [isCliWorkbench, activeMode]);

  const cursorTriadCtx = useMemo(
    () => ({
      paragraph: `${editorContent}${partialText || ''}`.trim(),
      sessionId: asrSessionId ? String(asrSessionId) : '',
      workspace:
        String(activeMode?.cliWorkspace || '').trim() || String(cliWorkspaceFallbackStr).trim(),
      cursorStdoutAbsPath: cursorSessionFilePaths?.infoTxtAbs || '',
      cursorStderrAbsPath: cursorSessionFilePaths?.errorTxtAbs || '',
      externalThreadId: cursorResolvedExternalThreadId,
    }),
    [
      editorContent,
      partialText,
      asrSessionId,
      activeMode?.cliWorkspace,
      cliWorkspaceFallbackStr,
      cursorSessionFilePaths,
      cursorResolvedExternalThreadId,
    ]
  );

  const cursorWorkbenchTriadLabels = useMemo(() => {
    if (!isCliWorkbench || !activeMode) return [];
    const tmpl = activeMode.cliTemplate || CURSOR_CLI_DEFAULT_TEMPLATE;
    return cursorTriadLabelsInTemplate(tmpl);
  }, [isCliWorkbench, activeMode]);

  const cursorTriadReady = useMemo(() => {
    if (!isCliWorkbench || !activeMode) return true;
    const tmpl = activeMode.cliTemplate || CURSOR_CLI_DEFAULT_TEMPLATE;
    return cursorCliReadyIgnoringProvisioningDeps(
      tmpl,
      activeMode.angleSlots || [],
      cursorTriadCtx
    );
  }, [isCliWorkbench, activeMode, cursorTriadCtx]);

  useEffect(() => {
    cursorVoiceBlockRef.current = isCliWorkbench && !cursorTriadReady;
  }, [isCliWorkbench, cursorTriadReady]);

  const patchCursorTriadField = useCallback(
    (label, value) => {
      if (
        !activeMode?.id ||
        (activeMode.cliVariant !== 'cursor' && activeMode.cliVariant !== 'qoder')
      )
        return;
      const tmpl = activeMode.cliTemplate || CURSOR_CLI_DEFAULT_TEMPLATE;
      const slots = mergeAngleSlotsWithDefaults(tmpl, activeMode.angleSlots || []);
      const next = slots.map((s) =>
        s.label === label ? { ...s, source: 'custom', customValue: value } : s
      );
      const mergedForWs = mergeAngleSlotsWithDefaults(tmpl, next);
      const cliWorkspace = deriveCursorCliWorkspace(
        mergedForWs,
        String(activeMode.cliWorkspace || '')
      );
      const ext = {
        commandTemplate: tmpl,
        angleSlots: next,
        cliWorkspace,
      };
      if (activeMode.builtIn) {
        saveBuiltinOutputOverride(activeMode.id, { extensions: ext });
      } else {
        updateCustomOutput(activeMode.id, { extensions: ext });
      }
      useHomeWorkbenchModesStore.getState().refreshModesFromCatalog();
    },
    [activeMode]
  );

  const getCursorTabTitle = useCallback(
    (tid) => {
      const rec = workspacePickSessions.find((s) => String(s.id) === String(tid));
      if (rec) {
        const t = (rec.list_title || rec.preview || '').trim();
        const short = t ? (t.length > 16 ? `${t.slice(0, 16)}…` : t) : '';
        if (short) return short;
      }
      return `会话 ${String(tid).slice(0, 8)}…`;
    },
    [workspacePickSessions]
  );

  const cursorWorkbenchReadinessHint = useMemo(() => {
    if (!isCliWorkbench || !activeMode || cursorTriadReady) return '';
    const tmpl = activeMode.cliTemplate || CURSOR_CLI_DEFAULT_TEMPLATE;
    return (
      cursorCliFillHint(tmpl, activeMode.angleSlots || [], cursorTriadCtx) ||
      '请完成「入参」中的模型、工作空间等后再复制或发送。'
    );
  }, [isCliWorkbench, activeMode, cursorTriadCtx, cursorTriadReady]);

  const closeCursorWorkbenchTab = useCallback(
    async (sid) => {
      const id = String(sid);
      if (
        !window.confirm(
          '关闭标签将从数据库永久删除该会话及其段落（与「会话」页删除一致）。确定吗？'
        )
      ) {
        return;
      }
      try {
        await apiDeleteSession(id);
      } catch (e) {
        setStatus(e.message || '删除会话失败');
        return;
      }

      for (const m of getAllModes()) {
        if (m.kind === 'agent') removeAgentThreadIdForSession(m.id, id);
      }

      cursorTabOutputCacheRef.current.delete(id);
      const wasActive = String(asrSessionId || '') === id;

      setWorkbenchSplitTabIds((prev) => {
        const next = prev.filter((x) => String(x) !== id);
        if (wasActive) {
          const fb = next.length > 0 ? next[next.length - 1] : null;
          queueMicrotask(() => {
            if (fb) {
              dbSessionIdRef.current = fb;
              setAsrSessionId(fb);
              setStatus(
                `已删除会话；当前 · ${fb.slice(0, 8)}…（识别与保存将归入本会话）`
              );
            } else {
              dbSessionIdRef.current = null;
              setAsrSessionId(null);
              setStatus('已删除会话；请新建会话或从「已有会话」打开后再识别');
            }
          });
        } else {
          queueMicrotask(() => {
            setStatus(`已删除会话 · ${id.slice(0, 8)}…`);
          });
        }
        return next;
      });

      loadWorkspacePickSessions();
    },
    [asrSessionId, loadWorkspacePickSessions]
  );

  useEffect(() => {
    if (activeMode) saveActiveModeId(activeMode.id);
  }, [activeMode]);

  useEffect(() => {
    const onOutputs = () => {
      useHomeWorkbenchModesStore.getState().refreshModesFromCatalog();
    };
    window.addEventListener('reso-outputs-changed', onOutputs);
    return () => window.removeEventListener('reso-outputs-changed', onOutputs);
  }, []);

  useEffect(() => {
    const el = agentMessagesRef.current;
    if (!el || !isAgent) return;
    const last = agentMessages[agentMessages.length - 1];
    const pending =
      last?.role === 'assistant' && Boolean((last as { streamPending?: boolean }).streamPending);
    el.scrollTo({ top: el.scrollHeight, behavior: pending ? 'auto' : 'smooth' });
  }, [agentMessages, isAgent]);

  useEffect(() => {
    partialTextRef.current = partialText;
  }, [partialText]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    copyBusyRef.current = copyBusy;
  }, [copyBusy]);
  useEffect(() => {
    activeModeIdRef.current = activeModeId;
  }, [activeModeId]);

  useEffect(() => {
    if (!isAgent || !activeMode) return;
    const sid = asrSessionId && SESSION_UUID_RE.test(String(asrSessionId)) ? String(asrSessionId) : '';
    const key = agentChatStateKey(activeMode.id, sid);
    if (!sid) {
      setChatByModeId((s) => ({ ...s, [key]: [] }));
      return;
    }
    const tid = getAgentThreadIdForSession(activeMode.id, sid);
    if (!tid) {
      setChatByModeId((s) => {
        const cur = s[key];
        if (Array.isArray(cur) && cur.length > 0) return s;
        return { ...s, [key]: [] };
      });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchChatThread(tid);
        if (cancelled) return;
        setChatByModeId((s) => ({
          ...s,
          [key]: data.messages || [],
        }));
      } catch {
        if (!cancelled) {
          removeAgentThreadIdForSession(activeMode.id, sid);
          setChatByModeId((s) => ({ ...s, [key]: [] }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAgent, activeMode?.id, asrSessionId]);

  const cleanupAudio = useCallback(() => {
    const node = workletNodeRef.current;
    if (node) {
      node.port.onmessage = null;
      node.disconnect();
      workletNodeRef.current = null;
    }
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const disconnectWs = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const abortAsrSession = useCallback(() => {
    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }));
    }
    disconnectWs();
    cleanupAudio();
    setPhase('idle');
    setPartialText('');
  }, [cleanupAudio, disconnectWs]);

  useEffect(() => {
    useWorkbenchNavigationGuardStore.getState().register({
      shouldBlock: () =>
        phaseRef.current === 'recording' || phaseRef.current === 'connecting',
      onLeaveConfirmed: () => {
        abortAsrSession();
      },
    });
    return () => {
      useWorkbenchNavigationGuardStore.getState().unregister();
    };
  }, [abortAsrSession]);

  useEffect(
    () => () => {
      cleanupAudio();
      disconnectWs();
    },
    [cleanupAudio, disconnectWs]
  );

  const scheduleSilenceTimer = useCallback(() => {
    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    const cfg = modeVoiceRef.current;
    if (micInputMutedRef.current) return;
    if (phaseRef.current !== 'recording') return;
    const agentMode = isAgentRef.current;
    if (cfg.endMode !== END_MODES.silence && cfg.endMode !== END_MODES.both) return;
    if (!agentMode && cursorVoiceBlockRef.current) return;
    const sec =
      Number(cfg.silenceSeconds) > 0
        ? Number(cfg.silenceSeconds)
        : agentMode
          ? AGENT_VOICE_SILENCE_SEC
          : 5;
    const ms = Math.max(400, Math.min(60000, sec * 1000));
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      if (phaseRef.current !== 'recording') return;
      const seg = `${editorContentRef.current}${partialTextRef.current}`.trim();
      const sid = dbSessionIdRef.current ? String(dbSessionIdRef.current).trim() : '';
      const actKey = agentChatStateKey(activeModeIdRef.current, sid || null);
      if (
        !seg ||
        copyBusyRef.current ||
        agentSendingKeysRef.current.has(actKey) ||
        httpSendingKeysRef.current.has(actKey)
      )
        return;
      const c = modeVoiceRef.current;
      let out = seg;
      if (c.stripEndPhrase && matchesEndPhrase(seg, c.endPhrases)) {
        const stripped = stripMatchedPhrase(seg, c.endPhrases).trim();
        if (stripped) out = stripped;
      }
      runAutoSubmitRef.current?.(out, { trigger: 'silence' });
    }, ms);
  }, []);

  const tryPhraseAuto = useCallback((fullEditorText) => {
    if (micInputMutedRef.current) return;
    if (!isAgentRef.current && cursorVoiceBlockRef.current) return;
    const cfg = modeVoiceRef.current;
    if (cfg.endMode !== END_MODES.phrase && cfg.endMode !== END_MODES.both) return;
    const combined = fullEditorText.trim();
    if (!combined || !matchesEndPhrase(combined, cfg.endPhrases)) return;
    /** 结束词触发：入库/发 Agent 一律去掉关键词（与设置里「去掉结束词」无关） */
    const out = stripMatchedPhrase(combined, cfg.endPhrases).trim();
    if (!out) return;
    runAutoSubmitRef.current?.(out, { trigger: 'phrase' });
  }, []);

  /** 停止识别时补检：结束词可能只在 partial、未单独出一句 sentenceEnd */
  const tryPhraseAutoOnBuffers = useCallback(() => {
    if (micInputMutedRef.current) return;
    if (!isAgentRef.current && cursorVoiceBlockRef.current) return;
    const cfg = modeVoiceRef.current;
    if (cfg.endMode !== END_MODES.phrase && cfg.endMode !== END_MODES.both) return;
    const combined = `${editorContentRef.current}${partialTextRef.current}`.trim();
    if (!combined || !matchesEndPhrase(combined, cfg.endPhrases)) return;
    const out = stripMatchedPhrase(combined, cfg.endPhrases).trim();
    if (!out) return;
    runAutoSubmitRef.current?.(out, { trigger: 'phrase' });
  }, []);

  const handleServerMessage = useCallback(
    (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'ready') {
          return;
        }
        if (msg.type === 'transcript') {
          const vox = getVoiceSettings();
          if (msg.sentenceEnd) {
            const normalizedPiece = normalizeTranscriptText(msg.text || '', vox);
            partialTextRef.current = '';
            setPartialText('');
            setEditorContent((prev) => {
              const piece = dedupeTranscriptJoin(prev, normalizedPiece);
              const next = prev ? `${prev}${piece}` : piece;
              queueMicrotask(() => {
                editorContentRef.current = next;
                scheduleSilenceTimer();
                tryPhraseAuto(next);
              });
              return next;
            });
          } else {
            const t = normalizePartialTranscriptText(msg.text || '');
            partialTextRef.current = t;
            setPartialText(t);
            queueMicrotask(() => {
              scheduleSilenceTimer();
            });
          }
          return;
        }
        if (msg.type === 'done') {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
          tryPhraseAutoOnBuffers();
          partialTextRef.current = '';
          setPhase('idle');
          setStatus('已停止，可再次开始');
          setPartialText('');
          cleanupAudio();
          return;
        }
        if (msg.type === 'error') {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
          setStatus(msg.message || '错误');
          setPhase('idle');
          setPartialText('');
          cleanupAudio();
        }
      } catch {
        /* ignore */
      }
    },
    [cleanupAudio, scheduleSilenceTimer, tryPhraseAuto, tryPhraseAutoOnBuffers]
  );

  const startStreamingPcm = useCallback(async (ws) => {
    const win = window as Window & {
      webkitAudioContext?: typeof AudioContext;
      AudioWorkletNode?: typeof AudioWorkletNode;
    };
    const Ctor = win.AudioContext || win.webkitAudioContext;
    if (!Ctor) {
      throw new Error('当前浏览器不支持 Web Audio（无 AudioContext）');
    }
    if (!win.AudioWorkletNode || !('audioWorklet' in Ctor.prototype)) {
      throw new Error(
        '当前浏览器不支持 AudioWorklet。请使用较新版 Chrome / Edge / Firefox / Safari，并避免在无痕模式中禁用相关能力。'
      );
    }
    const ac = new Ctor({ latencyHint: 'interactive' });
    audioContextRef.current = ac;
    const resumeCtx = async () => {
      if (ac.state === 'suspended') {
        await ac.resume();
      }
    };
    await resumeCtx();
    try {
      await ac.audioWorklet.addModule(pcmWorkletUrl);
    } catch (e) {
      const hint =
        e instanceof TypeError || (e instanceof Error && /fetch|load|Failed/i.test(e.message))
          ? '（常见原因：页面非 https/localhost、或开发服务器未正确提供 worklet 脚本）'
          : '';
      throw new Error(`加载音频处理模块失败：${e instanceof Error ? e.message : String(e)}${hint}`);
    }
    const node = new AudioWorkletNode(ac, 'pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      processorOptions: { chunkSamples: 4096 },
    });
    workletNodeRef.current = node;
    node.port.onmessage = (ev) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (micInputMutedRef.current) return;
      const pcm = ev.data?.pcm;
      if (pcm instanceof Uint8Array) ws.send(pcm);
    };
    const stream = streamRef.current;
    if (!stream?.getAudioTracks?.()?.length) {
      throw new Error('麦克风轨道已结束，请重新开始识别');
    }
    const source = ac.createMediaStreamSource(stream);
    sourceRef.current = source;

    const analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    analyserRef.current = analyser;
    source.connect(analyser);

    const mute = ac.createGain();
    mute.gain.value = 0;
    source.connect(node);
    node.connect(mute);
    mute.connect(ac.destination);
    await resumeCtx();
  }, []);

  const onSelectMode = (id) => {
    if (id === activeModeId) return;
    if (phase !== 'idle') abortAsrSession();
    const next = modes.find((m) => m.id === id);
    /** 进入右侧分栏模式时勿沿用其它模式绑定的会话，否则会出现「会话 xxx」标签但语义已不对 */
    const nextUsesRightSplit =
      next?.kind === 'agent' ||
      (next?.kind === 'cli' &&
        (next?.cliVariant === 'cursor' || next?.cliVariant === 'qoder'));
    if (nextUsesRightSplit) {
      clearAsrSession();
      setWorkbenchSplitTabIds([]);
      setWorkbenchSessionAttachSelectKey((k) => k + 1);
      cursorTabOutputCacheRef.current.clear();
      cursorTabCachePrevSidRef.current = null;
    }
    setActiveModeId(id);
    setStatus(
      next?.kind === 'agent'
        ? '右边聊天；可新建或选用已有会话；说完停一下会自动发。'
        : next?.kind === 'http'
          ? '填好上面的地址和协议，说的话会发到对方。'
          : next?.kind === 'cli'
            ? next?.cliVariant === 'cursor' || next?.cliVariant === 'qoder'
              ? '右边聊天；点发送后按提示去终端粘贴运行。'
              : next?.cliVariant === 'xiaoai'
                ? '写好命令，尖括号在下面填；好了再点复制。'
                : '写好命令和工作目录，再点复制。'
            : '新建会话或开始识别；也可选已有会话接着用。'
    );
  };

  const onNewAsrSession = async () => {
    if (!isAsr && !isCli && !isHttp && !isAgent) return;
    try {
      const sid = await apiCreateSession();
      assignAsrSession(sid);
      setStatus(
        isAgent
          ? `已新建会话 · ${sid.slice(0, 8)}…（本模式对话与段落将归入本会话）`
          : `已新建会话 · ${sid.slice(0, 8)}…（识别与保存将归入本会话）`
      );
      loadWorkspacePickSessions();
    } catch (e) {
      setStatus(e.message || '新建会话失败');
    }
  };

  const startRecognition = async () => {
    disconnectWs();
    cleanupAudio();
    setPhase('connecting');

    if (isAsr || isCli || isHttp) {
      if (!dbSessionIdRef.current) {
        setStatus('创建会话…');
        try {
          const sid = await apiCreateSession();
          assignAsrSession(sid);
        } catch (e) {
          setStatus(e.message || '暂时建不了会话，请稍后再试');
          setPhase('idle');
          return;
        }
      }
    }

    setStatus('请求麦克风…');

    let stream;
    try {
      stream = await acquireMicStream();
    } catch (err) {
      setStatus(
        err instanceof DOMException || err?.name ? micErrorMessage(err) : err.message || '无法访问麦克风'
      );
      setPhase('idle');
      return;
    }
    streamRef.current = stream;
    syncMicTracksFromMuteRef();

    const ws = new WebSocket(wsUrl());
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onclose = () => {
      cleanupAudio();
      setPhase('idle');
      setStatus((s) =>
        /错误|失败|无法连接|缺少|超时|权限|数据库|麦克风|后端|Key|API|引擎/i.test(s)
          ? s
          : '连接已断开'
      );
      wsRef.current = null;
    };

    try {
      await new Promise((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error('WebSocket'));
      });
    } catch {
      setStatus('连不上服务，请确认已在本地启动并刷新页面。');
      setPhase('idle');
      cleanupAudio();
      return;
    }

    setStatus('正在开启识别…');

    const readyPromise = new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('等待识别就绪超时'));
      }, 25000);

      ws.onmessage = (ev) => {
        handleServerMessage(ev);
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'ready') {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve();
          }
          if (msg.type === 'error') {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            reject(new Error(msg.message || '服务端错误'));
          }
        } catch {
          /* ignore */
        }
      };

      const speechKey = getResolvedSpeechApiKey();
      const vStart = getVoiceSettings();
      const langHints = getAsrLanguageHintsArray(vStart.asrLanguageHintsText);
      ws.send(
        JSON.stringify({
          type: 'start',
          asrModel: getResolvedSpeechAsrApiModelId(),
          ...(speechKey ? { dashscopeApiKey: speechKey } : {}),
          asrDisfluencyRemoval: vStart.asrDisfluencyRemoval,
          ...(langHints.length ? { asrLanguageHints: langHints } : {}),
        })
      );
    });

    try {
      await readyPromise;
    } catch (e) {
      setStatus(e.message || '连接失败');
      setPhase('idle');
      cleanupAudio();
      ws.close();
      wsRef.current = null;
      return;
    }

    ws.onmessage = (ev) => handleServerMessage(ev);

    if (ws.readyState !== WebSocket.OPEN) return;

    setPhase('recording');
    try {
      await startStreamingPcm(ws);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      setStatus(detail ? `音频引擎启动失败：${detail}` : '音频引擎启动失败，请刷新页面后重试');
      setPhase('idle');
      cleanupAudio();
      ws.close();
      wsRef.current = null;
    }
  };

  const stopRecognition = useCallback(() => {
    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }));
    }
    const node = workletNodeRef.current;
    if (node) {
      node.port.onmessage = null;
      node.disconnect();
      workletNodeRef.current = null;
    }
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus('正在收尾…');
  }, []);

  useLayoutEffect(() => {
    stopRecognitionRef.current = stopRecognition;
  }, [stopRecognition]);

  const toggleRecord = () => {
    if (phase === 'recording') {
      stopRecognition();
    } else if (phase === 'connecting') {
      abortAsrSession();
    } else if (phase === 'idle') {
      startRecognition();
    }
  };

  const clearEditor = () => {
    setEditorContent('');
    setPartialText('');
    setStatus(
      isAsr || isCli || isHttp
        ? '已清空编辑区（尚未保存到会话）'
        : isAgent
          ? '已清空输入框'
          : '已清空'
    );
  };

  const performAsrSave = useCallback(async (segment) => {
    const sid = dbSessionIdRef.current;
    if (!sid) {
      setStatus('请先新建会话或点开始识别。');
      return false;
    }
    const text = String(segment || '').trim();
    if (!text) {
      setStatus('当前没有可复制的内容');
      return false;
    }
    setCopyBusy(true);
    try {
      const saved = await apiSaveParagraph(sid, text);
      const n = saved.paragraphIndex;
      const idxHint = typeof n === 'number' ? `（第 ${n} 段）` : '';
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        setStatus(`已保存${idxHint}，但写入剪贴板失败（请检查浏览器权限）`);
        setEditorContent('');
        setPartialText('');
        return false;
      }
      setEditorContent('');
      setPartialText('');
      setStatus(`已复制并保存为第 ${n ?? '?'} 段，编辑区已清空`);
      return true;
    } catch (e) {
      setStatus(e.message || '保存失败');
      return false;
    } finally {
      setCopyBusy(false);
    }
  }, []);

  const performAgentPipeline = useCallback(
    async (segment) => {
      if (!activeMode || activeMode.kind !== 'agent') return false;
      const text = String(segment || '').trim();
      if (!text) return false;
      const modeId = activeMode.id;
      let ensuredSid = dbSessionIdRef.current ? String(dbSessionIdRef.current).trim() : '';
      if (!ensuredSid || !SESSION_UUID_RE.test(ensuredSid)) {
        setStatus('正在创建会话…');
        try {
          ensuredSid = String(await apiCreateSession());
          assignAsrSession(ensuredSid);
          loadWorkspacePickSessions();
        } catch (e) {
          setStatus(e.message || '暂时建不了会话，请稍后再试');
          return false;
        }
      }
      const chatKey = agentChatStateKey(modeId, ensuredSid);
      if (agentSendingKeysRef.current.has(chatKey)) return false;
      let streamThreadId = getAgentThreadIdForSession(modeId, ensuredSid);
      agentSendingKeysRef.current.add(chatKey);
      setAgentSendingByKey((s) => ({ ...s, [chatKey]: true }));
      setStatus('正在请求回复…');
      flushSync(() => {
        setChatByModeId((s) => {
          const p = s[chatKey] || [];
          return {
            ...s,
            [chatKey]: [
              ...p,
              { role: 'user', content: text },
              { role: 'assistant', content: '', streamPending: true },
            ],
          };
        });
      });
      try {
        let prefix = '';
        try {
          const saved = await apiSaveParagraph(ensuredSid, text);
          const n = saved.paragraphIndex;
          prefix = typeof n === 'number' ? `第 ${n} 段已保存 · ` : '';
        } catch (e) {
          prefix = `段落未保存（${e.message || '错误'}）· `;
        }
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          setStatus(`${prefix}剪贴板写入失败`);
          setEditorContent(text);
          setPartialText('');
          setChatByModeId((s) => {
            const p = s[chatKey] || [];
            const next = p.slice(0, -2);
            return { ...s, [chatKey]: next };
          });
          return false;
        }
        setEditorContent('');
        setPartialText('');
        const vs = getVoiceSettings();
        const resolvedModel = getResolvedResoChatApiModelId();
        const model = resolvedModel || vs.agentModel || undefined;
        const dashscopeApiKey = getResolvedResoChatApiKey() || vs.dashscopeApiKey || undefined;
        const threadId = getAgentThreadIdForSession(modeId, ensuredSid);
        const agStream = {
          text: '',
          textSeg: 0,
          tools: [],
        };
        await apiAgentChatTurnStream(
          {
            modeId,
            threadId,
            userText: text,
            system: activeMode.systemPrompt || undefined,
            model,
            dashscopeApiKey,
            sessionId: ensuredSid,
          },
          (ev) => {
            if (ev.type === 'meta' && ev.threadId) {
              streamThreadId = ev.threadId;
              setAgentThreadIdForSession(modeId, ensuredSid, ev.threadId);
            }
            if (ev.type === 'RUN_STARTED' && ev.threadId) {
              streamThreadId = String(ev.threadId);
              setAgentThreadIdForSession(modeId, ensuredSid, String(ev.threadId));
            }
            if (ev.type === 'TEXT_MESSAGE_START') {
              agStream.textSeg += 1;
              if (agStream.textSeg > 1) {
                agStream.text += '\n\n';
              }
            }
            if (ev.type === 'TEXT_MESSAGE_CONTENT' && typeof ev.delta === 'string' && ev.delta.length > 0) {
              agStream.text += ev.delta;
              setChatByModeId((s) => {
                const list = [...(s[chatKey] || [])];
                const last = list[list.length - 1];
                if (last?.role === 'assistant') {
                  list[list.length - 1] = {
                    ...last,
                    content: agStream.text,
                    aguiTools: agStream.tools.length ? [...agStream.tools] : last.aguiTools,
                    streamPending: false,
                  };
                }
                return { ...s, [chatKey]: list };
              });
            }
            if (ev.type === 'TOOL_CALL_START' && ev.toolCallId && ev.toolCallName) {
              agStream.tools.push({
                toolCallId: String(ev.toolCallId),
                toolCallName: String(ev.toolCallName),
                args: '',
                result: '',
              });
              setChatByModeId((s) => {
                const list = [...(s[chatKey] || [])];
                const last = list[list.length - 1];
                if (last?.role === 'assistant') {
                  list[list.length - 1] = {
                    ...last,
                    aguiTools: [...agStream.tools],
                    streamPending: false,
                  };
                }
                return { ...s, [chatKey]: list };
              });
            }
            if (ev.type === 'TOOL_CALL_ARGS' && ev.toolCallId && typeof ev.delta === 'string') {
              const id = String(ev.toolCallId);
              const row = agStream.tools.find((t) => t.toolCallId === id);
              if (row) {
                row.args = `${row.args || ''}${ev.delta}`;
                if (row.args.length > 12000) {
                  row.args = `${row.args.slice(0, 12000)}…`;
                }
              }
              setChatByModeId((s) => {
                const list = [...(s[chatKey] || [])];
                const last = list[list.length - 1];
                if (last?.role === 'assistant') {
                  list[list.length - 1] = {
                    ...last,
                    aguiTools: [...agStream.tools],
                  };
                }
                return { ...s, [chatKey]: list };
              });
            }
            if (ev.type === 'TOOL_CALL_RESULT' && ev.toolCallId) {
              const id = String(ev.toolCallId);
              const row = agStream.tools.find((t) => t.toolCallId === id);
              if (row) {
                row.result = typeof ev.content === 'string' ? ev.content : JSON.stringify(ev.content ?? '');
                if (row.result.length > 16000) {
                  row.result = `${row.result.slice(0, 16000)}…`;
                }
              }
              setChatByModeId((s) => {
                const list = [...(s[chatKey] || [])];
                const last = list[list.length - 1];
                if (last?.role === 'assistant') {
                  list[list.length - 1] = {
                    ...last,
                    aguiTools: [...agStream.tools],
                  };
                }
                return { ...s, [chatKey]: list };
              });
            }
            if (ev.type === 'done' && Array.isArray(ev.messages)) {
              const tools = [...agStream.tools];
              setChatByModeId((s) => {
                const mapped = ev.messages.map((row) => ({
                  role: row.role,
                  content: row.content,
                }));
                const li = mapped.length - 1;
                if (li >= 0 && mapped[li].role === 'assistant' && tools.length) {
                  mapped[li] = { ...mapped[li], aguiTools: tools };
                }
                return { ...s, [chatKey]: mapped };
              });
            }
          }
        );
        setStatus('可继续输入或说话');
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : '发送失败';
        setChatByModeId((s) => {
          const list = [...(s[chatKey] || [])];
          const last = list[list.length - 1];
          if (last?.role === 'assistant') {
            list[list.length - 1] = {
              role: 'assistant',
              content: msg,
              error: true,
              streamPending: false,
            };
          } else {
            list.push({ role: 'assistant', content: msg, error: true, streamPending: false });
          }
          return { ...s, [chatKey]: list };
        });
        setStatus('可继续输入或说话');
        return false;
      } finally {
        agentSendingKeysRef.current.delete(chatKey);
        setAgentSendingByKey((s) => {
          const n = { ...s };
          delete n[chatKey];
          return n;
        });
      }
    },
    [activeMode, assignAsrSession, loadWorkspacePickSessions]
  );

  const performHttpPipeline = useCallback(
    async (segment) => {
      if (!activeMode || activeMode.kind !== 'http') return false;
      const text = String(segment || '').trim();
      if (!text) return false;
      const url = (activeMode.requestUrl || '').trim();
      if (!url) {
        setStatus('请先填好上面的请求地址（也可在「目标」里配）。');
        return false;
      }
      const sid0 = dbSessionIdRef.current ? String(dbSessionIdRef.current).trim() : '';
      const httpKey = agentChatStateKey(activeMode.id, sid0 || null);
      if (httpSendingKeysRef.current.has(httpKey)) return false;
      httpSendingKeysRef.current.add(httpKey);
      setHttpSendingByKey((s) => ({ ...s, [httpKey]: true }));
      setStatus('正在复制、保存并发送…');
      try {
        const sid = dbSessionIdRef.current;
        let prefix = '';
        if (sid) {
          try {
            const saved = await apiSaveParagraph(sid, text);
            const n = saved.paragraphIndex;
            prefix = typeof n === 'number' ? `第 ${n} 段已保存 · ` : '';
          } catch (e) {
            prefix = `段落未保存（${e.message || '错误'}）· `;
          }
        } else {
          prefix = '未选会话，段落未保存 · ';
        }
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          setStatus(`${prefix}剪贴板写入失败`);
          return false;
        }
        const vs = getVoiceSettings();
        const protocol = activeMode.httpProtocol || 'openai_chat';
        const resolvedChat = getResolvedResoChatApiModelId();
        const body =
          protocol === 'agui'
            ? { user_message: text, session_id: sid || null }
            : {
                model: resolvedChat || vs.agentModel || undefined,
                messages: [{ role: 'user', content: text }],
              };
        const targetEnv = normalizeCliEnvRecord(activeMode.cliEnv);
        const headers = { 'Content-Type': 'application/json' };
        if (Object.keys(targetEnv).length > 0) {
          headers['X-Reso-Target-Env'] = JSON.stringify(targetEnv);
        }
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          mode: 'cors',
        });
        const raw = await res.text();
        if (!res.ok) {
          setStatus(`${prefix}对方返回错误（${res.status}）：${raw.slice(0, 120)}`);
          return false;
        }
        setEditorContent('');
        setPartialText('');
        setStatus(`${prefix}已收到回复（${raw.length ? raw.slice(0, 80) + (raw.length > 80 ? '…' : '') : '空内容'}）`);
        return true;
      } catch (e) {
        setStatus(e.message || '请求失败');
        return false;
      } finally {
        httpSendingKeysRef.current.delete(httpKey);
        setHttpSendingByKey((s) => {
          const n = { ...s };
          delete n[httpKey];
          return n;
        });
      }
    },
    [activeMode]
  );

  /** Cursor / Qoder 发送：按需建会话、拉路径；Cursor 另需 ensure 外部线程 */
  const provisionCursorWorkbenchCli = useCallback(async (opts) => {
    const quiet = Boolean(opts?.quiet);
    const statusHint = (msg) => {
      if (!quiet) setStatus(msg);
    };
    if (!activeMode || (activeMode.cliVariant !== 'cursor' && activeMode.cliVariant !== 'qoder')) {
      return {
        ok: true,
        sid: dbSessionIdRef.current,
        paths: cursorSessionFilePaths,
        threadId: cursorResolvedExternalThreadId,
      };
    }

    let sid = dbSessionIdRef.current ? String(dbSessionIdRef.current).trim() : '';
    if (!sid || !SESSION_UUID_RE.test(sid)) {
      statusHint('正在创建会话…');
      try {
        sid = String(await apiCreateSession());
        assignAsrSession(sid);
        loadWorkspacePickSessions();
      } catch (e) {
        return { ok: false, error: e.message || '无法创建会话' };
      }
    }

    if (activeMode.cliVariant === 'qoder') {
      let paths = cursorSessionFilePaths;
      const qFetchKey = `${sid}:qoder`;
      statusHint('正在解析 Qoder 输出路径…');
      try {
        paths = await fetchCursorSessionPaths(sid, 'qoder');
        setCursorSessionFilePaths(paths);
        cursorPathsFetchKeyRef.current = qFetchKey;
      } catch (e) {
        return { ok: false, error: e.message || '解析输出路径失败' };
      }
      const qProv = QODER_EXTERNAL_THREAD_PROVIDER;
      let threadId = String((externalThreadsByProvider[qProv] || '').trim());
      if (!threadId) {
        statusHint('正在准备…');
        try {
          const r = await apiEnsureSessionExternalThread(
            sid,
            qProv,
            cliEnvPayloadForEnsure ? { cliEnv: cliEnvPayloadForEnsure } : undefined
          );
          threadId = r.threadId;
          cursorOmitResumeNextInvokeRef.current = Boolean(r.created);
          setExternalThreadsByProvider((prev) => ({ ...prev, [qProv]: r.threadId }));
          setCursorEnsureStatus('ok');
          setCursorEnsureErrorMsg('');
        } catch (e) {
          if (!quiet) {
            setCursorEnsureStatus('error');
            setCursorEnsureErrorMsg(e.message || '准备失败');
          }
          return { ok: false, error: e.message || '准备失败' };
        }
      }
      return { ok: true, sid, paths, threadId };
    }

    const prov = getResolvedExternalThreadProvider();

    let paths = cursorSessionFilePaths;
    const cFetchKey = `${sid}:cursor`;
    statusHint('正在解析 Cursor 输出路径…');
    try {
      paths = await fetchCursorSessionPaths(sid, 'cursor');
      setCursorSessionFilePaths(paths);
      cursorPathsFetchKeyRef.current = cFetchKey;
    } catch (e) {
      return { ok: false, error: e.message || '解析输出路径失败' };
    }

    let threadId = String((externalThreadsByProvider[prov] || '').trim());
    if (!threadId) {
      statusHint('正在准备…');
      try {
        const r = await apiEnsureSessionExternalThread(
          sid,
          prov,
          cliEnvPayloadForEnsure ? { cliEnv: cliEnvPayloadForEnsure } : undefined
        );
        threadId = r.threadId;
        cursorOmitResumeNextInvokeRef.current = Boolean(r.created);
        setExternalThreadsByProvider((prev) => ({ ...prev, [prov]: r.threadId }));
        setCursorEnsureStatus('ok');
        setCursorEnsureErrorMsg('');
      } catch (e) {
        if (!quiet) {
          setCursorEnsureStatus('error');
          setCursorEnsureErrorMsg(e.message || '准备失败');
        }
        return { ok: false, error: e.message || '准备失败' };
      }
    }

    return { ok: true, sid, paths, threadId };
  }, [
    activeMode,
    assignAsrSession,
    cliEnvPayloadForEnsure,
    cursorResolvedExternalThreadId,
    cursorSessionFilePaths,
    externalThreadsByProvider,
    loadWorkspacePickSessions,
  ]);

  const performCliCopyOnly = useCallback(async () => {
    if (!activeMode || activeMode.kind !== 'cli') return false;
    if (copyBusyRef.current) return false;
    const text = `${editorContentRef.current}${partialTextRef.current || ''}`.trim();
    if (!text) {
      setStatus('请先输入内容再复制指令');
      return false;
    }
    const sid = dbSessionIdRef.current ? String(dbSessionIdRef.current).trim() : '';
    let paths = cursorSessionFilePaths;
    const threadId = cursorResolvedExternalThreadId;
    if (
      sid &&
      (activeMode.cliVariant === 'cursor' || activeMode.cliVariant === 'qoder') &&
      (!paths?.infoTxtAbs || cursorPathsFetchKeyRef.current !== `${sid}:${activeMode.cliVariant}`)
    ) {
      try {
        paths = await fetchCursorSessionPaths(sid, activeMode.cliVariant === 'qoder' ? 'qoder' : 'cursor');
        setCursorSessionFilePaths(paths);
        cursorPathsFetchKeyRef.current = `${sid}:${activeMode.cliVariant}`;
      } catch (e) {
        setStatus(`${e.message || '解析输出路径失败'}，再复制指令`);
        return false;
      }
    }
    const computed = consumeCursorOmitResumeAndBuildCommand(
      activeMode,
      text,
      sid,
      paths,
      threadId,
      cliWorkspaceFallbackStr,
      cursorOmitResumeNextInvokeRef
    );
    if (computed.error) {
      setStatus(`${computed.error}，再复制指令`);
      return false;
    }
    setCopyBusy(true);
    try {
      await navigator.clipboard.writeText(computed.cmd);
      setStatus('复制成功');
      return true;
    } catch {
      setStatus('剪贴板写入失败');
      return false;
    } finally {
      setCopyBusy(false);
    }
  }, [
    activeMode,
    cliWorkspaceFallbackStr,
    cursorResolvedExternalThreadId,
    cursorSessionFilePaths,
  ]);

  const performCliPipeline = useCallback(
    async (segment) => {
      if (!activeMode || activeMode.kind !== 'cli') return false;
      if (copyBusyRef.current) return false;
      const text = String(segment || '').trim();
      if (!text) return false;

      if (activeMode.cliVariant === 'cursor' || activeMode.cliVariant === 'qoder') {
        setCopyBusy(true);
        cursorSendInFlightRef.current = true;
        setCursorQuietPrepare(true);
        setCursorAwaitingCliPaste(true);
        setCursorStreamLoading(true);
        setCursorTailInfo('');
        setCursorTailError('');
        setCursorPendingUserPrompt(text);
        setEditorContent('');
        setPartialText('');
        try {
          const p = await provisionCursorWorkbenchCli({ quiet: true });
          if (!p.ok) {
            setCursorStreamLoading(false);
            setCursorWorkbenchBusySessionId(null);
            setCursorRunActiveSessionId(null);
            cursorRunActiveSessionIdRef.current = null;
            setCursorPendingUserPrompt(null);
            setCursorAwaitingCliPaste(false);
            setEditorContent(text);
            setPartialText('');
            setStatus(`${p.error}，请重试`);
            return false;
          }
          const computed = consumeCursorOmitResumeAndBuildCommand(
            activeMode,
            text,
            p.sid,
            p.paths,
            p.threadId,
            cliWorkspaceFallbackStr,
            cursorOmitResumeNextInvokeRef
          );
          if (computed.error) {
            setCursorStreamLoading(false);
            setCursorWorkbenchBusySessionId(null);
            setCursorRunActiveSessionId(null);
            cursorRunActiveSessionIdRef.current = null;
            setCursorPendingUserPrompt(null);
            setCursorAwaitingCliPaste(false);
            setEditorContent(text);
            setPartialText('');
            setStatus(`${computed.error}，请重试`);
            return false;
          }
          let prefix = '';
          const sid = p.sid;
          if (sid) {
            try {
              const saved = await apiSaveParagraph(sid, text);
              const n = saved.paragraphIndex;
              prefix = typeof n === 'number' ? `第 ${n} 段已保存 · ` : '';
            } catch (e) {
              prefix = `段落未保存（${e.message || '错误'}）· `;
            }
          } else {
            prefix = '未选会话，段落未保存 · ';
          }
          cursorTailPollBaselineRef.current = {
            info: cursorTailInfoRef.current,
            error: cursorTailErrorRef.current,
          };
          setCursorWorkbenchBusySessionId(p.sid);
          try {
            cursorRunCliKindRef.current = activeMode.cliVariant === 'qoder' ? 'qoder' : 'cursor';
            await apiCursorRun(
              p.sid,
              computed.cmd,
              {
                ...(cliEnvPayloadForEnsure ? { cliEnv: cliEnvPayloadForEnsure } : {}),
                ...(activeMode.cliVariant === 'qoder' ? { cliKind: 'qoder' as const } : {}),
              }
            );
          } catch (e) {
            setCursorWorkbenchBusySessionId(null);
            setCursorRunActiveSessionId(null);
            cursorRunActiveSessionIdRef.current = null;
            setCursorStreamLoading(false);
            setCursorPendingUserPrompt(null);
            setCursorAwaitingCliPaste(false);
            setEditorContent(text);
            setPartialText('');
            setStatus(`${prefix}${e.message || '后台启动失败'}`);
            return false;
          }
          setCursorRunActiveSessionId(p.sid);
          cursorRunActiveSessionIdRef.current = p.sid;
          setCursorAwaitingCliPaste(false);
          try {
            await navigator.clipboard.writeText(computed.cmd);
          } catch {
            /* 服务端已在跑，剪贴板失败非致命 */
          }
          setStatus(`${prefix}已在后台跑起来；可点「停止运行」或再复制指令`);
          try {
            await apiAppendCliWorkbenchChatMessage(p.sid, activeMode.id, 'user', text);
            const { messages } = await fetchCliWorkbenchChat(p.sid, activeMode.id);
            setCursorWorkbenchDbMessages(messages);
          } catch {
            /* 对话落库失败不阻塞 CLI */
          }
          return true;
        } finally {
          cursorSendInFlightRef.current = false;
          setCursorQuietPrepare(false);
          setCopyBusy(false);
        }
      }

      const p = await provisionCursorWorkbenchCli();
      if (!p.ok) {
        setStatus(`${p.error}，再发送`);
        return false;
      }
      const computed = computeWorkbenchCliCommand(
        activeMode,
        text,
        p.sid,
        p.paths,
        p.threadId,
        cliWorkspaceFallbackStr
      );
      if (computed.error) {
        setStatus(`${computed.error}，再发送`);
        return false;
      }
      setCopyBusy(true);
      setStatus('正在保存段落并复制指令…');
      try {
        let prefix = '';
        const sid = p.sid;
        if (sid) {
          try {
            const saved = await apiSaveParagraph(sid, text);
            const n = saved.paragraphIndex;
            prefix = typeof n === 'number' ? `第 ${n} 段已保存 · ` : '';
          } catch (e) {
            prefix = `段落未保存（${e.message || '错误'}）· `;
          }
        } else {
          prefix = '未选会话，段落未保存 · ';
        }
        try {
          await navigator.clipboard.writeText(computed.cmd);
        } catch {
          setStatus(`${prefix}剪贴板写入失败`);
          return false;
        }
        setEditorContent('');
        setPartialText('');
        setStatus(`${prefix}已发送：指令已复制，编辑区已清空`);
        return true;
      } finally {
        setCopyBusy(false);
      }
    },
    [activeMode, cliWorkspaceFallbackStr, cliEnvPayloadForEnsure, provisionCursorWorkbenchCli]
  );

  const onCursorStopRunClick = useCallback(async () => {
    const sid = cursorRunActiveSessionIdRef.current;
    if (!sid) return;
    try {
      await apiCursorStop(sid, cursorRunCliKindRef.current);
    } catch {
      /* ignore */
    }
    setCursorRunActiveSessionId(null);
    cursorRunActiveSessionIdRef.current = null;
    setCursorWorkbenchBusySessionId(null);
    setCursorStreamLoading(false);
  }, []);

  const runAutoSubmit = useCallback(
    async (segment, options = {}) => {
      const trigger = options.trigger === 'phrase' ? 'phrase' : 'silence';
      const text = String(segment || '').trim();
      if (!text) return;
      if (micInputMutedRef.current) return;
      if (autoSubmitLockRef.current) return;
      const sid = dbSessionIdRef.current ? String(dbSessionIdRef.current).trim() : '';
      const actKey = agentChatStateKey(activeModeIdRef.current, sid || null);
      if (
        copyBusyRef.current ||
        agentSendingKeysRef.current.has(actKey) ||
        httpSendingKeysRef.current.has(actKey)
      )
        return;
      autoSubmitLockRef.current = true;
      try {
        const cfg = modeVoiceRef.current;
        let ok = false;
        if (isAsr) {
          ok = await performAsrSave(text);
        } else if (isAgent) {
          ok = await performAgentPipeline(text);
        } else if (isCli) {
          ok = await performCliPipeline(text);
        } else if (isHttp) {
          ok = await performHttpPipeline(text);
        }
        if (ok && cfg.stopMicAfterAuto && trigger === 'silence' && phaseRef.current === 'recording') {
          stopRecognitionRef.current?.();
        }
      } finally {
        window.setTimeout(() => {
          autoSubmitLockRef.current = false;
        }, 700);
      }
    },
    [isAsr, isAgent, isCli, isHttp, performAsrSave, performAgentPipeline, performCliPipeline, performHttpPipeline]
  );

  useLayoutEffect(() => {
    runAutoSubmitRef.current = runAutoSubmit;
  }, [runAutoSubmit]);

  const copyAndSaveParagraph = () => {
    if (copyBusy) return Promise.resolve();
    return performAsrSave(`${editorContent}${partialText || ''}`.trim()).then((ok) => {
      if (ok && isAsr) setMicInputMuted(true);
    });
  };

  const copyCliCommandOnly = () => {
    if (copyBusy) {
      setStatus('正在处理，请稍后再试');
      return Promise.resolve();
    }
    if (!cursorTriadReady) {
      setStatus(
        cursorWorkbenchReadinessHint || '请先完成「入参」中的模型、工作空间等后再复制指令。'
      );
      return Promise.resolve();
    }
    return performCliCopyOnly();
  };

  const submitCliPrimary = () => {
    if (copyBusy) return Promise.resolve();
    return performCliPipeline(`${editorContent}${partialText || ''}`.trim());
  };

  const openSessionPicker = useCallback(
    (target) => {
      if (phase !== 'idle' || workspacePickLoading) return;
      loadWorkspacePickSessions();
      const ref =
        target === 'agent'
          ? agentSessionAttachRef
          : target === 'asr'
            ? asrSessionAttachRef
            : cliSessionAttachRef;
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.click();
    },
    [phase, workspacePickLoading, loadWorkspacePickSessions]
  );

  /** Agent 底栏：复制、尽量存段、再发给模型（模型可在设置里覆盖） */
  const submitAgentPrimary = () => {
    if (agentSendingCurrent) return Promise.resolve();
    return performAgentPipeline(`${editorContent}${partialText || ''}`.trim());
  };

  const submitHttpPrimary = () => {
    if (httpSendingCurrent) return Promise.resolve();
    return performHttpPipeline(`${editorContent}${partialText || ''}`.trim());
  };

  const renderCollapsedOutputComposer = () => {
    if (!inputPaneCollapsed || (!isAgent && !isCliWorkbench)) return null;
    return (
      <div
        className={`collapsed-output-composer${listening ? ' collapsed-output-composer--listening' : ''}`}
        aria-label="输入与发送"
      >
        {listening ? (
          <div className="collapsed-output-composer-left" aria-live="polite">
            <span className="editor-recording-badge">{busy ? '连接中' : '识别中'}</span>
            <div className="editor-recording-partial">
              <span
                className={`editor-recording-partial__text${
                  partialText ? '' : ' editor-recording-partial__text--placeholder'
                }`}
              >
                {partialText || (busy ? '正在连接识别服务…' : '')}
              </span>
              <VoiceWaveVisualizer active={recording && !micInputMuted} analyserRef={analyserRef} inline />
            </div>
          </div>
        ) : null}
        <div className="collapsed-output-composer-center">
          <input
            ref={editorTextareaRef}
            type="text"
            className="collapsed-output-composer-input"
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            onBlur={onEditorBlur}
            onSelect={captureEditorSelection}
            onKeyUp={captureEditorSelection}
            onMouseUp={captureEditorSelection}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (e.shiftKey) return;
              if (e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (isCli) {
                submitCliPrimary();
                return;
              }
              if (isAgent) {
                submitAgentPrimary();
              }
            }}
            spellCheck={false}
          />
        </div>
        <div className="collapsed-output-composer-right">
          {isCliWorkbench ? (
            <>
              <button
                type="button"
                className={`btn-editor-cli-params ${!cursorTriadReady ? 'btn-editor-cli-params--needs-attention' : ''}`}
                onClick={() => setCliParamsModalOpen(true)}
                aria-label="CLI 入参配置"
                title={!cursorTriadReady ? cursorWorkbenchReadinessHint || '打开 CLI 入参配置' : 'CLI 入参配置'}
              >
                <IconCliParams />
                <span className="btn-editor-cli-params-text">入参</span>
              </button>
              <button
                type="button"
                className="btn-editor-secondary"
                disabled={copyBusy}
                title={
                  !cursorTriadReady
                    ? cursorWorkbenchReadinessHint || '请补全「入参」中的模型、工作空间等'
                    : undefined
                }
                onClick={copyCliCommandOnly}
              >
                {copyBusy ? '…' : '复制指令'}
              </button>
              <button
                type="button"
                className="btn-editor-primary"
                disabled={
                  !!cursorRunActiveSessionId
                    ? false
                    : copyBusy || !`${editorContent}${partialText || ''}`.trim() || !cursorTriadReady
                }
                title={
                  !cursorRunActiveSessionId && !cursorTriadReady
                    ? cursorWorkbenchReadinessHint || '请补全「入参」中的模型、工作空间等'
                    : undefined
                }
                onClick={() =>
                  cursorRunActiveSessionId ? void onCursorStopRunClick() : void submitCliPrimary()
                }
              >
                {cursorRunActiveSessionId ? '停止' : copyBusy ? '…' : '发送'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-editor-primary"
              disabled={agentSendingCurrent || !`${editorContent}${partialText || ''}`.trim()}
              onClick={submitAgentPrimary}
            >
              {agentSendingCurrent ? '…' : '发送'}
            </button>
          )}
        </div>
      </div>
    );
  };

  const submitNewMode = (e) => {
    e.preventDefault();
    const ui = useHomeWorkbenchUiStore.getState();
    try {
      if (ui.newModeKind === 'xiaoai') {
        const { modes: next, newId } = addCustomXiaoaiMode({
          name: ui.newModeName,
          commandTemplate: ui.newXiaoaiTemplate,
          ...(ui.newCliAngleSlotsPreset != null ? { angleSlots: ui.newCliAngleSlotsPreset } : {}),
        });
        setModes(next);
        setActiveModeId(newId);
        ui.setNewModeName('');
        ui.setNewXiaoaiTemplate('');
        ui.setNewCliAngleSlotsPreset(null);
        ui.setModeModalOpen(false);
        setStatus('已添加终端目标');
      } else {
        const { modes: next, newId } = addCustomHttpMode({
          name: ui.newModeName,
          requestUrl: ui.newHttpUrl,
          httpProtocol: ui.newHttpProtocol,
        });
        setModes(next);
        setActiveModeId(newId);
        ui.setNewModeName('');
        ui.setNewHttpUrl('');
        ui.setNewHttpProtocol('openai_chat');
        ui.setNewCliAngleSlotsPreset(null);
        ui.setModeModalOpen(false);
        setStatus('已添加网络目标');
      }
    } catch (err) {
      setStatus(err.message || '添加失败');
    }
  };

  const onDeleteCustomMode = (id) => {
    if (!window.confirm('删除该自定义模式？其对话记录也会从当前页面清空。')) return;
    removeThreadId(id);
    removeAllAgentThreadIdsForMode(id);
    const next = removeCustomMode(id);
    setModes(next);
    setChatByModeId((s) => {
      const c = { ...s };
      delete c[id];
      return c;
    });
    if (activeModeId === id) {
      setActiveModeId(next[0]?.id);
    }
    setStatus('已删除自定义模式');
  };

  const recording = phase === 'recording';
  const busy = phase === 'connecting';
  const listening = recording || busy;
  const customModes = modes.filter((m) => !m.builtIn);
  /** Cursor/Qoder 工作台：≥2 个会话时用「对话 | 纵向会话 | 输出」三栏，避免与横向 Tab 抢宽 */
  const cursorUseSessionRail = isCliWorkbench && workbenchSplitTabIds.length >= 2;

  const onCliTemplateChange = (v) => {
    if (!activeMode?.id || activeMode.kind !== 'cli') return;
    if (activeMode.cliVariant === 'cursor' || activeMode.cliVariant === 'qoder') return;
    if (activeMode.cliVariant === 'xiaoai') {
      const merged = mergeAngleSlotsWithDefaults(v, activeMode.angleSlots || []);
      setModes(updateCliModeFields(activeMode.id, { cliTemplate: v, angleSlots: merged }));
      return;
    }
    setModes(updateCliModeFields(activeMode.id, { cliTemplate: v }));
  };

  const onCliAngleSlotsChange = (next) => {
    if (!activeMode?.id || activeMode.kind !== 'cli' || activeMode.cliVariant !== 'xiaoai') return;
    setModes(updateCliModeFields(activeMode.id, { angleSlots: next }));
  };

  const applyWorkbenchCliExample = () => {
    if (!activeMode?.id || activeMode.cliVariant !== 'xiaoai') return;
    const t = DEFAULT_CLI_TEMPLATE;
    setModes(
      updateCliModeFields(activeMode.id, {
        cliTemplate: t,
        angleSlots: buildAllCustomAngleSlots(t),
      })
    );
  };

  const onCliWorkspaceChange = (v) => {
    if (!activeMode?.id || activeMode.kind !== 'cli' || activeMode.cliVariant === 'xiaoai') return;
    setModes(updateCliModeFields(activeMode.id, { cliWorkspace: v }));
  };

  const onHttpUrlChange = (v) => {
    if (!activeMode?.id || activeMode.kind !== 'http' || activeMode.builtIn) return;
    setModes(updateHttpModeFields(activeMode.id, { requestUrl: v }));
  };

  const onHttpProtocolChange = (v) => {
    if (!activeMode?.id || activeMode.kind !== 'http' || activeMode.builtIn) return;
    setModes(updateHttpModeFields(activeMode.id, { httpProtocol: v }));
  };

  return (
    <div
      className={`home-page home-page--compact ${isAgent || isCliWorkbench ? 'home-page--split' : ''}`}
    >
      <div
        className={`home-card ${isAgent || isCliWorkbench ? 'home-card--with-agent' : ''}${cursorUseSessionRail ? ' home-card--cursor-session-rail' : ''}${inputPaneCollapsed && (isAgent || isCliWorkbench) ? ' home-card--input-collapsed' : ''}`}
      >
        <div className="home-card-main">
          <header className="top">
            <div className="top-control-row">
              <div className="top-spacer" aria-hidden />
              <button
                type="button"
                className={`play-toggle ${listening ? 'recording' : ''}`}
                onClick={toggleRecord}
                aria-label={listening ? '停止识别' : '开始识别'}
              >
                {listening ? <IconPause /> : <IconPlay />}
              </button>
              <div className="top-mode-controls">
                <WorkModeSelect
                  modes={modes}
                  value={activeModeId}
                  onChange={onSelectMode}
                  onAddCustom={openAddCustomModeModal}
                />
              </div>
            </div>
            <p className="top-voice-hint" title="来自当前目标的「识别结束策略」配置">
              {voiceControlHint}
            </p>
            <p className={`status ${listening ? 'recording' : ''}`}>{status}</p>
          </header>

          <section className="bottom">
            <div className="panel-head">
              <div className="panel-title">
                <h2 className="panel-title-heading">
                  {isAgent || isCliWorkbench
                    ? '输入'
                    : isHttp
                      ? '正文（请求内容）'
                      : isCli
                        ? isXiaoaiCli
                          ? '段落（指令占位）'
                          : '段落（命令占位）'
                        : '正文'}
                </h2>
                {(isCli && !isCliWorkbench) || isHttp ? (
                  <select
                    className="panel-session-select"
                    value={asrSessionId || ''}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (!v) {
                        clearAsrSession();
                        setStatus('还没选会话；开始识别时会自动新建一个');
                        return;
                      }
                      assignAsrSession(v);
                      setStatus('已选择已有会话，段落将写入该会话');
                    }}
                    onFocus={() => {
                      if (phase !== 'idle' || workspacePickLoading) return;
                      loadWorkspacePickSessions();
                    }}
                    disabled={phase !== 'idle'}
                    aria-label="选择会话（段落写入目标）"
                    title={workspacePickErr || undefined}
                  >
                    <option value="">未选会话</option>
                    {workspacePickOptions.map((s) => {
                      const id = String(s.id ?? '');
                      return (
                        <option key={id} value={id}>
                          {formatWorkbenchSessionLabel(s)}
                        </option>
                      );
                    })}
                  </select>
                ) : null}
              </div>
              {isAsr || (isCli && !isCliWorkbench) || isHttp ? (
                <div className="panel-head-actions">
                  {isAsr ? (
                    <select
                      ref={asrSessionAttachRef}
                      key={`asr-${workbenchSessionAttachSelectKey}`}
                      className="cursor-workbench-session-attach sr-only-select"
                      aria-label="选择已有会话"
                      value=""
                      disabled={phase !== 'idle' || workspacePickLoading}
                      onFocus={() => {
                        if (phase !== 'idle' || workspacePickLoading) return;
                        loadWorkspacePickSessions();
                      }}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        if (!v) return;
                        assignAsrSession(v);
                        setWorkbenchSessionAttachSelectKey((n) => n + 1);
                        setStatus('已选择已有会话，段落将写入该会话');
                      }}
                      title={workspacePickErr || undefined}
                    >
                      <option value="">已有会话…</option>
                      {workspacePickOptions.map((s) => {
                        const id = String(s.id ?? '');
                        return (
                          <option key={id} value={id}>
                            {formatWorkbenchSessionLabel(s)}
                          </option>
                        );
                      })}
                    </select>
                  ) : null}
                  {isCli ? (
                    <button
                      type="button"
                      className="btn-cli-params-icon"
                      onClick={() => setCliParamsModalOpen(true)}
                      aria-label="CLI 入参配置"
                    >
                      <IconCliParams />
                    </button>
                  ) : null}
                  {quickInputs.length > 0 ? (
                    <button
                      type="button"
                      className="btn-cli-params-icon"
                      onClick={() => setQuickInputsModalOpen(true)}
                      aria-label="打开快捷上下文"
                      title="快捷上下文"
                    >
                      <IconContext />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={
                      isAsr
                        ? 'btn-cursor-toolbar btn-cursor-toolbar--icon btn-cursor-toolbar--icon-plain'
                        : 'btn-new-session'
                    }
                    onClick={onNewAsrSession}
                    disabled={phase !== 'idle'}
                    aria-label="新建会话"
                    title="新建会话"
                  >
                    {isAsr ? <IconPlus /> : '新建会话'}
                  </button>
                  {isAsr ? (
                    <button
                      type="button"
                      className="btn-cursor-toolbar btn-cursor-toolbar--icon btn-cursor-toolbar--icon-plain"
                      disabled={phase !== 'idle' || workspacePickLoading}
                      onClick={() => openSessionPicker('asr')}
                      aria-label="选择已有会话"
                      title="选择已有会话"
                    >
                      <IconClock />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            {isHttp ? (
              <div className="cli-mode-config">
                <label className="cli-mode-label">
                  请求 URL
                  <input
                    type="url"
                    className="cli-mode-workspace"
                    value={activeMode.requestUrl || ''}
                    onChange={(e) => onHttpUrlChange(e.target.value)}
                    placeholder="https://example.com/v1/chat"
                    spellCheck={false}
                  />
                </label>
                <label className="cli-mode-label">
                  协议
                  <select
                    className="cli-mode-workspace"
                    value={activeMode.httpProtocol || 'openai_chat'}
                    onChange={(e) => onHttpProtocolChange(e.target.value)}
                  >
                    <option value="openai_chat">常见聊天接口</option>
                    <option value="agui">流式多事件</option>
                  </select>
                </label>
                <p className="cli-mode-hint">
                  填好地址和协议；对方要允许浏览器访问。额外参数在「目标」里配。
                </p>
              </div>
            ) : null}
            <div className="editor-wrap">
              <div className="editor-body editor-body--stack">
                <div
                  className={`editor-textarea-wrap editor-textarea-wrap--fill ${isAgent || isCliWorkbench ? 'editor-textarea-wrap--agent' : ''}`}
                >
                  {isAsr ? (
                    <button
                      type="button"
                      className="btn-editor-clear"
                      onClick={clearEditor}
                      title="清空编辑区"
                      aria-label="清空编辑区"
                    >
                      清空
                    </button>
                  ) : null}
                  <textarea
                    ref={editorTextareaRef}
                    className="editor"
                    value={editorContent}
                    onChange={(e) => setEditorContent(e.target.value)}
                    onBlur={onEditorBlur}
                    onSelect={captureEditorSelection}
                    onKeyUp={captureEditorSelection}
                    onMouseUp={captureEditorSelection}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      if (e.shiftKey) return;
                      if (e.nativeEvent.isComposing) return;
                      e.preventDefault();
                      if (isCli) {
                        submitCliPrimary();
                        return;
                      }
                      if (isHttp) {
                        submitHttpPrimary();
                        return;
                      }
                      if (isAgent) {
                        submitAgentPrimary();
                        return;
                      }
                      if (isAsr) {
                        copyAndSaveParagraph();
                      }
                    }}
                    placeholder={
                      isAgent
                        ? '输入问题，或使用上方麦克风转写；Enter 发送，Shift+Enter 换行…'
                        : isHttp
                          ? '识别或输入正文；Enter 发送请求，Shift+Enter 换行…'
                          : isCli
                            ? isCliWorkbench
                              ? '识别或输入正文作为 -p 提示词；Enter 发送（保存并复制），Shift+Enter 换行…'
                              : isXiaoaiCli
                                ? '识别或输入正文；Enter 发送，Shift+Enter 换行…'
                                : '识别或输入正文；Enter 发送，Shift+Enter 换行…'
                            : '识别结果会出现在这里，也可直接输入或修改文字…'
                    }
                    spellCheck={false}
                  />
                </div>
                <div className="editor-bottom-composite">
                  {listening && isAsr ? (
                    <div className="editor-recording-strip" aria-live="polite">
                      <span className="editor-recording-badge">{busy ? '连接中' : '识别中'}</span>
                      <div className="editor-recording-partial">
                        <span
                          className={`editor-recording-partial__text${
                            partialText ? '' : ' editor-recording-partial__text--placeholder'
                          }`}
                        >
                          {partialText || (busy ? '正在连接识别服务…' : '')}
                        </span>
                        <VoiceWaveVisualizer
                          active={recording && !micInputMuted}
                          analyserRef={analyserRef}
                          inline
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="editor-bottom-spacer" aria-hidden />
                  )}
                  <div className="editor-bottom-end">
                    {isAsr ? (
                      <>
                        {listening ? (
                          <button
                            type="button"
                            className={`btn-editor-mute ${micInputMuted ? 'btn-editor-mute--on' : ''}`}
                            onClick={() => setMicInputMuted((m) => !m)}
                            aria-pressed={micInputMuted}
                            title={micInputMuted ? '取消静音（恢复识别）' : '静音（暂停识别输入）'}
                            aria-label={micInputMuted ? '取消静音' : '静音'}
                          >
                            {micInputMuted ? <IconMicMuted /> : <IconMic />}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn-editor-primary"
                          disabled={copyBusy}
                          onClick={copyAndSaveParagraph}
                        >
                          {copyBusy ? '…' : '复制并保存'}
                        </button>
                      </>
                    ) : isCli ? (
                      <div className="editor-bottom-cli-actions">
                        {isCliWorkbench ? (
                          <button
                            type="button"
                            className={`btn-editor-cli-params ${!cursorTriadReady ? 'btn-editor-cli-params--needs-attention' : ''}`}
                            onClick={() => setCliParamsModalOpen(true)}
                            aria-label="CLI 入参配置"
                            title={
                              !cursorTriadReady
                                ? cursorWorkbenchReadinessHint || '打开 CLI 入参配置'
                                : 'CLI 入参配置'
                            }
                          >
                            <IconCliParams />
                            <span className="btn-editor-cli-params-text">入参</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn-editor-secondary"
                          disabled={
                            copyBusy || (isCliWorkbench && !cursorTriadReady)
                          }
                          title={
                            isCliWorkbench && !cursorTriadReady
                              ? cursorWorkbenchReadinessHint ||
                                '请补全「入参」中的模型、工作空间等'
                              : undefined
                          }
                          onClick={copyCliCommandOnly}
                        >
                          {copyBusy ? '…' : isXiaoaiCli || isCliWorkbench ? '复制指令' : '复制命令'}
                        </button>
                        {listening ? (
                          <button
                            type="button"
                            className={`btn-editor-mute ${micInputMuted ? 'btn-editor-mute--on' : ''}`}
                            onClick={() => setMicInputMuted((m) => !m)}
                            aria-pressed={micInputMuted}
                            title={micInputMuted ? '取消静音（恢复识别）' : '静音（暂停识别输入）'}
                            aria-label={micInputMuted ? '取消静音' : '静音'}
                          >
                            {micInputMuted ? <IconMicMuted /> : <IconMic />}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn-editor-primary"
                          disabled={
                            isCliWorkbench
                              ? !!cursorRunActiveSessionId
                                ? false
                                : copyBusy ||
                                  !`${editorContent}${partialText || ''}`.trim() ||
                                  !cursorTriadReady
                              : copyBusy || !`${editorContent}${partialText || ''}`.trim()
                          }
                          title={
                            isCliWorkbench && !cursorRunActiveSessionId && !cursorTriadReady
                              ? cursorWorkbenchReadinessHint ||
                                '请补全「入参」中的模型、工作空间等'
                              : undefined
                          }
                          onClick={() =>
                            cursorRunActiveSessionId ? void onCursorStopRunClick() : void submitCliPrimary()
                          }
                        >
                          {cursorRunActiveSessionId ? '停止' : copyBusy ? '…' : '发送'}
                        </button>
                      </div>
                    ) : isHttp ? (
                      <>
                        {listening ? (
                          <button
                            type="button"
                            className={`btn-editor-mute ${micInputMuted ? 'btn-editor-mute--on' : ''}`}
                            onClick={() => setMicInputMuted((m) => !m)}
                            aria-pressed={micInputMuted}
                            title={micInputMuted ? '取消静音（恢复识别）' : '静音（暂停识别输入）'}
                            aria-label={micInputMuted ? '取消静音' : '静音'}
                          >
                            {micInputMuted ? <IconMicMuted /> : <IconMic />}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn-editor-primary"
                          disabled={
                            httpSendingCurrent || !`${editorContent}${partialText || ''}`.trim()
                          }
                          onClick={submitHttpPrimary}
                        >
                          {httpSendingCurrent ? '…' : '发送请求'}
                        </button>
                      </>
                    ) : (
                      <>
                        {listening ? (
                          <button
                            type="button"
                            className={`btn-editor-mute ${micInputMuted ? 'btn-editor-mute--on' : ''}`}
                            onClick={() => setMicInputMuted((m) => !m)}
                            aria-pressed={micInputMuted}
                            title={micInputMuted ? '取消静音（恢复识别）' : '静音（暂停识别输入）'}
                            aria-label={micInputMuted ? '取消静音' : '静音'}
                          >
                            {micInputMuted ? <IconMicMuted /> : <IconMic />}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn-editor-primary"
                          disabled={
                            agentSendingCurrent || !`${editorContent}${partialText || ''}`.trim()
                          }
                          onClick={submitAgentPrimary}
                        >
                          {agentSendingCurrent ? '…' : '发送'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {isAgent ? (
          <aside className="agent-panel agent-panel--cursor-workbench" aria-label="对话">
            <div className="cursor-workbench-top">
              <select
                ref={agentSessionAttachRef}
                key={`agent-${workbenchSessionAttachSelectKey}`}
                className="cursor-workbench-session-attach cursor-workbench-session-attach--toolbar sr-only-select"
                aria-label="打开已有会话到新标签"
                value=""
                disabled={phase !== 'idle'}
                onFocus={() => {
                  if (phase !== 'idle' || workspacePickLoading) return;
                  loadWorkspacePickSessions();
                }}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (v) {
                    assignAsrSession(v);
                    setWorkbenchSessionAttachSelectKey((n) => n + 1);
                    setStatus('已选择已有会话，对话与段落将归入该会话');
                  }
                }}
                title={workspacePickErr || undefined}
              >
                <option value="">已有会话…</option>
                {workspacePickOptions.map((s) => {
                  const id = String(s.id ?? '');
                  return (
                    <option key={id} value={id}>
                      {formatWorkbenchSessionLabel(s)}
                    </option>
                  );
                })}
              </select>
              <div className="cursor-workbench-tabstrip cursor-workbench-tabstrip--with-actions" role="tablist" aria-label="会话">
                <button
                  type="button"
                  className="cursor-workbench-collapse-toggle"
                  aria-label={inputPaneCollapsed ? '展开输入区' : '折叠输入区'}
                  title={inputPaneCollapsed ? '展开输入区' : '折叠输入区'}
                  onClick={() => setInputPaneCollapsed((v) => !v)}
                >
                  <IconSidebarToggle collapsed={inputPaneCollapsed} />
                </button>
                {inputPaneCollapsed ? (
                  <div className="cursor-workbench-center-controls">
                    <button
                      type="button"
                      className={`play-toggle ${listening ? 'recording' : ''}`}
                      onClick={toggleRecord}
                      aria-label={listening ? '停止识别' : '开始识别'}
                    >
                      {listening ? <IconPause /> : <IconPlay />}
                    </button>
                    <div className="cursor-workbench-center-mode-select">
                      <WorkModeSelect
                        modes={modes}
                        value={activeModeId}
                        onChange={onSelectMode}
                        onAddCustom={openAddCustomModeModal}
                      />
                    </div>
                  </div>
                ) : null}
                <div
                  className={`cursor-workbench-tabs-scroll cursor-workbench-tabs-scroll--strip ${workbenchSplitTabIds.length === 0 ? 'cursor-workbench-tabs-scroll--vcenter' : ''}`}
                >
                  {workbenchSplitTabIds.map((tid) => {
                    const active = String(asrSessionId || '') === String(tid);
                    return (
                      <div
                        key={tid}
                        className={`cursor-workbench-tab ${active ? 'cursor-workbench-tab--active' : ''}`}
                        role="none"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={active}
                          className="cursor-workbench-tab-main"
                          title={formatWorkbenchSessionLabel(
                            workspacePickSessions.find((s) => String(s.id) === String(tid)) || {
                              id: tid,
                            }
                          )}
                          onClick={() => assignAsrSession(tid)}
                        >
                          {getCursorTabTitle(tid)}
                        </button>
                        <button
                          type="button"
                          className="cursor-workbench-tab-close"
                          aria-label={`关闭 ${getCursorTabTitle(tid)}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void closeCursorWorkbenchTab(tid);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="cursor-workbench-tabstrip-actions">
                  <button
                    type="button"
                    className="btn-cursor-toolbar btn-cursor-toolbar--icon btn-cursor-toolbar--icon-plain"
                    disabled={phase !== 'idle'}
                    onClick={onNewAsrSession}
                    aria-label="新建会话"
                    title="新建会话"
                  >
                    <IconPlus />
                  </button>
                  <button
                    type="button"
                    className="btn-cursor-toolbar btn-cursor-toolbar--icon btn-cursor-toolbar--icon-plain"
                    disabled={phase !== 'idle' || workspacePickLoading}
                    onClick={() => openSessionPicker('agent')}
                    aria-label="选择已有会话"
                    title="选择已有会话"
                  >
                    <IconClock />
                  </button>
                </div>
              </div>
            </div>
            <div className="agent-messages" ref={agentMessagesRef}>
              {agentMessages.length === 0 ? (
                <p className="agent-empty">发送第一条消息后，回复会显示在这里。</p>
              ) : (
                agentMessages.map((m, i) => {
                  const err = Boolean((m as { error?: boolean }).error);
                  const streamPending = Boolean((m as { streamPending?: boolean }).streamPending);
                  return (
                    <div
                      key={`${workbenchActivityKey}-msg-${i}`}
                      className={`agent-bubble agent-bubble--${m.role}${err ? ' agent-bubble--error' : ''}`}
                    >
                      <div className="agent-bubble-role">{m.role === 'user' ? '你' : '助手'}</div>
                      <div
                        className={`agent-bubble-text ${m.role === 'assistant' && !err && !streamPending ? 'agent-bubble-text--md' : ''}`}
                      >
                        {m.role === 'assistant' ? (
                          err ? (
                            <div className="agent-bubble-error-body" role="alert">
                              {m.content}
                            </div>
                          ) : streamPending ? (
                            <div className="agent-stream-skeleton" aria-busy="true" aria-label="正在生成回复">
                              <div className="agent-stream-skeleton-head">
                                <span className="agent-stream-skeleton-spinner" aria-hidden />
                                <span className="agent-stream-skeleton-label">正在生成回复…</span>
                              </div>
                              <span className="agent-stream-skeleton-line" />
                              <span className="agent-stream-skeleton-line agent-stream-skeleton-line--short" />
                            </div>
                          ) : (
                            <>
                              {Array.isArray(m.aguiTools) && m.aguiTools.length > 0 ? (
                                <div className="agent-tool-trace" aria-label="工具调用">
                                  {m.aguiTools.map((t) => (
                                    <div
                                      key={t.toolCallId}
                                      className={`agent-tool-card${t.result && t.result.toLowerCase().includes('拒绝') ? ' agent-tool-card--error' : ''}`}
                                    >
                                      <div className="agent-tool-card-head">
                                        <span className="agent-tool-card-name">{t.toolCallName}</span>
                                        <span className="sessions-muted">{t.toolCallId.slice(0, 8)}…</span>
                                      </div>
                                      {t.args ? (
                                        <pre className="agent-tool-card-pre" aria-label="参数">
                                          {t.args}
                                        </pre>
                                      ) : null}
                                      {t.result ? (
                                        <pre className="agent-tool-card-pre" aria-label="结果">
                                          {t.result}
                                        </pre>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              <AssistantMarkdown text={m.content} />
                            </>
                          )
                        ) : (
                          m.content
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {renderCollapsedOutputComposer()}
          </aside>
        ) : isCliWorkbench ? (
          <aside
            className={`agent-panel agent-panel--cursor-workbench${cursorUseSessionRail ? ' agent-panel--cursor-workbench-3col' : ''}`}
            aria-label="对话"
          >
            <div className="cursor-workbench-top">
              <select
                ref={cliSessionAttachRef}
                key={workbenchSessionAttachSelectKey}
                className="cursor-workbench-session-attach cursor-workbench-session-attach--toolbar sr-only-select"
                aria-label="打开已有会话到新标签"
                value=""
                disabled={phase !== 'idle'}
                onFocus={() => {
                  if (phase !== 'idle' || workspacePickLoading) return;
                  loadWorkspacePickSessions();
                }}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (v) {
                    assignAsrSession(v);
                    setWorkbenchSessionAttachSelectKey((n) => n + 1);
                    setStatus('已选择已有会话，段落将写入该会话');
                  }
                }}
                title={workspacePickErr || undefined}
              >
                <option value="">已有会话…</option>
                {workspacePickOptions.map((s) => {
                  const id = String(s.id ?? '');
                  return (
                    <option key={id} value={id}>
                      {formatWorkbenchSessionLabel(s)}
                    </option>
                  );
                })}
              </select>
              <div className="cursor-workbench-tabstrip cursor-workbench-tabstrip--with-actions" role="tablist" aria-label="会话">
                <button
                  type="button"
                  className="cursor-workbench-collapse-toggle"
                  aria-label={inputPaneCollapsed ? '展开输入区' : '折叠输入区'}
                  title={inputPaneCollapsed ? '展开输入区' : '折叠输入区'}
                  onClick={() => setInputPaneCollapsed((v) => !v)}
                >
                  <IconSidebarToggle collapsed={inputPaneCollapsed} />
                </button>
                {inputPaneCollapsed ? (
                  <div className="cursor-workbench-center-controls">
                    <button
                      type="button"
                      className={`play-toggle ${listening ? 'recording' : ''}`}
                      onClick={toggleRecord}
                      aria-label={listening ? '停止识别' : '开始识别'}
                    >
                      {listening ? <IconPause /> : <IconPlay />}
                    </button>
                    <div className="cursor-workbench-center-mode-select">
                      <WorkModeSelect
                        modes={modes}
                        value={activeModeId}
                        onChange={onSelectMode}
                        onAddCustom={openAddCustomModeModal}
                      />
                    </div>
                  </div>
                ) : null}
                {!cursorUseSessionRail ? (
                  <div
                    className={`cursor-workbench-tabs-scroll cursor-workbench-tabs-scroll--strip ${workbenchSplitTabIds.length === 0 ? 'cursor-workbench-tabs-scroll--vcenter' : ''}`}
                  >
                    {workbenchSplitTabIds.map((tid) => {
                      const active = String(asrSessionId || '') === String(tid);
                      return (
                        <div
                          key={tid}
                          className={`cursor-workbench-tab ${active ? 'cursor-workbench-tab--active' : ''}`}
                          role="none"
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={active}
                            className="cursor-workbench-tab-main"
                            title={formatWorkbenchSessionLabel(
                              workspacePickSessions.find((s) => String(s.id) === String(tid)) || {
                                id: tid,
                              }
                            )}
                            onClick={() => assignAsrSession(tid)}
                          >
                            {getCursorTabTitle(tid)}
                          </button>
                          <button
                            type="button"
                            className="cursor-workbench-tab-close"
                            aria-label={`关闭 ${getCursorTabTitle(tid)}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void closeCursorWorkbenchTab(tid);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="cursor-workbench-tabs-scroll cursor-workbench-tabs-scroll--strip cursor-workbench-tabs-scroll--actions-only" />
                )}
                <div className="cursor-workbench-tabstrip-actions">
                  <button
                    type="button"
                    className="btn-cursor-toolbar btn-cursor-toolbar--icon btn-cursor-toolbar--icon-plain"
                    disabled={phase !== 'idle'}
                    onClick={onNewAsrSession}
                    aria-label="新建会话"
                    title="新建会话"
                  >
                    <IconPlus />
                  </button>
                  <button
                    type="button"
                    className="btn-cursor-toolbar btn-cursor-toolbar--icon btn-cursor-toolbar--icon-plain"
                    disabled={phase !== 'idle' || workspacePickLoading}
                    onClick={() => openSessionPicker('cli')}
                    aria-label="选择已有会话"
                    title="选择已有会话"
                  >
                    <IconClock />
                  </button>
                </div>
              </div>
            </div>
            {cursorUseSessionRail ? (
              <>
                <div className="cursor-workbench-3col-shell">
                  <div className="cursor-workbench-3col-body">
                  <nav
                    className="cursor-workbench-col cursor-workbench-col--sessions"
                    aria-label="会话列表"
                  >
                    <div className="cursor-workbench-session-rail-inner" role="tablist">
                      {workbenchSplitTabIds.map((tid) => {
                          const active = String(asrSessionId || '') === String(tid);
                          const runningHere =
                            cursorStreamLoading &&
                            cursorRunActiveSessionId != null &&
                            String(cursorRunActiveSessionId) === String(tid);
                          return (
                            <div
                              key={tid}
                              className={`cursor-workbench-rail-row ${active ? 'cursor-workbench-rail-row--active' : ''}`}
                              role="none"
                            >
                              <button
                                type="button"
                                role="tab"
                                aria-selected={active}
                                className="cursor-workbench-rail-main"
                                title={formatWorkbenchSessionLabel(
                                  workspacePickSessions.find((s) => String(s.id) === String(tid)) || {
                                    id: tid,
                                  }
                                )}
                                onClick={() => assignAsrSession(tid)}
                              >
                                {runningHere ? (
                                  <span className="cursor-workbench-rail-pulse" aria-hidden />
                                ) : null}
                                <span className="cursor-workbench-rail-label">{getCursorTabTitle(tid)}</span>
                              </button>
                              <button
                                type="button"
                                className="cursor-workbench-rail-close"
                                aria-label={`关闭 ${getCursorTabTitle(tid)}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void closeCursorWorkbenchTab(tid);
                                }}
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </nav>
                  <div className="cursor-workbench-col cursor-workbench-col--conversation">
                    {asrSessionId &&
                    SESSION_UUID_RE.test(String(asrSessionId)) &&
                    !cursorQuietPrepare &&
                    cursorEnsureStatus === 'error' ? (
                      <div className="cursor-external-thread-panel">
                        <div className="cursor-external-thread-error-block">
                          <p className="sessions-error sessions-alert">{cursorEnsureErrorMsg}</p>
                          <button
                            type="button"
                            className="btn-editor-secondary"
                            onClick={() => setCursorEnsureRetryNonce((n) => n + 1)}
                          >
                            重试
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div
                      className="agent-messages agent-messages--cursor-workbench-split"
                      aria-label="对话"
                    >
                      {cursorWorkbenchDbMessages.length > 0 ? (
                        <div className="cursor-workbench-db-history" aria-label="已落库的对话历史">
                          {cursorWorkbenchDbMessages.map((m, i) => (
                            <div
                              key={m.id ? String(m.id) : `db-${i}-${m.role}`}
                              className={`agent-bubble ${m.role === 'user' ? 'agent-bubble--user' : 'agent-bubble--assistant'}`}
                            >
                              <div className="agent-bubble-role">{m.role === 'user' ? '你' : '助手'}</div>
                              {m.role === 'assistant' ? (
                                <div className="agent-bubble-text agent-bubble-text--cursor-cli-nested">
                                  <CursorWorkbenchDbAssistantBody
                                    content={m.content}
                                    deliveryType={
                                      activeMode?.cliVariant === 'qoder' ? 'qoder_cli' : 'cursor_cli'
                                    }
                                  />
                                </div>
                              ) : (
                                <div
                                  className="agent-bubble-text"
                                  style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                                >
                                  {m.content}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {cursorPendingUserPrompt ? (
                        <div className="agent-bubble agent-bubble--user">
                          <div className="agent-bubble-role">你</div>
                          <div className="agent-bubble-text">{cursorPendingUserPrompt}</div>
                        </div>
                      ) : null}
                      {cursorSidePanelLoading ? (
                        <div className="agent-bubble agent-bubble--assistant">
                          <div className="agent-bubble-role">助手</div>
                          <div className="agent-bubble-text">
                            <div
                              className="agent-stream-skeleton"
                              aria-busy="true"
                              aria-label={CURSOR_CLI_PANEL_STATUS_PREPARING}
                            >
                              <div className="agent-stream-skeleton-head">
                                <span className="agent-stream-skeleton-spinner" aria-hidden />
                                <span className="agent-stream-skeleton-label">正在准备…</span>
                              </div>
                              <span className="agent-stream-skeleton-line" />
                              <span className="agent-stream-skeleton-line agent-stream-skeleton-line--short" />
                            </div>
                          </div>
                        </div>
                      ) : null}
                      {cursorWorkbenchDbMessages.length === 0 &&
                      !cursorPendingUserPrompt &&
                      !cursorSidePanelLoading ? (
                        <p className="agent-empty">尚无已落库对话；发送后记录将显示在此栏。</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="cursor-workbench-col cursor-workbench-col--output">
                    <div
                      className="agent-messages agent-messages--cursor-workbench-split"
                      ref={cursorPanelScrollRef}
                      aria-label="CLI 输出"
                    >
                      {String(cursorTailInfo).trim() || String(sanitizedCursorStderr).trim() ? (
                        <CursorCliStructuredView
                          parsed={cursorParsedOutput}
                          stderr={sanitizedCursorStderr}
                          formatHint={cursorStreamFormatHint}
                        />
                      ) : null}
                      {!cursorSidePanelLoading &&
                      !String(cursorTailInfo).trim() &&
                      !String(sanitizedCursorStderr).trim() ? (
                        <p className="agent-empty">当前会话的 CLI 流式输出将显示在此栏。</p>
                      ) : null}
                    </div>
                  </div>
                  </div>
                </div>
                {renderCollapsedOutputComposer()}
              </>
            ) : (
              <>
                {asrSessionId &&
                SESSION_UUID_RE.test(String(asrSessionId)) &&
                !cursorQuietPrepare &&
                cursorEnsureStatus === 'error' ? (
                  <div className="cursor-external-thread-panel">
                    <div className="cursor-external-thread-error-block">
                      <p className="sessions-error sessions-alert">{cursorEnsureErrorMsg}</p>
                      <button
                        type="button"
                        className="btn-editor-secondary"
                        onClick={() => setCursorEnsureRetryNonce((n) => n + 1)}
                      >
                        重试
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="agent-messages" ref={cursorPanelScrollRef}>
                  {cursorWorkbenchDbMessages.length > 0 ? (
                    <div className="cursor-workbench-db-history" aria-label="已落库的对话历史">
                      {cursorWorkbenchDbMessages.map((m, i) => (
                        <div
                          key={m.id ? String(m.id) : `db-${i}-${m.role}`}
                          className={`agent-bubble ${m.role === 'user' ? 'agent-bubble--user' : 'agent-bubble--assistant'}`}
                        >
                          <div className="agent-bubble-role">{m.role === 'user' ? '你' : '助手'}</div>
                          {m.role === 'assistant' ? (
                            <div className="agent-bubble-text agent-bubble-text--cursor-cli-nested">
                              <CursorWorkbenchDbAssistantBody
                                content={m.content}
                                deliveryType={
                                  activeMode?.cliVariant === 'qoder' ? 'qoder_cli' : 'cursor_cli'
                                }
                              />
                            </div>
                          ) : (
                            <div
                              className="agent-bubble-text"
                              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                            >
                              {m.content}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {cursorPendingUserPrompt ||
                  cursorSidePanelLoading ||
                  String(cursorTailInfo).trim() ||
                  String(sanitizedCursorStderr).trim() ? (
                    <>
                      {cursorPendingUserPrompt ? (
                        <div className="agent-bubble agent-bubble--user">
                          <div className="agent-bubble-role">你</div>
                          <div className="agent-bubble-text">{cursorPendingUserPrompt}</div>
                        </div>
                      ) : null}
                      {cursorSidePanelLoading ? (
                        <div
                          className="cursor-stream-loading cursor-stream-loading--prepare"
                          role="status"
                          aria-live="polite"
                        >
                          <span className="cursor-stream-loading-pulse" aria-hidden />
                          {CURSOR_CLI_PANEL_STATUS_PREPARING}
                        </div>
                      ) : null}
                      {String(cursorTailInfo).trim() || String(sanitizedCursorStderr).trim() ? (
                        <CursorCliStructuredView
                          parsed={cursorParsedOutput}
                          stderr={sanitizedCursorStderr}
                          formatHint={cursorStreamFormatHint}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {cursorWorkbenchDbMessages.length === 0 &&
                  !cursorPendingUserPrompt &&
                  !cursorSidePanelLoading &&
                  !String(cursorTailInfo).trim() &&
                  !String(sanitizedCursorStderr).trim() ? (
                    <p className="agent-empty">发送第一条消息后，回复会显示在这里。</p>
                  ) : null}
                </div>
                {renderCollapsedOutputComposer()}
              </>
            )}
          </aside>
        ) : null}
      </div>

      <HomeWorkbenchModals
        isCli={isCli}
        quickInputs={quickInputs}
        insertQuickContent={insertQuickContent}
        isCliWorkbench={isCliWorkbench}
        isXiaoaiCli={isXiaoaiCli}
        cursorWorkbenchTriadLabels={cursorWorkbenchTriadLabels}
        cliWorkspaceFallbackStr={cliWorkspaceFallbackStr}
        cursorTriadInputs={cursorTriadInputs}
        patchCursorTriadField={patchCursorTriadField}
        activeMode={activeMode}
        onCliTemplateChange={onCliTemplateChange}
        onCliWorkspaceChange={onCliWorkspaceChange}
        onCliAngleSlotsChange={onCliAngleSlotsChange}
        applyWorkbenchCliExample={applyWorkbenchCliExample}
      />

      <HomeWorkbenchAddModeModal
        customModes={customModes}
        onSubmit={submitNewMode}
        onDeleteCustomMode={onDeleteCustomMode}
      />
    </div>
  );
}
