// @ts-nocheck
import { create } from 'zustand';
import { DEFAULT_CLI_TEMPLATE } from '../workModes';
import { parseOutputVoiceControl } from '../outputVoiceControl';

function upd<T>(prev: T, next: T | ((p: T) => T)): T {
  return typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
}

function emptyDraft() {
  return {
    name: '',
    description: '',
    deliveryType: 'http',
    httpProtocol: 'openai_chat',
    requestUrl: '',
    outputShape: '',
    extJson: '{}',
    commandTemplate: '',
    cliTemplate: DEFAULT_CLI_TEMPLATE,
    cliWorkspace: '',
    systemPrompt: '',
    angleSlots: [],
    voiceControl: parseOutputVoiceControl(undefined, 'http'),
    targetEnv: {},
  };
}

export const useOutputsPageStore = create((set) => ({
  tick: 0,
  setTick: (u) => set((s) => ({ tick: upd(s.tick, u) })),
  searchInput: '',
  setSearchInput: (searchInput) => set({ searchInput }),
  searchQ: '',
  setSearchQ: (searchQ) => set({ searchQ }),
  filterType: 'all',
  setFilterType: (filterType) => set({ filterType }),
  filterKind: 'all',
  setFilterKind: (filterKind) => set({ filterKind }),
  page: 1,
  setPage: (page) => set((s) => ({ page: upd(s.page, page) })),
  pageSize: 10,
  setPageSize: (pageSize) => set((s) => ({ pageSize: upd(s.pageSize, pageSize) })),
  expandedId: null,
  setExpandedId: (expandedId) => set({ expandedId }),
  draft: emptyDraft(),
  setDraft: (u) => set((s) => ({ draft: upd(s.draft, u) })),
  modalOpen: false,
  setModalOpen: (modalOpen) => set({ modalOpen }),
  modalDraft: emptyDraft(),
  setModalDraft: (u) => set((s) => ({ modalDraft: upd(s.modalDraft, u) })),
  formErr: '',
  setFormErr: (formErr) => set({ formErr }),
  msg: '',
  setMsg: (msg) => set({ msg }),
}));
