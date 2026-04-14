// @ts-nocheck — large workbench surface; tighten types incrementally
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  apiAgentChatTurnStream,
  apiCreateSession,
  apiDeleteChatMessages,
  apiDeleteSession,
  apiEnsureSessionExternalThread,
  apiSaveParagraph,
  fetchChatThread,
  fetchCursorSessionPaths,
  fetchQuickInputs,
  fetchServerMeta,
  fetchSessionList,
} from '../api';
import CliEnvEditor from '../components/CliEnvEditor';
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
  normalizeTranscriptText,
  stripMatchedPhrase,
} from '../stores/voiceSettingsStore';
import {
  OUTPUT_VOICE_DEFAULTS,
  formatOutputVoiceControlHint,
} from '../outputVoiceControl';
import VoiceWaveVisualizer from '../components/VoiceWaveVisualizer';
import CliAngleSlotsEditor from '../components/CliAngleSlotsEditor';
import CliInstructionHeader from '../components/CliInstructionHeader';
import {
  appendCursorAutoResume,
  buildAllCustomAngleSlots,
  buildAngleCliCommand,
  buildCliCommand,
  mergeAngleSlotsWithDefaults,
} from '../cliSubstitute';
import {
  addCustomHttpMode,
  addCustomXiaoaiMode,
  DEFAULT_CLI_TEMPLATE,
  getAllModes,
  loadActiveModeId,
  removeCustomMode,
  saveActiveModeId,
  updateCliModeFields,
  updateHttpModeFields,
} from '../workModes';
import {
  CURSOR_CLI_DEFAULT_TEMPLATE,
  CURSOR_EXTERNAL_THREAD_PROVIDER,
  saveBuiltinOutputOverride,
  updateCustomOutput,
} from '../outputCatalog';
import {
  getResolvedExternalThreadProvider,
  setResolvedExternalThreadProviderFromServer,
} from '../resolvedExternalThread';
import {
  cursorCliFillHint,
  cursorCliReady,
  cursorCliReadyIgnoringProvisioningDeps,
  cursorTriadCustomValues,
  cursorTriadLabelsInTemplate,
  deriveCursorCliWorkspace,
  getMergedCursorSlots,
} from '../cursorTriad';
import {
  CURSOR_AGENT_MODEL_PRESETS,
  CURSOR_AGENT_MODEL_SELECT_OTHER,
  cursorAgentModelSelectValue,
} from '../cursorAgentModels';
import CursorCliStructuredView from '../components/CursorCliStructuredView';
import {
  looksLikeCursorStreamJson,
  parseCliOutputForDelivery,
} from '../cliOutputFormats/index';
import '../App.css';
import WorkModeSelect from '../components/WorkModeSelect';
import pcmWorkletUrl from '../audio/pcmCaptureProcessor.ts?url';

/**
 * 语音识别 WS：浏览器只连本机 Node；Node 再连百炼（见 server/index.js）。
 * - 开发：vite.config 注入 __RESO_DEV_ASR_WS_URL__，直连后端端口，避免 Vite 代理偶发 Invalid frame header。
 * - 生产：同源的 /ws/asr，或 VITE_WS_URL 指定后端再拼 /ws/asr。
 */
function wsUrl() {
  if (typeof __RESO_DEV_ASR_WS_URL__ === 'string' && __RESO_DEV_ASR_WS_URL__) {
    return __RESO_DEV_ASR_WS_URL__;
  }
  if (import.meta.env.VITE_WS_URL) {
    try {
      const base = new URL(import.meta.env.VITE_WS_URL);
      base.pathname = '/ws/asr';
      return base.toString();
    } catch {
      /* fall through */
    }
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/asr`;
}

function cursorTailWsUrl() {
  if (typeof __RESO_DEV_CURSOR_WS_URL__ === 'string' && __RESO_DEV_CURSOR_WS_URL__) {
    return __RESO_DEV_CURSOR_WS_URL__;
  }
  if (import.meta.env.VITE_WS_URL) {
    try {
      const base = new URL(import.meta.env.VITE_WS_URL);
      base.pathname = '/ws/cursor-tail';
      return base.toString();
    } catch {
      /* fall through */
    }
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/cursor-tail`;
}

const SESSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Agent 消息列表在 chatByModeId 中的键（按模式 + 数据库会话） */
function agentChatStateKey(modeId, sessionId) {
  const sid =
    sessionId != null && SESSION_UUID_RE.test(String(sessionId).trim())
      ? String(sessionId).trim()
      : '';
  return `${modeId}::${sid || '_none_'}`;
}

function formatWorkbenchSessionLabel(s) {
  const title = (s.list_title || s.preview || '').trim();
  const shortId = typeof s.id === 'string' ? s.id.slice(0, 8) : '';
  const nRaw = s.paragraph_count ?? s.paragraphCount;
  const n =
    typeof nRaw === 'number' && !Number.isNaN(nRaw)
      ? nRaw
      : typeof nRaw === 'string' && nRaw.trim()
        ? Number(nRaw.trim())
        : null;
  const seg = typeof n === 'number' && Number.isFinite(n) ? ` · ${Math.max(0, Math.floor(n))} 段` : '';
  if (title) return `${title} · ${shortId}…${seg}`;
  if (typeof n === 'number' && Number.isFinite(n)) return `会话 ${shortId}… · ${Math.max(0, Math.floor(n))} 段`;
  return `会话 ${shortId}…`;
}

function micErrorMessage(err) {
  if (!err) return '无法访问麦克风';
  const name = err.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return '麦克风权限被拒绝：请在浏览器地址栏左侧允许本站使用麦克风，或到系统设置里为本浏览器开启麦克风权限。';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '未检测到麦克风设备，请连接麦克风或检查系统输入设备。';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '麦克风被其他应用占用或无法打开，请关闭其他使用麦克风的程序后重试。';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return '当前浏览器不支持所请求的麦克风参数，已自动尝试兼容模式。若仍失败请更换浏览器。';
  }
  if (name === 'SecurityError') {
    return '安全限制：请使用 https 或 http://localhost / 127.0.0.1 访问本页，不要用局域网 IP 打开（部分浏览器会禁止麦克风）。';
  }
  return err.message || '无法访问麦克风';
}

async function acquireMicStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      '当前环境不支持 getUserMedia。请使用较新版本的 Chrome / Edge / Safari，并确保通过 localhost 或 https 访问。'
    );
  }
  if (!window.isSecureContext) {
    throw new Error(
      '非安全上下文：请用 http://localhost:端口 或 https 打开页面；用 http://192.168.x.x 访问时多数浏览器不允许麦克风。'
    );
  }
  const tryConstraints = [
    { audio: true },
    {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    },
    {
      audio: {
        channelCount: { ideal: 1 },
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
      },
    },
  ];
  let lastErr;
  for (const c of tryConstraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden>
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function IconCliParams() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M8 18h2M14 11h2M17 16h2" />
    </svg>
  );
}

/** 根据当前模式拼出 CLI 字符串；cursor 未填齐时返回 error */
function computeWorkbenchCliCommand(
  mode,
  paragraphText,
  sessionId,
  cursorFilePaths,
  externalThreadId = '',
  workspaceFallback = ''
) {
  if (!mode || mode.kind !== 'cli') return { error: '非 CLI 模式' };
  const text = String(paragraphText ?? '');
  const sid = sessionId == null || sessionId === '' ? '' : String(sessionId);
  const ws =
    String(mode.cliWorkspace || '').trim() || String(workspaceFallback || '').trim();
  const tmpl =
    mode.cliVariant === 'cursor'
      ? mode.cliTemplate || CURSOR_CLI_DEFAULT_TEMPLATE
      : mode.cliTemplate || DEFAULT_CLI_TEMPLATE;

  if (mode.cliVariant === 'cursor') {
    const mergedSlots = getMergedCursorSlots(mode);
    const ctx = {
      paragraph: text,
      sessionId: sid,
      workspace: ws,
      cursorStdoutAbsPath: cursorFilePaths?.infoTxtAbs || '',
      cursorStderrAbsPath: cursorFilePaths?.errorTxtAbs || '',
      externalThreadId: String(externalThreadId ?? '').trim(),
    };
    if (!cursorCliReady(tmpl, mode.angleSlots || [], ctx)) {
      return { error: cursorCliFillHint(tmpl, mode.angleSlots || [], ctx) };
    }
    const built = buildAngleCliCommand(tmpl, mergedSlots, ctx);
    const cmd = appendCursorAutoResume(built, ctx.externalThreadId);
    return { cmd };
  }
  if (mode.cliVariant === 'xiaoai') {
    const cmd = buildAngleCliCommand(tmpl, mode.angleSlots || [], {
      paragraph: text,
      sessionId: sid,
      workspace: ws,
    });
    return { cmd };
  }
  const cmd = buildCliCommand(tmpl, {
    paragraph: text,
    sessionId: sid,
    workspace: ws,
  });
  return { cmd };
}

