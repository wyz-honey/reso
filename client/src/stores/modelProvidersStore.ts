import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getVoiceSettings } from './voiceSettingsStore';

const STORAGE_KEY = 'reso_model_providers_v1';

export const PROVIDER_KIND_LABELS = {
  dashscope: '百炼 Compatible',
} as const;

export const MODEL_CATEGORIES = {
  speech: 'speech',
  chat: 'chat',
} as const;

export type ModelCategory = (typeof MODEL_CATEGORIES)[keyof typeof MODEL_CATEGORIES];

export const MODEL_CATEGORY_LABELS = {
  speech: '语音识别',
  chat: '对话 / 大语言模型',
} as const;

const CHAT_PRESETS = [
  { apiModelId: 'qwen-plus', label: 'qwen-plus' },
  { apiModelId: 'qwen-turbo', label: 'qwen-turbo' },
  { apiModelId: 'qwen-max', label: 'qwen-max' },
  { apiModelId: 'qwen-long', label: 'qwen-long' },
  { apiModelId: 'qwen-vl-plus', label: 'qwen-vl-plus' },
  { apiModelId: 'qwen2.5-7b-instruct', label: 'qwen2.5-7b-instruct' },
  { apiModelId: 'qwen2.5-14b-instruct', label: 'qwen2.5-14b-instruct' },
  { apiModelId: 'qwen2.5-32b-instruct', label: 'qwen2.5-32b-instruct' },
  { apiModelId: 'qwen2.5-72b-instruct', label: 'qwen2.5-72b-instruct' },
] as const;

export interface ProviderRecord {
  id: string;
  kind: string;
  name: string;
  compatBaseUrl?: string;
  apiKey?: string;
}

export interface ModelRecord {
  id: string;
  providerId: string;
  category: ModelCategory;
  apiModelId: string;
  label: string;
}

