// @ts-nocheck — mirrors former HomePage local state; tighten types incrementally
import { create } from 'zustand';

function upd<T>(prev: T, next: T | ((p: T) => T)): T {
  return typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
}

export const useHomeWorkbenchRuntimeStore = create((set) => ({
  phase: 'idle',
  setPhase: (phase: string) => set({ phase }),

  status: '请新建会话或开始识别',
  setStatus: (status: string) => set({ status }),

  partialText: '',
  setPartialText: (partialText: string | ((p: string) => string)) =>
    set((s) => ({ partialText: upd(s.partialText, partialText) })),

  copyBusy: false,
  setCopyBusy: (copyBusy: boolean | ((p: boolean) => boolean)) =>
    set((s) => ({ copyBusy: upd(s.copyBusy, copyBusy) })),

  chatByModeId: {},
  setChatByModeId: (u: object | ((p: object) => object)) =>
    set((s: { chatByModeId: object }) => ({ chatByModeId: upd(s.chatByModeId, u) })),

  agentSendingByKey: {},
  setAgentSendingByKey: (u: object | ((p: object) => object)) =>
    set((s: { agentSendingByKey: object }) => ({ agentSendingByKey: upd(s.agentSendingByKey, u) })),

  httpSendingByKey: {},
  setHttpSendingByKey: (u: object | ((p: object) => object)) =>
    set((s: { httpSendingByKey: object }) => ({ httpSendingByKey: upd(s.httpSendingByKey, u) })),

  asrSessionId: null as string | null,
  setAsrSessionId: (asrSessionId: string | null | ((p: string | null) => string | null)) =>
    set((s: { asrSessionId: string | null }) => ({ asrSessionId: upd(s.asrSessionId, asrSessionId) })),

  cursorSessionFilePaths: null as unknown,
  setCursorSessionFilePaths: (v: unknown | ((p: unknown) => unknown)) =>
    set((s: { cursorSessionFilePaths: unknown }) => ({
      cursorSessionFilePaths: upd(s.cursorSessionFilePaths, v),
    })),

  cursorTailInfo: '',
  setCursorTailInfo: (cursorTailInfo: string) => set({ cursorTailInfo }),

  cursorTailError: '',
  setCursorTailError: (cursorTailError: string) => set({ cursorTailError }),

  cursorPendingUserPrompt: null as unknown,
  setCursorPendingUserPrompt: (v: unknown | ((p: unknown) => unknown)) =>
    set((s: { cursorPendingUserPrompt: unknown }) => ({
      cursorPendingUserPrompt: upd(s.cursorPendingUserPrompt, v),
    })),

  externalThreadsByProvider: {},
  setExternalThreadsByProvider: (u: object | ((p: object) => object)) =>
    set((s: { externalThreadsByProvider: object }) => ({
      externalThreadsByProvider: upd(s.externalThreadsByProvider, u),
    })),

  cursorEnsureStatus: 'idle',
  setCursorEnsureStatus: (cursorEnsureStatus: string) => set({ cursorEnsureStatus }),

  cursorEnsureErrorMsg: '',
  setCursorEnsureErrorMsg: (cursorEnsureErrorMsg: string) => set({ cursorEnsureErrorMsg }),

  cursorEnsureRetryNonce: 0,
  setCursorEnsureRetryNonce: (u: number | ((p: number) => number)) =>
    set((s: { cursorEnsureRetryNonce: number }) => ({
      cursorEnsureRetryNonce: upd(s.cursorEnsureRetryNonce, u),
    })),

  cursorStreamLoading: false,
  setCursorStreamLoading: (cursorStreamLoading: boolean | ((p: boolean) => boolean)) =>
    set((s: { cursorStreamLoading: boolean }) => ({
      cursorStreamLoading: upd(s.cursorStreamLoading, cursorStreamLoading),
    })),

  cursorWorkbenchBusySessionId: null as string | null,
  setCursorWorkbenchBusySessionId: (v: string | null | ((p: string | null) => string | null)) =>
    set((s: { cursorWorkbenchBusySessionId: string | null }) => ({
      cursorWorkbenchBusySessionId: upd(s.cursorWorkbenchBusySessionId, v),
    })),

  cursorRunActiveSessionId: null as string | null,
  setCursorRunActiveSessionId: (v: string | null | ((p: string | null) => string | null)) =>
    set((s: { cursorRunActiveSessionId: string | null }) => ({
      cursorRunActiveSessionId: upd(s.cursorRunActiveSessionId, v),
    })),

  cursorAwaitingCliPaste: false,
  setCursorAwaitingCliPaste: (cursorAwaitingCliPaste: boolean) => set({ cursorAwaitingCliPaste }),

  cursorQuietPrepare: false,
  setCursorQuietPrepare: (cursorQuietPrepare: boolean) => set({ cursorQuietPrepare }),

  workbenchSplitTabIds: [] as string[],
  setWorkbenchSplitTabIds: (u: string[] | ((p: string[]) => string[])) =>
    set((s: { workbenchSplitTabIds: string[] }) => ({
      workbenchSplitTabIds: upd(s.workbenchSplitTabIds, u),
    })),

  workbenchSessionAttachSelectKey: 0,
  setWorkbenchSessionAttachSelectKey: (u: number | ((p: number) => number)) =>
    set((s: { workbenchSessionAttachSelectKey: number }) => ({
      workbenchSessionAttachSelectKey: upd(s.workbenchSessionAttachSelectKey, u),
    })),

  cursorWorkbenchDbMessages: [] as unknown[],
  setCursorWorkbenchDbMessages: (u: unknown[] | ((p: unknown[]) => unknown[])) =>
    set((s: { cursorWorkbenchDbMessages: unknown[] }) => ({
      cursorWorkbenchDbMessages: upd(s.cursorWorkbenchDbMessages, u),
    })),
}));
