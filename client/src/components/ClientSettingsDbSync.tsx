import { useEffect, useRef } from 'react';
import { fetchClientSettings, putClientSettings } from '../api';
import {
  loadModelProviderState,
  migrateModelProvidersFromServerPayload,
  useModelProvidersStore,
} from '../stores/modelProvidersStore';
import {
  parseVoiceSettingsFromServer,
  saveVoiceSettings,
  useVoiceSettingsStore,
} from '../stores/voiceSettingsStore';

type PersistApi = {
  hasHydrated?: () => boolean;
  onFinishHydration?: (fn: () => void) => () => void;
};

function whenPersistHydrated(store: { persist?: PersistApi }): Promise<void> {
  const p = store.persist;
  if (!p?.onFinishHydration) return Promise.resolve();
  if (typeof p.hasHydrated === 'function' && p.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = p.onFinishHydration!(() => {
      unsub();
      resolve();
    });
  });
}

function isServerVoiceEmpty(v: unknown): boolean {
  return !v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v as object).length === 0;
}

function isServerModelCatalogEmpty(mp: unknown): boolean {
  if (!mp || typeof mp !== 'object' || Array.isArray(mp)) return true;
  const o = mp as Record<string, unknown>;
  if (o.version !== 1 || !Array.isArray(o.providers) || !Array.isArray(o.models)) return true;
  return o.providers.length === 0 || o.models.length === 0;
}

function buildClientSettingsPayload() {
  const vs = useVoiceSettingsStore.getState();
  return {
    voice: {
      agentModel: vs.agentModel,
      dashscopeApiKey: vs.dashscopeApiKey,
      asrDisfluencyRemoval: vs.asrDisfluencyRemoval,
      asrLanguageHintsText: vs.asrLanguageHintsText,
      oralStripEnabled: vs.oralStripEnabled,
      oralStripPhrasesText: vs.oralStripPhrasesText,
    },
    modelProviders: loadModelProviderState(),
  };
}

/**
 * 在 localStorage 水合之后拉取 Postgres 中的工作台设置；空库则把当前本机状态写入一行。
 * 之后对语音设置与模型目录的变更会防抖同步到服务端。
 */
export default function ClientSettingsDbSync() {
  const applyingRemoteRef = useRef(false);
  const syncOkRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unsubVoice: (() => void) | undefined;
    let unsubModel: (() => void) | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const schedulePush = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        if (cancelled || applyingRemoteRef.current || !syncOkRef.current) return;
        void putClientSettings(buildClientSettingsPayload());
      }, 900);
    };

    void (async () => {
      await Promise.all([
        whenPersistHydrated(useVoiceSettingsStore),
        whenPersistHydrated(useModelProvidersStore),
      ]);
      if (cancelled) return;

      const row = await fetchClientSettings();
      if (cancelled) return;
      if (!row) return;

      applyingRemoteRef.current = true;
      const vEmpty = isServerVoiceEmpty(row.voice);
      const mEmpty = isServerModelCatalogEmpty(row.modelProviders);
      if (vEmpty && mEmpty) {
        await putClientSettings(buildClientSettingsPayload());
      } else {
        if (!vEmpty) {
          saveVoiceSettings(parseVoiceSettingsFromServer(row.voice));
        }
        if (!mEmpty) {
          const m = migrateModelProvidersFromServerPayload(row.modelProviders);
          useModelProvidersStore.setState({
            version: m.version,
            providers: m.providers,
            models: m.models,
            defaults: m.defaults,
            resoAgent: m.resoAgent,
          });
          try {
            window.dispatchEvent(new CustomEvent('reso-providers-changed'));
          } catch {
            /* ignore */
          }
        }
      }
      applyingRemoteRef.current = false;

      syncOkRef.current = true;
      unsubVoice = useVoiceSettingsStore.subscribe(() => {
        if (!syncOkRef.current || applyingRemoteRef.current) return;
        schedulePush();
      });
      unsubModel = useModelProvidersStore.subscribe(() => {
        if (!syncOkRef.current || applyingRemoteRef.current) return;
        schedulePush();
      });
    })();

    return () => {
      cancelled = true;
      syncOkRef.current = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubVoice?.();
      unsubModel?.();
    };
  }, []);

  return null;
}