export default function HomePage() {
  const [modes, setModes] = useState(() => getAllModes());
  const [activeModeId, setActiveModeId] = useState(() => {
    const all = getAllModes();
    const id = loadActiveModeId();
    return all.some((m) => m.id === id) ? id : all[0]?.id;
  });
  const [phase, setPhase] = useState('idle');
  const [status, setStatus] = useState('请新建会话或开始识别');
  const [editorContent, setEditorContent] = useState('');
  const [partialText, setPartialText] = useState('');
  const [copyBusy, setCopyBusy] = useState(false);
  const [chatByModeId, setChatByModeId] = useState({});
  /** 按「模式 + 数据库会话」隔离在途请求，新建/切换会话不阻塞其它会话的 Agent 流式请求 */
  const [agentSendingByKey, setAgentSendingByKey] = useState({});
  const [httpSendingByKey, setHttpSendingByKey] = useState({});
  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [cliParamsModalOpen, setCliParamsModalOpen] = useState(false);
  const [newModeName, setNewModeName] = useState('');
  const [newModeKind, setNewModeKind] = useState('http');
  const [newHttpUrl, setNewHttpUrl] = useState('');
  const [newHttpProtocol, setNewHttpProtocol] = useState('openai_chat');
  const [newXiaoaiTemplate, setNewXiaoaiTemplate] = useState('');
  /** 非 null 时：添加 CLI 输出时用该槽位种子（如「示例」全自定义） */
  const [newCliAngleSlotsPreset, setNewCliAngleSlotsPreset] = useState(null);
  const [asrSessionId, setAsrSessionId] = useState(null);
  const [quickInputs, setQuickInputs] = useState([]);
  const [workspacePickSessions, setWorkspacePickSessions] = useState([]);
  const [workspacePickLoading, setWorkspacePickLoading] = useState(false);
  const [workspacePickErr, setWorkspacePickErr] = useState('');
  /** 未配置工作区时：用服务端 /api/meta 的 cwd（进程启动目录） */
  const [serverWorkspaceFallback, setServerWorkspaceFallback] = useState(undefined);
  const [cursorSessionFilePaths, setCursorSessionFilePaths] = useState(null);
  const [cursorTailInfo, setCursorTailInfo] = useState('');
  const [cursorTailError, setCursorTailError] = useState('');
  const [cursorPendingUserPrompt, setCursorPendingUserPrompt] = useState(null);
  const [externalThreadsByProvider, setExternalThreadsByProvider] = useState({});
  const [cursorEnsureStatus, setCursorEnsureStatus] = useState('idle');
  const [cursorEnsureErrorMsg, setCursorEnsureErrorMsg] = useState('');
  const [cursorEnsureRetryNonce, setCursorEnsureRetryNonce] = useState(0);
  const [cursorStreamLoading, setCursorStreamLoading] = useState(false);
  /** Cursor 发送：剪贴板写入完成前为 true，侧栏加载条显示「准备中」而非「等输出」 */
  const [cursorAwaitingCliPaste, setCursorAwaitingCliPaste] = useState(false);
  /** 发送流程中隐藏原「关联」条，避免与侧栏动效重复 */
  const [cursorQuietPrepare, setCursorQuietPrepare] = useState(false);
  /** Cursor 右侧：已打开的会话 Tab（顺序即打开顺序） */
  const [workbenchSplitTabIds, setWorkbenchSplitTabIds] = useState([]);
  const [workbenchSessionAttachSelectKey, setWorkbenchSessionAttachSelectKey] = useState(0);

  const wsRef = useRef(null);
  const cursorWsRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);
  const sourceRef = useRef(null);
  const analyserRef = useRef(null);
  const partialUiRafRef = useRef(null);
  const pendingPartialUiRef = useRef('');
  const dbSessionIdRef = useRef(null);
  /** 与 cursorSessionFilePaths 对应的会话 id，避免刚建会话尚未跑完 effect 时路径错位 */
  const cursorPathsSidRef = useRef(null);
  const agentMessagesRef = useRef(null);
  const cursorPanelScrollRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const autoSubmitLockRef = useRef(false);
  const editorContentRef = useRef('');
  const partialTextRef = useRef('');
  const phaseRef = useRef('idle');
  const copyBusyRef = useRef(false);
  const agentSendingKeysRef = useRef(new Set());
  const httpSendingKeysRef = useRef(new Set());
  const activeModeIdRef = useRef(activeModeId);
  const runAutoSubmitRef = useRef(null);
  const stopRecognitionRef = useRef(() => {});
  const editorTextareaRef = useRef(null);
  const editorSelRef = useRef({ start: null, end: null });
  const cursorTailInfoRef = useRef('');
  const cursorTailErrorRef = useRef('');
  const cursorTailPollBaselineRef = useRef({ info: '', error: '' });
  const cursorVoiceBlockRef = useRef(false);
  /** 切换 Cursor 会话时缓存各 Tab 的输出区，避免来回切换丢内容 */
  const cursorTabOutputCacheRef = useRef(new Map());
  const cursorTabCachePrevSidRef = useRef(null);
  const cursorPendingPromptRef = useRef(null);
  /** 为 true 时，切换/创建会话的 effect 勿清空 pending/loading（发送流程中） */
  const cursorSendInFlightRef = useRef(false);

  const activeMode = modes.find((m) => m.id === activeModeId) || modes[0];
  const isAsr = activeMode?.kind === 'asr';
  const isAgent = activeMode?.kind === 'agent';
  const isCli = activeMode?.kind === 'cli';
  const isHttp = activeMode?.kind === 'http';
  const isXiaoaiCli = isCli && activeMode?.cliVariant === 'xiaoai';
  const isCursorCli = isCli && activeMode?.cliVariant === 'cursor';
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
  const isAgentRef = useRef(false);
  useEffect(() => {
    isAgentRef.current = isAgent;
  }, [isAgent]);

  const modeVoiceRef = useRef(OUTPUT_VOICE_DEFAULTS);
  useEffect(() => {
    modeVoiceRef.current = activeMode?.voiceControl ?? OUTPUT_VOICE_DEFAULTS;
  }, [activeMode]);

  const loadQuickInputs = useCallback(async () => {
    try {
      const list = await fetchQuickInputs();
      setQuickInputs(Array.isArray(list) ? list : []);
    } catch {
      setQuickInputs([]);
    }
  }, []);

  useEffect(() => {
    loadQuickInputs();
    const onChanged = () => loadQuickInputs();
    window.addEventListener('reso-quick-inputs-changed', onChanged);
    return () => window.removeEventListener('reso-quick-inputs-changed', onChanged);
  }, [loadQuickInputs]);

  useEffect(() => {
    let cancelled = false;
    fetchServerMeta()
      .then((m) => {
        if (cancelled) return;
        if (m) {
          setResolvedExternalThreadProviderFromServer(m.externalThreadProvider);
          setServerWorkspaceFallback(m.cwd ?? '');
        } else {
          setResolvedExternalThreadProviderFromServer(undefined);
          setServerWorkspaceFallback('');
        }
        setModes(getAllModes());
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedExternalThreadProviderFromServer(undefined);
          setServerWorkspaceFallback('');
          setModes(getAllModes());
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const captureEditorSelection = useCallback(() => {
    const ta = editorTextareaRef.current;
    if (ta && typeof ta.selectionStart === 'number') {
      editorSelRef.current = { start: ta.selectionStart, end: ta.selectionEnd ?? ta.selectionStart };
    }
  }, []);

  const onEditorBlur = useCallback(() => {
    captureEditorSelection();
  }, [captureEditorSelection]);

  const insertQuickContent = useCallback((text) => {
    const raw = String(text ?? '');
    if (!raw) return;
    setEditorContent((prev) => {
      const ta = editorTextareaRef.current;
      let start;
      let end;
      if (ta && document.activeElement === ta) {
        start = Math.min(ta.selectionStart, prev.length);
        end = Math.min(ta.selectionEnd ?? start, prev.length);
      } else {
        const saved = editorSelRef.current;
        if (saved.start != null && saved.end != null) {
          start = Math.min(saved.start, prev.length);
          end = Math.min(saved.end, prev.length);
        } else {
          start = end = prev.length;
        }
      }
      const before = prev.slice(0, start);
      const after = prev.slice(end);
      let piece = raw;
      if (before.length > 0 && !/\n$/.test(before) && !/^\n/.test(piece)) {
        piece = `\n${piece}`;
      }
      const next = before + piece + after;
      const caret = (before + piece).length;
      queueMicrotask(() => {
        const el = editorTextareaRef.current;
        if (el) {
          el.focus();
          try {
            el.setSelectionRange(caret, caret);
          } catch {
            /* ignore */
          }
          editorSelRef.current = { start: caret, end: caret };
        }
      });
      return next;
    });
  }, []);

  const assignAsrSession = useCallback((id) => {
    const sid = String(id ?? '').trim();
    dbSessionIdRef.current = sid || null;
    setAsrSessionId(sid || null);
  }, []);

  const clearAsrSession = () => {
    dbSessionIdRef.current = null;
    setAsrSessionId(null);
  };

  const loadWorkspacePickSessions = useCallback(async () => {
    setWorkspacePickLoading(true);
    setWorkspacePickErr('');
    try {
      const data = await fetchSessionList({ page: 1, pageSize: 50 });
      setWorkspacePickSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch (e) {
      setWorkspacePickErr(e.message || '加载会话列表失败');
      setWorkspacePickSessions([]);
    } finally {
      setWorkspacePickLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAsr && !isCli && !isHttp && !isAgent) return;
    loadWorkspacePickSessions();
  }, [isAsr, isCli, isHttp, isAgent, loadWorkspacePickSessions]);

  useEffect(() => {
    if (!isCursorCli || !asrSessionId || !SESSION_UUID_RE.test(String(asrSessionId))) {
      setCursorSessionFilePaths(null);
      cursorPathsSidRef.current = null;
      return;
    }
    let cancelled = false;
    const sid = String(asrSessionId);
    fetchCursorSessionPaths(sid)
      .then((d) => {
        if (!cancelled) {
          setCursorSessionFilePaths(d);
          cursorPathsSidRef.current = sid;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCursorSessionFilePaths(null);
          cursorPathsSidRef.current = null;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isCursorCli, asrSessionId]);

  useEffect(() => {
    cursorPendingPromptRef.current = cursorPendingUserPrompt;
  }, [cursorPendingUserPrompt]);

  useEffect(() => {
    if (!isCursorCli) {
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
    if (!next) {
      setCursorTailInfo('');
      setCursorTailError('');
      if (!cursorSendInFlightRef.current) {
        setCursorPendingUserPrompt(null);
        setCursorStreamLoading(false);
      }
      return;
    }
    const cached = map.get(next);
    if (cached) {
      setCursorTailInfo(cached.tailInfo);
      setCursorTailError(cached.tailError);
      setCursorPendingUserPrompt(cached.pending ?? null);
    } else {
      setCursorTailInfo('');
      setCursorTailError('');
      if (!cursorSendInFlightRef.current) {
        setCursorPendingUserPrompt(null);
      }
    }
    if (!cursorSendInFlightRef.current) {
      setCursorStreamLoading(false);
    }
  }, [isCursorCli, asrSessionId]);

  useEffect(() => {
    if (!isCursorCli && !isAgent) {
      setWorkbenchSplitTabIds([]);
    }
  }, [isCursorCli, isAgent]);

  useEffect(() => {
    if (!isCursorCli && !isAgent) return;
    const sid =
      asrSessionId && SESSION_UUID_RE.test(String(asrSessionId))
        ? String(asrSessionId)
        : '';
    if (!sid) return;
    setWorkbenchSplitTabIds((prev) => (prev.includes(sid) ? prev : [...prev, sid]));
  }, [isCursorCli, isAgent, asrSessionId]);

  useEffect(() => {
    cursorTailInfoRef.current = cursorTailInfo;
    cursorTailErrorRef.current = cursorTailError;
  }, [cursorTailInfo, cursorTailError]);

  useEffect(() => {
    if (!isCursorCli || !asrSessionId || !SESSION_UUID_RE.test(String(asrSessionId))) {
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
      ws.send(JSON.stringify({ type: 'subscribe', sessionId: String(asrSessionId) }));
    };
    ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === 'files') {
          const info = typeof d.info === 'string' ? d.info : '';
          const error = typeof d.error === 'string' ? d.error : '';
          setCursorTailInfo(info);
          setCursorTailError(error);
          setCursorStreamLoading((prev) => {
            if (!prev) return prev;
            const b = cursorTailPollBaselineRef.current;
            if (info !== b.info || error !== b.error) return false;
            return prev;
          });
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
  }, [isCursorCli, asrSessionId]);

  const cursorExternalThreadProvider = useMemo(() => {
    if (!activeMode || activeMode.cliVariant !== 'cursor') return CURSOR_EXTERNAL_THREAD_PROVIDER;
    return getResolvedExternalThreadProvider();
  }, [activeMode, serverWorkspaceFallback]);

  useEffect(() => {
    if (!isCursorCli || !asrSessionId || !SESSION_UUID_RE.test(String(asrSessionId))) {
      setExternalThreadsByProvider({});
      setCursorEnsureStatus('idle');
      setCursorEnsureErrorMsg('');
      return;
    }
    const prov = cursorExternalThreadProvider;
    let cancelled = false;
    setExternalThreadsByProvider({});
    setCursorEnsureStatus('loading');
    setCursorEnsureErrorMsg('');
    apiEnsureSessionExternalThread(
      asrSessionId,
      prov,
      cliEnvPayloadForEnsure ? { cliEnv: cliEnvPayloadForEnsure } : undefined
    )
      .then(({ threadId }) => {
        if (cancelled) return;
        setExternalThreadsByProvider({ [prov]: threadId });
        setCursorEnsureStatus('ok');
      })
      .catch((e) => {
        if (cancelled) return;
        setCursorEnsureStatus('error');
        setCursorEnsureErrorMsg(e.message || '准备失败');
        setExternalThreadsByProvider({});
      });
    return () => {
      cancelled = true;
    };
  }, [
    isCursorCli,
    asrSessionId,
    activeMode,
    cursorExternalThreadProvider,
    cursorEnsureRetryNonce,
    cliEnvPayloadForEnsure,
  ]);

  const cursorResolvedExternalThreadId = useMemo(() => {
    const p = cursorExternalThreadProvider;
    return String(externalThreadsByProvider[p] || '').trim();
  }, [cursorExternalThreadProvider, externalThreadsByProvider]);

  const cursorParsedOutput = useMemo(
    () => parseCliOutputForDelivery('cursor_cli', cursorTailInfo, cursorTailError),
    [cursorTailInfo, cursorTailError]
  );

  const cursorStreamFormatHint = useMemo(() => {
    if (!String(cursorTailInfo || '').trim()) return null;
    if (looksLikeCursorStreamJson(cursorTailInfo)) return null;
    return '当前输出不是 Cursor stream-json（NDJSON），已按原文展示。其他 CLI 可后续接入独立解析规则。';
  }, [cursorTailInfo]);

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
  }, [cursorTailInfo, cursorTailError, cursorPendingUserPrompt, cursorParsedOutput.blocks.length]);

  const cliWorkspaceFallbackStr =
    serverWorkspaceFallback === undefined ? '' : serverWorkspaceFallback;

  const cursorTriadInputs = useMemo(() => {
    if (!isCursorCli || !activeMode) {
      return { 模型: '', 工作空间: '', 输出路径: '' };
    }
    return cursorTriadCustomValues(activeMode);
  }, [isCursorCli, activeMode]);

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
    if (!isCursorCli || !activeMode) return [];
    const tmpl = activeMode.cliTemplate || CURSOR_CLI_DEFAULT_TEMPLATE;
    return cursorTriadLabelsInTemplate(tmpl);
  }, [isCursorCli, activeMode]);

  const cursorTriadReady = useMemo(() => {
    if (!isCursorCli || !activeMode) return true;
    const tmpl = activeMode.cliTemplate || CURSOR_CLI_DEFAULT_TEMPLATE;
    return cursorCliReadyIgnoringProvisioningDeps(
      tmpl,
      activeMode.angleSlots || [],
      cursorTriadCtx
    );
  }, [isCursorCli, activeMode, cursorTriadCtx]);

  useEffect(() => {
    cursorVoiceBlockRef.current = isCursorCli && !cursorTriadReady;
  }, [isCursorCli, cursorTriadReady]);

  const patchCursorTriadField = useCallback(
    (label, value) => {
      if (!activeMode?.id || activeMode.cliVariant !== 'cursor') return;
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
      setModes(getAllModes());
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
    if (!isCursorCli || !activeMode || cursorTriadReady) return '';
    const tmpl = activeMode.cliTemplate || CURSOR_CLI_DEFAULT_TEMPLATE;
    return (
      cursorCliFillHint(tmpl, activeMode.angleSlots || [], cursorTriadCtx) ||
      '请完成「入参」中的模型、工作空间等后再复制或发送。'
    );
  }, [isCursorCli, activeMode, cursorTriadCtx, cursorTriadReady]);

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

  const workspacePickOptions = useMemo(() => {
    const selId = asrSessionId ? String(asrSessionId) : '';
    if (!selId) return workspacePickSessions;
    const inList = workspacePickSessions.some((s) => String(s.id) === selId);
    if (inList) return workspacePickSessions;
    return [
      { id: selId, list_title: '（当前绑定）', preview: '', paragraph_count: null, created_at: null },
      ...workspacePickSessions,
    ];
  }, [workspacePickSessions, asrSessionId]);

  useEffect(() => {
    if (activeMode) saveActiveModeId(activeMode.id);
  }, [activeMode]);

  useEffect(() => {
    const onOutputs = () => {
      const next = getAllModes();
      setModes(next);
      setActiveModeId((cur) => (next.some((m) => m.id === cur) ? cur : next[0]?.id));
    };
    window.addEventListener('reso-outputs-changed', onOutputs);
    return () => window.removeEventListener('reso-outputs-changed', onOutputs);
  }, []);

  useEffect(() => {
    const el = agentMessagesRef.current;
    if (!el || !isAgent) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [agentMessages, isAgent]);

  useEffect(() => {
    editorContentRef.current = editorContent;
  }, [editorContent]);
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
          setStatus('正在聆听…');
          return;
        }
        if (msg.type === 'transcript') {
          const vox = getVoiceSettings();
          if (msg.sentenceEnd) {
            if (partialUiRafRef.current != null) {
              cancelAnimationFrame(partialUiRafRef.current);
              partialUiRafRef.current = null;
            }
            pendingPartialUiRef.current = '';
            const piece = normalizeTranscriptText(msg.text || '', vox);
            partialTextRef.current = '';
            setPartialText('');
            setEditorContent((prev) => {
              const next = prev ? `${prev}${piece}` : piece;
              queueMicrotask(() => {
                editorContentRef.current = next;
                scheduleSilenceTimer();
                tryPhraseAuto(next);
              });
              return next;
            });
          } else {
            pendingPartialUiRef.current = normalizeTranscriptText(msg.text || '', vox);
            if (partialUiRafRef.current == null) {
              partialUiRafRef.current = requestAnimationFrame(() => {
                partialUiRafRef.current = null;
                const t = pendingPartialUiRef.current;
                partialTextRef.current = t;
                setPartialText(t);
                queueMicrotask(() => {
                  scheduleSilenceTimer();
                });
              });
            }
          }
          return;
        }
        if (msg.type === 'done') {
          if (partialUiRafRef.current != null) {
            cancelAnimationFrame(partialUiRafRef.current);
            partialUiRafRef.current = null;
          }
          if (pendingPartialUiRef.current !== '') {
            partialTextRef.current = pendingPartialUiRef.current;
          }
          pendingPartialUiRef.current = '';
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
          if (partialUiRafRef.current != null) {
            cancelAnimationFrame(partialUiRafRef.current);
            partialUiRafRef.current = null;
          }
          pendingPartialUiRef.current = '';
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
    const ac = new AudioContext();
    audioContextRef.current = ac;
    if (ac.state === 'suspended') {
      await ac.resume().catch(() => {});
    }
    await ac.audioWorklet.addModule(pcmWorkletUrl);
    const node = new AudioWorkletNode(ac, 'pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      processorOptions: { chunkSamples: 4096 },
    });
    workletNodeRef.current = node;
    node.port.onmessage = (ev) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const pcm = ev.data?.pcm;
      if (pcm instanceof Uint8Array) ws.send(pcm);
    };
    const source = ac.createMediaStreamSource(streamRef.current);
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
  }, []);

  const onSelectMode = (id) => {
    if (id === activeModeId) return;
    if (phase !== 'idle') abortAsrSession();
    const next = modes.find((m) => m.id === id);
    /** 进入右侧分栏模式时勿沿用其它模式绑定的会话，否则会出现「会话 xxx」标签但语义已不对 */
    const nextUsesRightSplit =
      next?.kind === 'agent' || (next?.kind === 'cli' && next?.cliVariant === 'cursor');
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
        ? '右侧为对话区；可「新建会话」或「已有会话」切换；语音在短暂停顿后会自动发送（无需说结束词）'
        : next?.kind === 'http'
          ? '填写上方请求 URL 与协议；正文会随 OpenAI Chat 或 AGUI 体 POST 到该地址'
          : next?.kind === 'cli'
            ? next?.cliVariant === 'cursor'
              ? '右侧为对话区；备齐后复制指令到终端执行，文件输出会作为助手回复刷新'
              : next?.cliVariant === 'xiaoai'
                ? '编辑完整指令；尖括号在下方配置，或用 {{paragraph}} 等；确认后点「复制指令」'
                : '编辑上方 CLI 模板与工作区；正文为段落占位符，点「复制命令」'
            : '点击「新建会话」或开始识别；可选下拉中的已有会话以继续同一会话'
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
    setPhase('connecting');

    if (isAsr || isCli || isHttp) {
      if (!dbSessionIdRef.current) {
        setStatus('创建会话…');
        try {
          const sid = await apiCreateSession();
          assignAsrSession(sid);
        } catch (e) {
          setStatus(e.message || '无法创建会话，请检查数据库配置');
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
      setStatus('无法连接后端，请确认 npm run dev 已启动且根目录 .env 中 PORT 与 Vite 代理一致');
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
    } catch {
      setStatus('音频引擎启动失败，请刷新页面后重试');
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
    } else if (phase === 'idle') {
      startRecognition();
    }
  };

  const clearEditor = () => {
    setEditorContent('');
    setPartialText('');
    setStatus(
      isAsr || isCli || isHttp
        ? '已清空编辑区（未写入数据库）'
        : isAgent
          ? '已清空输入框'
          : '已清空'
    );
  };

  const performAsrSave = useCallback(async (segment) => {
    const sid = dbSessionIdRef.current;
    if (!sid) {
      setStatus('请先「新建会话」或点击开始识别，以关联数据库会话');
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
          setStatus(e.message || '无法创建会话，请检查数据库配置');
          return false;
        }
      }
      const chatKey = agentChatStateKey(modeId, ensuredSid);
      if (agentSendingKeysRef.current.has(chatKey)) return false;
      let streamThreadId = getAgentThreadIdForSession(modeId, ensuredSid);
      agentSendingKeysRef.current.add(chatKey);
      setAgentSendingByKey((s) => ({ ...s, [chatKey]: true }));
      setStatus('正在请求回复…');
      setChatByModeId((s) => {
        const p = s[chatKey] || [];
        return {
          ...s,
          [chatKey]: [...p, { role: 'user', content: text }, { role: 'assistant', content: '' }],
        };
      });
      try {
        let prefix = '';
        try {
          const saved = await apiSaveParagraph(ensuredSid, text);
          const n = saved.paragraphIndex;
          prefix = typeof n === 'number' ? `第 ${n} 段已入库 · ` : '';
        } catch (e) {
          prefix = `段落未入库（${e.message || '错误'}）· `;
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
        await apiAgentChatTurnStream(
          {
            modeId,
            threadId,
            userText: text,
            system: activeMode.systemPrompt || undefined,
            model,
            dashscopeApiKey,
          },
          (ev) => {
            if (ev.type === 'meta' && ev.threadId) {
              streamThreadId = ev.threadId;
              setAgentThreadIdForSession(modeId, ensuredSid, ev.threadId);
            }
            if (ev.type === 'delta' && ev.text) {
              setChatByModeId((s) => {
                const list = [...(s[chatKey] || [])];
                const last = list[list.length - 1];
                if (last?.role === 'assistant') {
                  list[list.length - 1] = {
                    ...last,
                    content: `${last.content || ''}${ev.text}`,
                  };
                }
                return { ...s, [chatKey]: list };
              });
            }
            if (ev.type === 'done' && Array.isArray(ev.messages)) {
              setChatByModeId((s) => ({ ...s, [chatKey]: ev.messages }));
            }
          }
        );
        setStatus(phaseRef.current === 'recording' ? '正在聆听…' : '可继续输入或说话');
        return true;
      } catch (e) {
        setStatus(e.message || '发送失败');
        const tid = getAgentThreadIdForSession(modeId, ensuredSid) || streamThreadId;
        if (tid) {
          try {
            const data = await fetchChatThread(tid);
            setChatByModeId((s) => ({ ...s, [chatKey]: data.messages || [] }));
          } catch {
            /* 保持当前列表 */
          }
        }
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
        setStatus('请填写 HTTP 请求 URL（可在上方或「输出」页配置）');
        return false;
      }
      const sid0 = dbSessionIdRef.current ? String(dbSessionIdRef.current).trim() : '';
      const httpKey = agentChatStateKey(activeMode.id, sid0 || null);
      if (httpSendingKeysRef.current.has(httpKey)) return false;
      httpSendingKeysRef.current.add(httpKey);
      setHttpSendingByKey((s) => ({ ...s, [httpKey]: true }));
      setStatus('正在复制、保存段落并发送 HTTP 请求…');
      try {
        const sid = dbSessionIdRef.current;
        let prefix = '';
        if (sid) {
          try {
            const saved = await apiSaveParagraph(sid, text);
            const n = saved.paragraphIndex;
            prefix = typeof n === 'number' ? `第 ${n} 段已入库 · ` : '';
          } catch (e) {
            prefix = `段落未入库（${e.message || '错误'}）· `;
          }
        } else {
          prefix = '未绑定数据库会话，段落未入库 · ';
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
          setStatus(`${prefix}HTTP ${res.status}：${raw.slice(0, 120)}`);
          return false;
        }
        setEditorContent('');
        setPartialText('');
        setStatus(`${prefix}请求成功（${raw.length ? raw.slice(0, 80) + (raw.length > 80 ? '…' : '') : '空响应'}）`);
        return true;
      } catch (e) {
        setStatus(e.message || 'HTTP 请求失败');
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

  /** Cursor 发送：按需建会话、拉路径、ensure；quiet 时不改底部状态栏、不标红关联区 */
  const provisionCursorWorkbenchCli = useCallback(async (opts) => {
    const quiet = Boolean(opts?.quiet);
    const statusHint = (msg) => {
      if (!quiet) setStatus(msg);
    };
    if (!activeMode || activeMode.cliVariant !== 'cursor') {
      return {
        ok: true,
        sid: dbSessionIdRef.current,
        paths: cursorSessionFilePaths,
        threadId: cursorResolvedExternalThreadId,
      };
    }
    const prov = getResolvedExternalThreadProvider();

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

    let paths = cursorSessionFilePaths;
    if (cursorPathsSidRef.current !== sid || !paths?.infoTxtAbs) {
      statusHint('正在解析 Cursor 输出路径…');
      try {
        paths = await fetchCursorSessionPaths(sid);
        setCursorSessionFilePaths(paths);
        cursorPathsSidRef.current = sid;
      } catch (e) {
        return { ok: false, error: e.message || '解析输出路径失败' };
      }
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
    const text = `${editorContentRef.current}${partialTextRef.current || ''}`;
    const sid = dbSessionIdRef.current;
    const computed = computeWorkbenchCliCommand(
      activeMode,
      text,
      sid,
      cursorSessionFilePaths,
      cursorResolvedExternalThreadId,
      cliWorkspaceFallbackStr
    );
    if (computed.error) {
      setStatus(`${computed.error}，再复制指令`);
      return false;
    }
    setCopyBusy(true);
    try {
      await navigator.clipboard.writeText(computed.cmd);
      setStatus('复制成功到剪贴板');
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

      if (activeMode.cliVariant === 'cursor') {
        setCopyBusy(true);
        cursorSendInFlightRef.current = true;
        setCursorQuietPrepare(true);
        setCursorAwaitingCliPaste(true);
        setCursorStreamLoading(true);
        setCursorPendingUserPrompt(text);
        setEditorContent('');
        setPartialText('');
        try {
          const p = await provisionCursorWorkbenchCli({ quiet: true });
          if (!p.ok) {
            setCursorStreamLoading(false);
            setCursorPendingUserPrompt(null);
            setCursorAwaitingCliPaste(false);
            setEditorContent(text);
            setPartialText('');
            setStatus(`${p.error}，请重试`);
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
            setCursorStreamLoading(false);
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
              prefix = typeof n === 'number' ? `第 ${n} 段已入库 · ` : '';
            } catch (e) {
              prefix = `段落未入库（${e.message || '错误'}）· `;
            }
          } else {
            prefix = '未绑定数据库会话，段落未入库 · ';
          }
          cursorTailPollBaselineRef.current = {
            info: cursorTailInfoRef.current,
            error: cursorTailErrorRef.current,
          };
          try {
            await navigator.clipboard.writeText(computed.cmd);
          } catch {
            setCursorStreamLoading(false);
            setCursorPendingUserPrompt(null);
            setCursorAwaitingCliPaste(false);
            setEditorContent(text);
            setPartialText('');
            setStatus(`${prefix}剪贴板写入失败`);
            return false;
          }
          setCursorAwaitingCliPaste(false);
          setStatus(`${prefix}指令已复制，请在终端粘贴执行`);
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
            prefix = typeof n === 'number' ? `第 ${n} 段已入库 · ` : '';
          } catch (e) {
            prefix = `段落未入库（${e.message || '错误'}）· `;
          }
        } else {
          prefix = '未绑定数据库会话，段落未入库 · ';
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
    [activeMode, cliWorkspaceFallbackStr, provisionCursorWorkbenchCli]
  );

  const runAutoSubmit = useCallback(
    async (segment, options = {}) => {
      const trigger = options.trigger === 'phrase' ? 'phrase' : 'silence';
      const text = String(segment || '').trim();
      if (!text) return;
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
    return performAsrSave(`${editorContent}${partialText || ''}`.trim());
  };

  const copyCliCommandOnly = () => {
    if (copyBusy) return Promise.resolve();
    return performCliCopyOnly();
  };

  const submitCliPrimary = () => {
    if (copyBusy) return Promise.resolve();
    return performCliPipeline(`${editorContent}${partialText || ''}`.trim());
  };

  /** Agent 底栏：复制、尽量存段、再发给模型（模型可在设置里覆盖） */
  const submitAgentPrimary = () => {
    if (agentSendingCurrent) return Promise.resolve();
    return performAgentPipeline(`${editorContent}${partialText || ''}`.trim());
  };

  const submitHttpPrimary = () => {
    if (httpSendingCurrent) return Promise.resolve();
    return performHttpPipeline(`${editorContent}${partialText || ''}`.trim());
  };

  const clearAgentChat = async () => {
    if (!activeMode || !isAgent) return;
    const sid = asrSessionId && SESSION_UUID_RE.test(String(asrSessionId)) ? String(asrSessionId) : '';
    if (!sid) {
      setStatus('请先新建会话或从「已有会话」打开当前会话');
      return;
    }
    const tid = getAgentThreadIdForSession(activeMode.id, sid);
    const key = agentChatStateKey(activeMode.id, sid);
    try {
      if (tid) {
        await apiDeleteChatMessages(tid);
      }
      setChatByModeId((s) => ({ ...s, [key]: [] }));
      setStatus('已清空本条线程下的消息（线程仍在，可继续聊）');
    } catch (e) {
      setStatus(e.message || '清空失败');
    }
  };

  const submitNewMode = (e) => {
    e.preventDefault();
    try {
      if (newModeKind === 'xiaoai') {
        const { modes: next, newId } = addCustomXiaoaiMode({
          name: newModeName,
          commandTemplate: newXiaoaiTemplate,
          ...(newCliAngleSlotsPreset != null ? { angleSlots: newCliAngleSlotsPreset } : {}),
        });
        setModes(next);
        setActiveModeId(newId);
        setNewModeName('');
        setNewXiaoaiTemplate('');
        setNewCliAngleSlotsPreset(null);
        setModeModalOpen(false);
        setStatus('已添加 CLI 输出模式');
      } else {
        const { modes: next, newId } = addCustomHttpMode({
          name: newModeName,
          requestUrl: newHttpUrl,
          httpProtocol: newHttpProtocol,
        });
        setModes(next);
        setActiveModeId(newId);
        setNewModeName('');
        setNewHttpUrl('');
        setNewHttpProtocol('openai_chat');
        setNewCliAngleSlotsPreset(null);
        setModeModalOpen(false);
        setStatus('已添加 HTTP 输出模式');
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
  const customModes = modes.filter((m) => !m.builtIn);

  const onCliTemplateChange = (v) => {
    if (!activeMode?.id || activeMode.kind !== 'cli') return;
    if (activeMode.cliVariant === 'cursor') return;
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
      className={`home-page home-page--compact ${isAgent || isCursorCli ? 'home-page--split' : ''}`}
    >
      <div
        className={`home-card ${isAgent || isCursorCli ? 'home-card--with-agent' : ''}`}
      >
        <div className="home-card-main">
          <header className="top">
            <div className="top-control-row">
              <div className="top-spacer" aria-hidden />
              <button
                type="button"
                className={`play-toggle ${recording ? 'recording' : ''}`}
                disabled={busy}
                onClick={toggleRecord}
                aria-label={recording ? '停止识别' : '开始识别'}
              >
                {recording ? <IconPause /> : <IconPlay />}
              </button>
              <div className="top-mode-controls">
                <WorkModeSelect
                  modes={modes}
                  value={activeModeId}
                  onChange={onSelectMode}
                  onAddCustom={() => {
                    setNewModeKind('http');
                    setNewCliAngleSlotsPreset(null);
                    setModeModalOpen(true);
                  }}
                />
              </div>
            </div>
            <p className="top-voice-hint" title="来自当前目标的「识别结束策略」配置">
              {voiceControlHint}
            </p>
            <p className={`status ${recording ? 'recording' : ''}`}>{status}</p>
          </header>

          <section className="bottom">
            <div className="panel-head">
              <div className="panel-title">
                <h2 className="panel-title-heading">
                  {isAgent || isCursorCli
                    ? '输入'
                    : isHttp
                      ? '正文（请求内容）'
                      : isCli
                        ? isXiaoaiCli
                          ? '段落（指令占位）'
                          : '段落（命令占位）'
                        : '正文'}
                </h2>
                {isAsr || (isCli && !isCursorCli) || isHttp ? (
                  <select
                    className="panel-session-select"
                    value={asrSessionId || ''}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (!v) {
                        clearAsrSession();
                        setStatus('未绑定会话；开始识别时将自动创建新会话');
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
                    <option value="">未绑定会话</option>
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
              {isAsr || (isCli && !isCursorCli) || isHttp ? (
                <div className="panel-head-actions">
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
                  <button type="button" className="btn-new-session" onClick={onNewAsrSession}>
                    新建会话
                  </button>
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
                    <option value="openai_chat">OpenAI Chat</option>
                    <option value="agui">AGUI</option>
                  </select>
                </label>
                <p className="cli-mode-hint">
                  OpenAI Chat：POST JSON 含 <code className="settings-code">messages</code>（user 一条）与可选{' '}
                  <code className="settings-code">model</code>（取自设置里的对话模型）。AGUI：发送{' '}
                  <code className="settings-code">user_message</code> 与{' '}
                  <code className="settings-code">session_id</code>。注意目标站 CORS；若配置了目标环境变量，会带请求头{' '}
                  <code className="settings-code">X-Reso-Target-Env</code>（在「目标管理」中编辑）。
                </p>
              </div>
            ) : null}
            <div className="editor-wrap">
              <div className="editor-body editor-body--stack">
                <div
                  className={`editor-textarea-wrap editor-textarea-wrap--fill ${isAgent || isCursorCli ? 'editor-textarea-wrap--agent' : ''}`}
                >
                  <button
                    type="button"
                    className="btn-editor-clear"
                    onClick={clearEditor}
                    title="清空编辑区"
                  >
                    清空
                  </button>
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
                      if (isCli && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        submitCliPrimary();
                        return;
                      }
                      if (isHttp && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        submitHttpPrimary();
                        return;
                      }
                      if (!isAgent) return;
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        submitAgentPrimary();
                      }
                    }}
                    placeholder={
                      isAgent
                        ? '输入问题，或使用上方麦克风转写；⌘/Ctrl + Enter 与底栏「发送」相同…'
                        : isHttp
                          ? '识别或输入正文；⌘/Ctrl + Enter 与底栏「发送请求」相同…'
                          : isCli
                            ? isCursorCli
                              ? '识别或输入正文作为 -p 提示词；⌘/Ctrl + Enter 与「发送」相同（保存并复制）…'
                              : isXiaoaiCli
                                ? '识别或输入正文；⌘/Ctrl + Enter 与「发送」相同…'
                                : '识别或输入正文；⌘/Ctrl + Enter 与「发送」相同…'
                            : '识别结果会出现在这里，也可直接输入或修改文字…'
                    }
                    spellCheck={false}
                  />
                </div>
                {quickInputs.length > 0 ? (
                  <div className="quick-input-strip" role="toolbar" aria-label="快捷上下文">
                    <span className="quick-input-strip-label">快捷上下文</span>
                    <div className="quick-input-tags">
                      {quickInputs.map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          className="quick-input-tag"
                          title={
                            q.content && q.content.length > 100
                              ? `${q.content.slice(0, 100)}…`
                              : q.content || q.label
                          }
                          onClick={() => insertQuickContent(q.content)}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="editor-bottom-composite">
                  {recording ? (
                    <div className="editor-recording-strip" aria-live="polite">
                      <span className="editor-recording-badge">识别中</span>
                      <div className="editor-recording-partial">
                        <span className="editor-recording-partial__text">{partialText}</span>
                        {partialText.trim() ? (
                          <VoiceWaveVisualizer active={recording} analyserRef={analyserRef} inline />
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="editor-bottom-spacer" aria-hidden />
                  )}
                  <div className="editor-bottom-end">
                    {isAsr ? (
                      <button
                        type="button"
                        className="btn-editor-primary"
                        disabled={copyBusy}
                        onClick={copyAndSaveParagraph}
                      >
                        {copyBusy ? '…' : '复制并保存'}
                      </button>
                    ) : isCli ? (
                      <div className="editor-bottom-cli-actions">
                        {isCursorCli ? (
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
                            copyBusy || (isCursorCli && !cursorTriadReady)
                          }
                          title={
                            isCursorCli && !cursorTriadReady
                              ? cursorWorkbenchReadinessHint ||
                                '请补全「入参」中的模型、工作空间等'
                              : undefined
                          }
                          onClick={copyCliCommandOnly}
                        >
                          {copyBusy ? '…' : isXiaoaiCli || isCursorCli ? '复制指令' : '复制命令'}
                        </button>
                        <button
                          type="button"
                          className="btn-editor-primary"
                          disabled={
                            copyBusy ||
                            !`${editorContent}${partialText || ''}`.trim() ||
                            (isCursorCli && !cursorTriadReady)
                          }
                          title={
                            isCursorCli && !cursorTriadReady
                              ? cursorWorkbenchReadinessHint ||
                                '请补全「入参」中的模型、工作空间等'
                              : undefined
                          }
                          onClick={submitCliPrimary}
                        >
                          {copyBusy ? '…' : '发送'}
                        </button>
                      </div>
                    ) : isHttp ? (
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
                    ) : (
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
              <div className="cursor-workbench-toolbar" aria-label="会话操作">
                <div className="cursor-workbench-toolbar-left">
                  <button
                    type="button"
                    className="btn-cursor-toolbar"
                    disabled={phase !== 'idle'}
                    onClick={onNewAsrSession}
                  >
                    新建会话
                  </button>
                  <select
                    key={`agent-${workbenchSessionAttachSelectKey}`}
                    className="cursor-workbench-session-attach cursor-workbench-session-attach--toolbar"
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
                </div>
                <div className="cursor-workbench-toolbar-right">
                  <button
                    type="button"
                    className="btn-cursor-toolbar btn-cursor-toolbar--ghost"
                    onClick={clearAgentChat}
                  >
                    清空消息
                  </button>
                </div>
              </div>
              <div className="cursor-workbench-tabstrip" role="tablist" aria-label="会话">
                <div
                  className={`cursor-workbench-tabs-scroll cursor-workbench-tabs-scroll--strip ${workbenchSplitTabIds.length === 0 ? 'cursor-workbench-tabs-scroll--vcenter' : ''}`}
                >
                  {workbenchSplitTabIds.length === 0 ? (
                    <p className="cursor-workbench-strip-meta">暂无会话</p>
                  ) : (
                    workbenchSplitTabIds.map((tid) => {
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
                    })
                  )}
                </div>
              </div>
            </div>
            <div className="agent-messages" ref={agentMessagesRef}>
              {agentMessages.length === 0 ? (
                <p className="agent-empty">发送第一条消息后，回复会显示在这里。</p>
              ) : (
                agentMessages.map((m, i) => (
                  <div
                    key={`${i}-${m.role}-${m.content.slice(0, 12)}`}
                    className={`agent-bubble agent-bubble--${m.role}`}
                  >
                    <div className="agent-bubble-role">{m.role === 'user' ? '你' : '助手'}</div>
                    <div
                      className={`agent-bubble-text ${m.role === 'assistant' ? 'agent-bubble-text--md' : ''}`}
                    >
                      {m.role === 'assistant' ? (
                        <AssistantMarkdown text={m.content} />
                      ) : (
                        m.content
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        ) : isCursorCli ? (
          <aside className="agent-panel agent-panel--cursor-workbench" aria-label="对话">
            <div className="cursor-workbench-top">
              <div className="cursor-workbench-toolbar" aria-label="会话操作">
                <div className="cursor-workbench-toolbar-left">
                  <button
                    type="button"
                    className="btn-cursor-toolbar"
                    disabled={phase !== 'idle'}
                    onClick={onNewAsrSession}
                  >
                    新建会话
                  </button>
                  <select
                    key={workbenchSessionAttachSelectKey}
                    className="cursor-workbench-session-attach cursor-workbench-session-attach--toolbar"
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
                </div>
                <div className="cursor-workbench-toolbar-right">
                  <button
                    type="button"
                    className="btn-cursor-toolbar btn-cursor-toolbar--ghost"
                    onClick={() => setCliParamsModalOpen(true)}
                    aria-label="CLI 入参与环境变量"
                  >
                    CLI 入参
                  </button>
                  <button
                    type="button"
                    className="btn-cursor-toolbar btn-cursor-toolbar--ghost"
                    onClick={() => {
                      setCursorTailInfo('');
                      setCursorTailError('');
                      setCursorPendingUserPrompt(null);
                      setCursorStreamLoading(false);
                      setCursorAwaitingCliPaste(false);
                      const sid =
                        asrSessionId && SESSION_UUID_RE.test(String(asrSessionId))
                          ? String(asrSessionId)
                          : null;
                      if (sid) {
                        cursorTabOutputCacheRef.current.set(sid, {
                          tailInfo: '',
                          tailError: '',
                          pending: null,
                        });
                      }
                    }}
                  >
                    清空输出
                  </button>
                </div>
              </div>
              <div className="cursor-workbench-tabstrip" role="tablist" aria-label="会话">
                <div
                  className={`cursor-workbench-tabs-scroll cursor-workbench-tabs-scroll--strip ${workbenchSplitTabIds.length === 0 ? 'cursor-workbench-tabs-scroll--vcenter' : ''}`}
                >
                  {workbenchSplitTabIds.length === 0 ? (
                    <p className="cursor-workbench-strip-meta">暂无会话</p>
                  ) : (
                    workbenchSplitTabIds.map((tid) => {
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
                    })
                  )}
                </div>
              </div>
            </div>
            {asrSessionId &&
            SESSION_UUID_RE.test(String(asrSessionId)) &&
            !cursorQuietPrepare &&
            (cursorEnsureStatus === 'loading' || cursorEnsureStatus === 'error') ? (
              <div className="cursor-external-thread-panel">
                {cursorEnsureStatus === 'loading' ? (
                  <p className="cursor-external-thread-status">正在准备…</p>
                ) : (
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
                )}
              </div>
            ) : null}
            <div className="agent-messages" ref={cursorPanelScrollRef}>
              {!String(cursorTailInfo).trim() &&
              !String(cursorTailError).trim() &&
              !cursorPendingUserPrompt ? (
                <p className="agent-empty">发送第一条消息后，回复会显示在这里。</p>
              ) : (
                <>
                  {cursorPendingUserPrompt ? (
                    <div className="agent-bubble agent-bubble--user">
                      <div className="agent-bubble-role">你</div>
                      <div className="agent-bubble-text">{cursorPendingUserPrompt}</div>
                    </div>
                  ) : null}
                  {cursorStreamLoading ? (
                    <div
                      className={`cursor-stream-loading${cursorAwaitingCliPaste ? ' cursor-stream-loading--prepare' : ''}`}
                      role="status"
                      aria-live="polite"
                    >
                      <span className="cursor-stream-loading-pulse" aria-hidden />
                      {cursorAwaitingCliPaste ? '正在准备…' : '等待输出…'}
                    </div>
                  ) : null}
                  {String(cursorTailInfo).trim() || String(cursorTailError).trim() ? (
                    <CursorCliStructuredView
                      parsed={cursorParsedOutput}
                      stderr={cursorTailError}
                      formatHint={cursorStreamFormatHint}
                    />
                  ) : null}
                </>
              )}
            </div>
          </aside>
        ) : null}
      </div>

      {cliParamsModalOpen && isCli ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cli-params-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCliParamsModalOpen(false);
          }}
        >
          <div className="modal-card modal-card--cli-params" onClick={(e) => e.stopPropagation()}>
            <h2 id="cli-params-modal-title" className="modal-title">
              CLI 入参配置
            </h2>
            {isCursorCli ? (
              <div className="cli-params-modal-body">
                {cursorWorkbenchTriadLabels.length === 0 ? (
                  <p className="cli-params-cursor-empty">
                    当前模板里没有 <code>&lt;模型&gt;</code>、<code>&lt;工作空间&gt;</code>、
                    <code>&lt;输出路径&gt;</code> 占位，无需在此填写。
                  </p>
                ) : (
                  cursorWorkbenchTriadLabels.map((lab) => {
                    const meta =
                      lab === '模型'
                        ? { title: '--model（CLI 模型 id）', ph: '与 `agent models` 中 id 一致' }
                        : lab === '工作空间'
                          ? {
                              title: '工作空间（编程目录）',
                              ph: cliWorkspaceFallbackStr.trim()
                                ? `未填目标路径时用服务端：${cliWorkspaceFallbackStr}`
                                : '/path/to/your/repo',
                            }
                          : { title: '输出路径（模板自定义）', ph: '按您在目标详情中的占位含义填写' };
                    if (lab === '模型') {
                      const raw = cursorTriadInputs[lab] || '';
                      const sel = cursorAgentModelSelectValue(raw);
                      return (
                        <div key={lab} className="cli-mode-label cli-mode-label--stack">
                          <span className="cli-mode-label-text">{meta.title}</span>
                          <select
                            className="cli-mode-workspace cli-mode-workspace--select"
                            value={sel}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === CURSOR_AGENT_MODEL_SELECT_OTHER) {
                                patchCursorTriadField(
                                  lab,
                                  sel === CURSOR_AGENT_MODEL_SELECT_OTHER ? raw : ''
                                );
                              } else {
                                patchCursorTriadField(lab, v);
                              }
                            }}
                            aria-label={meta.title}
                          >
                            <option value="">请选择模型…</option>
                            {CURSOR_AGENT_MODEL_PRESETS.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}（{p.id}）
                              </option>
                            ))}
                            <option value={CURSOR_AGENT_MODEL_SELECT_OTHER}>
                              其他（手动输入 id）
                            </option>
                          </select>
                          {sel === CURSOR_AGENT_MODEL_SELECT_OTHER ? (
                            <input
                              type="text"
                              className="cli-mode-workspace cli-mode-workspace--triad-other"
                              value={raw}
                              onChange={(e) => patchCursorTriadField(lab, e.target.value)}
                              placeholder={meta.ph}
                              spellCheck={false}
                              aria-label={`${meta.title} 自定义`}
                            />
                          ) : null}
                        </div>
                      );
                    }
                    return (
                      <label key={lab} className="cli-mode-label">
                        {meta.title}
                        <input
                          type="text"
                          className="cli-mode-workspace"
                          value={cursorTriadInputs[lab]}
                          onChange={(e) => patchCursorTriadField(lab, e.target.value)}
                          placeholder={meta.ph}
                          spellCheck={false}
                        />
                      </label>
                    );
                  })
                )}
              </div>
            ) : isXiaoaiCli ? (
              <div className="cli-params-modal-body">
                <div className="cli-mode-label cli-mode-label--cli-template">
                  <CliInstructionHeader onExample={applyWorkbenchCliExample} />
                  <textarea
                    className="cli-mode-template"
                    value={activeMode.cliTemplate || DEFAULT_CLI_TEMPLATE}
                    onChange={(e) => onCliTemplateChange(e.target.value)}
                    spellCheck={false}
                    rows={4}
                    aria-label="完整指令"
                  />
                </div>
                <CliAngleSlotsEditor
                  slots={mergeAngleSlotsWithDefaults(
                    activeMode.cliTemplate || DEFAULT_CLI_TEMPLATE,
                    activeMode.angleSlots || []
                  )}
                  onChange={onCliAngleSlotsChange}
                />
              </div>
            ) : (
              <div className="cli-params-modal-body">
                <label className="cli-mode-label">
                  命令模板
                  <textarea
                    className="cli-mode-template"
                    value={activeMode.cliTemplate || DEFAULT_CLI_TEMPLATE}
                    onChange={(e) => onCliTemplateChange(e.target.value)}
                    spellCheck={false}
                    rows={4}
                  />
                </label>
                <label className="cli-mode-label">
                  工作区路径
                  <input
                    type="text"
                    className="cli-mode-workspace"
                    value={activeMode.cliWorkspace || ''}
                    onChange={(e) => onCliWorkspaceChange(e.target.value)}
                    placeholder={
                      cliWorkspaceFallbackStr.trim()
                        ? `未填时用服务端：${cliWorkspaceFallbackStr}`
                        : '/path/to/project'
                    }
                    spellCheck={false}
                  />
                </label>
              </div>
            )}
            <div className="cli-params-section-env">
              <h3 className="cli-params-subtitle">环境变量（可选）</h3>
              <p className="cli-params-modal-env-note">
                在「目标管理」中也可编辑；此处方便与 CLI 模板一并调整。
              </p>
              <CliEnvEditor
                value={normalizeCliEnvRecord(activeMode?.cliEnv)}
                onChange={(v) => {
                  if (!activeMode?.id) return;
                  setModes(updateCliModeFields(activeMode.id, { cliEnv: v }));
                }}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-primary-nav" onClick={() => setCliParamsModalOpen(false)}>
                完成
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modeModalOpen ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mode-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setModeModalOpen(false);
              setNewCliAngleSlotsPreset(null);
            }
          }}
        >
          <div className="modal-card">
            <h2 id="mode-modal-title" className="modal-title">
              添加自定义目标
            </h2>
            <p className="modal-desc">
              {newModeKind === 'xiaoai'
                ? 'CLI：完整指令可用尖括号占位与 {{变量}}；点「示例」可载入默认命令且占位均为自定义。仅保存在本机浏览器。'
                : 'HTTP：向指定 URL POST JSON（OpenAI Chat 或 AGUI 体）。仅保存在本机浏览器。'}
            </p>
            <form onSubmit={submitNewMode} className="modal-form">
              <label className="modal-label">
                类型
                <select
                  className="modal-input"
                  value={newModeKind}
                  onChange={(e) => {
                    const k = e.target.value;
                    setNewModeKind(k);
                    if (k === 'xiaoai' && !newXiaoaiTemplate.trim()) {
                      setNewXiaoaiTemplate(DEFAULT_CLI_TEMPLATE);
                      setNewCliAngleSlotsPreset(null);
                    }
                  }}
                >
                  <option value="http">HTTP</option>
                  <option value="xiaoai">CLI</option>
                </select>
              </label>
              <label className="modal-label">
                名称
                <input
                  className="modal-input"
                  value={newModeName}
                  onChange={(e) => setNewModeName(e.target.value)}
                  placeholder={newModeKind === 'xiaoai' ? '例如：本地 agent 流水线' : '例如：自建网关'}
                  required
                />
              </label>
              {newModeKind === 'http' ? (
                <>
                  <label className="modal-label">
                    请求 URL
                    <input
                      className="modal-input"
                      type="url"
                      value={newHttpUrl}
                      onChange={(e) => setNewHttpUrl(e.target.value)}
                      placeholder="https://…"
                      required
                      spellCheck={false}
                    />
                  </label>
                  <label className="modal-label">
                    协议
                    <select
                      className="modal-input"
                      value={newHttpProtocol}
                      onChange={(e) => setNewHttpProtocol(e.target.value)}
                    >
                      <option value="openai_chat">OpenAI Chat</option>
                      <option value="agui">AGUI</option>
                    </select>
                  </label>
                </>
              ) : (
                <div className="modal-label modal-label--cli-template">
                  <CliInstructionHeader
                    onExample={() => {
                      setNewXiaoaiTemplate(DEFAULT_CLI_TEMPLATE);
                      setNewCliAngleSlotsPreset(buildAllCustomAngleSlots(DEFAULT_CLI_TEMPLATE));
                    }}
                  />
                  <textarea
                    className="modal-textarea"
                    value={newXiaoaiTemplate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNewXiaoaiTemplate(v);
                      setNewCliAngleSlotsPreset((prev) =>
                        prev != null ? mergeAngleSlotsWithDefaults(v, prev) : null
                      );
                    }}
                    placeholder={DEFAULT_CLI_TEMPLATE}
                    rows={5}
                    spellCheck={false}
                    required
                    aria-label="完整指令"
                  />
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-clear"
                  onClick={() => {
                    setModeModalOpen(false);
                    setNewCliAngleSlotsPreset(null);
                  }}
                >
                  取消
                </button>
                <button type="submit" className="btn-copy">
                  添加
                </button>
              </div>
            </form>
            {customModes.length > 0 ? (
              <div className="modal-custom-list">
                <div className="modal-custom-head">已保存的自定义</div>
                <ul>
                  {customModes.map((m) => (
                    <li key={m.id} className="modal-custom-row">
                      <span>
                        {m.name}
                        <span className="modal-custom-kind">
                          {m.kind === 'http'
                          ? ' · HTTP'
                          : m.kind === 'cli'
                            ? m.cliVariant === 'xiaoai'
                              ? ' · CLI'
                              : m.cliVariant === 'cursor'
                                ? ' · Cursor'
                                : ' · CLI(旧)'
                            : ' · RESO'}
                        </span>
                      </span>
                      <button type="button" className="btn-danger-text" onClick={() => onDeleteCustomMode(m.id)}>
                        删除
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
