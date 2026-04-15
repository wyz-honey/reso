import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** `*.ts?url` / `new URL('*.ts')` ship untranspiled TS in prod; compile the worklet here instead. */
function pcmWorkletUrlPlugin(isServe: boolean): Plugin {
  const virtual = '\0virtual:pcm-worklet-url';
  const tsPath = path.join(__dirname, 'src/audio/pcmCaptureProcessor.ts');
  return {
    name: 'pcm-worklet-url',
    resolveId(id) {
      if (id === 'virtual:pcm-worklet-url') return virtual;
      return null;
    },
    load(id) {
      if (id !== virtual) return null;
      if (isServe) {
        return `export default ${JSON.stringify('/src/audio/pcmCaptureProcessor.ts')};`;
      }
      const raw = fs.readFileSync(tsPath, 'utf-8');
      const { code } = transformSync(raw, { loader: 'ts', target: 'es2020' });
      const ref = this.emitFile({
        type: 'asset',
        name: 'pcm-worklet.js',
        source: code,
      });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const rootEnv = loadEnv(mode, path.join(__dirname, '..'), '');
  const backendPort = rootEnv.PORT || '3002';
  const backendHttp = `http://127.0.0.1:${backendPort}`;

  const isDevServe = command === 'serve';
  const devAsrWs = isDevServe ? `ws://127.0.0.1:${backendPort}/ws/asr` : '';
  const devCursorWs = isDevServe ? `ws://127.0.0.1:${backendPort}/ws/cursor-tail` : '';
  const devUiControlWs = isDevServe ? `ws://127.0.0.1:${backendPort}/ws/ui-control` : '';

  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      __RESO_DEV_ASR_WS_URL__: JSON.stringify(devAsrWs),
      __RESO_DEV_CURSOR_WS_URL__: JSON.stringify(devCursorWs),
      __RESO_DEV_UI_CONTROL_WS_URL__: JSON.stringify(devUiControlWs),
    },
    build: { assetsInlineLimit: 0 },
    plugins: [tailwindcss(), react(), pcmWorkletUrlPlugin(isDevServe)],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: backendHttp,
          changeOrigin: true,
        },
        '/ws': {
          target: backendHttp,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
