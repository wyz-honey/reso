import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode, command }) => {
  const rootEnv = loadEnv(mode, path.join(__dirname, '..'), '');
  const backendPort = rootEnv.PORT || '3002';
  const backendHttp = `http://127.0.0.1:${backendPort}`;

  const isDevServe = command === 'serve';
  const devAsrWs = isDevServe ? `ws://127.0.0.1:${backendPort}/ws/asr` : '';
  const devCursorWs = isDevServe ? `ws://127.0.0.1:${backendPort}/ws/cursor-tail` : '';

  return {
    define: {
      __RESO_DEV_ASR_WS_URL__: JSON.stringify(devAsrWs),
      __RESO_DEV_CURSOR_WS_URL__: JSON.stringify(devCursorWs),
    },
    plugins: [react()],
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