export interface ModelProviderPersisted {
  version: number;
  providers: ProviderRecord[];
  models: ModelRecord[];
  defaults: { speechModelId: string; chatModelId: string };
  resoAgent: { providerId: string | null; modelId: string | null };
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultProviderState(): ModelProviderPersisted {
  const pid = 'pv_bailian';
  const models: ModelRecord[] = [
    {
      id: 'm_paraformer_rt',
      providerId: pid,
      category: MODEL_CATEGORIES.speech,
      apiModelId: 'paraformer-realtime-v2',
      label: 'Paraformer 实时 v2',
    },
    ...CHAT_PRESETS.map((c, i) => ({
      id: `m_qwen_${i}`,
      providerId: pid,
      category: MODEL_CATEGORIES.chat as ModelCategory,
      apiModelId: c.apiModelId,
      label: c.label,
    })),
  ];
  return {
    version: 1,
    providers: [
      {
        id: pid,
        kind: 'dashscope',
        name: '阿里云百炼',
        compatBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: '',
      },
    ],
    models,
    defaults: {
      speechModelId: 'm_paraformer_rt',
      chatModelId: 'm_qwen_0',
    },
    resoAgent: {
      providerId: null,
      modelId: null,
    },
  };
}

function migrate(raw: unknown): ModelProviderPersisted {
  if (!raw || typeof raw !== 'object') return createDefaultProviderState();
  const o = raw as Record<string, unknown>;
  if (o.version !== 1 || !Array.isArray(o.providers) || !Array.isArray(o.models)) {
    return createDefaultProviderState();
  }
  const ra = o.resoAgent as Record<string, unknown> | undefined;
  const d = o.defaults as Record<string, unknown> | undefined;
  return {
    version: 1,
    providers: o.providers as ProviderRecord[],
    models: o.models as ModelRecord[],
    defaults: {
      speechModelId: d?.speechModelId?.toString() || 'm_paraformer_rt',
      chatModelId: d?.chatModelId?.toString() || 'm_qwen_0',
    },
    resoAgent: {
      providerId: (ra?.providerId as string | null) ?? null,
      modelId: (ra?.modelId as string | null) ?? null,
    },
  };
}

type Actions = {
  updateProvider: (providerId: string, patch: Partial<ProviderRecord>) => void;
  addModel: (args: {
    providerId: string;
    category: ModelCategory;
    apiModelId: string;
    label: string;
  }) => void;
  removeModel: (modelId: string) => void;
  setDefaultModelIds: (patch: { speechModelId?: string; chatModelId?: string }) => void;
  saveResoAgentBinding: (patch: { providerId?: string | null; modelId?: string | null }) => void;
  resetCatalog: () => void;
};

export type ModelProvidersState = ModelProviderPersisted & Actions;

export const useModelProvidersStore = create<ModelProvidersState>()(
  persist(
    (set) => ({
      ...createDefaultProviderState(),
      updateProvider: (providerId, patch) =>
        set((state) => {
          const i = state.providers.findIndex((p) => p.id === providerId);
          if (i < 0) return state;
          const cur = state.providers[i];
          const providers = [...state.providers];
          providers[i] = {
            ...cur,
            ...patch,
            name: patch.name != null ? String(patch.name).trim() || cur.name : cur.name,
            compatBaseUrl:
              patch.compatBaseUrl != null ? String(patch.compatBaseUrl).trim() : cur.compatBaseUrl,
            apiKey: patch.apiKey != null ? String(patch.apiKey) : cur.apiKey,
          };
          return { providers };
        }),
      addModel: ({ providerId, category, apiModelId, label }) =>
        set((state) => {
          const pid = String(providerId || '').trim();
          const cat =
            category === MODEL_CATEGORIES.speech ? MODEL_CATEGORIES.speech : MODEL_CATEGORIES.chat;
          const aid = String(apiModelId || '').trim();
          const lab = String(label || '').trim() || aid;
          if (!pid || !aid) return state;
          return {
            models: [
              ...state.models,
              { id: uid('md'), providerId: pid, category: cat, apiModelId: aid, label: lab },
            ],
          };
        }),
      removeModel: (modelId) =>
        set((state) => {
          const models = state.models.filter((m) => m.id !== modelId);
          let speechModelId = state.defaults.speechModelId;
          let chatModelId = state.defaults.chatModelId;
          if (speechModelId === modelId) {
            speechModelId = models.find((m) => m.category === MODEL_CATEGORIES.speech)?.id || '';
          }
          if (chatModelId === modelId) {
            chatModelId = models.find((m) => m.category === MODEL_CATEGORIES.chat)?.id || '';
          }
          let resoAgent = state.resoAgent;
          if (resoAgent.modelId === modelId) {
            resoAgent = { ...resoAgent, modelId: null };
          }
          return { models, defaults: { speechModelId, chatModelId }, resoAgent };
        }),
      setDefaultModelIds: (patch) =>
        set((state) => ({
          defaults: {
            speechModelId:
              patch.speechModelId != null ? patch.speechModelId : state.defaults.speechModelId,
            chatModelId: patch.chatModelId != null ? patch.chatModelId : state.defaults.chatModelId,
          },
        })),
      saveResoAgentBinding: (patch) =>
        set((state) => ({
          resoAgent: {
            providerId: patch.providerId === undefined ? state.resoAgent.providerId : patch.providerId,
            modelId: patch.modelId === undefined ? state.resoAgent.modelId : patch.modelId,
          },
        })),
      resetCatalog: () => set(() => ({ ...createDefaultProviderState() })),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({
        version: s.version,
        providers: s.providers,
        models: s.models,
        defaults: s.defaults,
        resoAgent: s.resoAgent,
      }),
      merge: (persisted, current) => {
        if (persisted == null || typeof persisted !== 'object') return current;
        const p = migrate(persisted);
        return {
          ...current,
          version: p.version,
          providers: p.providers,
          models: p.models,
          defaults: p.defaults,
          resoAgent: p.resoAgent,
        };
      },
    }
  )
);

export function loadModelProviderState(): ModelProviderPersisted {
  const s = useModelProvidersStore.getState();
  return {
    version: s.version,
    providers: s.providers,
    models: s.models,
    defaults: s.defaults,
    resoAgent: s.resoAgent,
  };
}

export function getResoAgentBinding() {
  const st = loadModelProviderState();
  return {
    providerId: st.resoAgent.providerId || null,
    modelId: st.resoAgent.modelId || null,
  };
}

export function getModelById(id: string | null | undefined): ModelRecord | null {
  if (!id) return null;
  return loadModelProviderState().models.find((m) => m.id === id) || null;
}

export function getProviderById(id: string | null | undefined): ProviderRecord | null {
  if (!id) return null;
  return loadModelProviderState().providers.find((p) => p.id === id) || null;
}

export function getApiKeyForModelRecord(modelId: string | null | undefined): string {
  const m = getModelById(modelId ?? '');
  if (!m) return getVoiceSettings().dashscopeApiKey.trim() || '';
  const p = getProviderById(m.providerId);
  if (p?.apiKey && String(p.apiKey).trim()) return String(p.apiKey).trim();
  return getVoiceSettings().dashscopeApiKey.trim() || '';
}

export function getResolvedSpeechAsrApiModelId(): string {
  const st = loadModelProviderState();
  const m = getModelById(st.defaults.speechModelId);
  return m?.apiModelId || 'paraformer-realtime-v2';
}

export function getResolvedResoChatApiModelId(): string {
  const st = loadModelProviderState();
  const mid = st.resoAgent.modelId || st.defaults.chatModelId;
  const m = getModelById(mid);
  return m?.apiModelId ? String(m.apiModelId).trim() : '';
}

export function getResolvedResoChatApiKey(): string {
  const st = loadModelProviderState();
  if (st.resoAgent.providerId) {
    const p = getProviderById(st.resoAgent.providerId);
    if (p?.apiKey && String(p.apiKey).trim()) return String(p.apiKey).trim();
  }
  const mid = st.resoAgent.modelId || st.defaults.chatModelId;
  return getApiKeyForModelRecord(mid);
}

export function getResolvedSpeechApiKey(): string {
  return getApiKeyForModelRecord(loadModelProviderState().defaults.speechModelId);
}

export function listModelsByCategory(category: ModelCategory): ModelRecord[] {
  return loadModelProviderState().models.filter((m) => m.category === category);
}

export function listModelsForProviderAndCategory(
  providerId: string,
  category: ModelCategory
): ModelRecord[] {
  return loadModelProviderState().models.filter(
    (m) => m.providerId === providerId && m.category === category
  );
}

/** 非 React 调用，与旧 API 兼容 */
export function updateProvider(providerId: string, patch: Partial<ProviderRecord>): void {
  useModelProvidersStore.getState().updateProvider(providerId, patch);
}

export function addModel(args: {
  providerId: string;
  category: ModelCategory;
  apiModelId: string;
  label: string;
}): void {
  useModelProvidersStore.getState().addModel(args);
}

export function removeModel(modelId: string): void {
  useModelProvidersStore.getState().removeModel(modelId);
}

export function setDefaultModelIds(patch: { speechModelId?: string; chatModelId?: string }): void {
  useModelProvidersStore.getState().setDefaultModelIds(patch);
}

export function saveResoAgentBinding(patch: {
  providerId?: string | null;
  modelId?: string | null;
}): void {
  useModelProvidersStore.getState().saveResoAgentBinding(patch);
}

export function saveModelProviderState(next: ModelProviderPersisted): ModelProviderPersisted {
  useModelProvidersStore.setState({
    version: next.version,
    providers: next.providers,
    models: next.models,
    defaults: next.defaults,
    resoAgent: next.resoAgent,
  });
  return next;
}

export function resetModelProvidersCatalog(): void {
  useModelProvidersStore.getState().resetCatalog();
}
