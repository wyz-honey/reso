// @ts-nocheck — aligned with HomePage incremental typing
import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { fetchQuickInputs, fetchServerMeta, fetchSessionList } from '../../api';
import { setResolvedExternalThreadProviderFromServer } from '../../resolvedExternalThread';
import { useHomeWorkbenchModesStore } from '../../stores/homeWorkbenchModesStore';
import { useHomeWorkbenchBootstrapStore } from '../../stores/homeWorkbenchBootstrapStore';

type BootstrapOpts = {
  isAsr: boolean;
  isCli: boolean;
  isHttp: boolean;
  isAgent: boolean;
  asrSessionId: string | null;
};

export function useHomeWorkbenchBootstrap({
  isAsr,
  isCli,
  isHttp,
  isAgent,
  asrSessionId,
}: BootstrapOpts) {
  const {
    quickInputs,
    setQuickInputs,
    serverWorkspaceFallback,
    setServerWorkspaceFallback,
    workspacePickSessions,
    setWorkspacePickSessions,
    workspacePickLoading,
    setWorkspacePickLoading,
    workspacePickErr,
    setWorkspacePickErr,
  } = useHomeWorkbenchBootstrapStore(
    useShallow((s) => ({
      quickInputs: s.quickInputs,
      setQuickInputs: s.setQuickInputs,
      serverWorkspaceFallback: s.serverWorkspaceFallback,
      setServerWorkspaceFallback: s.setServerWorkspaceFallback,
      workspacePickSessions: s.workspacePickSessions,
      setWorkspacePickSessions: s.setWorkspacePickSessions,
      workspacePickLoading: s.workspacePickLoading,
      setWorkspacePickLoading: s.setWorkspacePickLoading,
      workspacePickErr: s.workspacePickErr,
      setWorkspacePickErr: s.setWorkspacePickErr,
    }))
  );

  const loadQuickInputs = useCallback(async () => {
    try {
      const list = await fetchQuickInputs();
      setQuickInputs(Array.isArray(list) ? list : []);
    } catch {
      setQuickInputs([]);
    }
  }, [setQuickInputs]);

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
        useHomeWorkbenchModesStore.getState().refreshModesFromCatalog();
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedExternalThreadProviderFromServer(undefined);
          setServerWorkspaceFallback('');
          useHomeWorkbenchModesStore.getState().refreshModesFromCatalog();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setServerWorkspaceFallback]);

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
  }, [setWorkspacePickErr, setWorkspacePickLoading, setWorkspacePickSessions]);

  useEffect(() => {
    if (!isAsr && !isCli && !isHttp && !isAgent) return;
    loadWorkspacePickSessions();
  }, [isAsr, isCli, isHttp, isAgent, loadWorkspacePickSessions]);

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

  return {
    quickInputs,
    serverWorkspaceFallback,
    workspacePickSessions,
    workspacePickLoading,
    workspacePickErr,
    loadWorkspacePickSessions,
    workspacePickOptions,
  };
}
