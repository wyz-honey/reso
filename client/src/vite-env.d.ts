/// <reference types="vite/client" />

declare const __RESO_DEV_ASR_WS_URL__: string;
declare const __RESO_DEV_CURSOR_WS_URL__: string;

declare module '*?url' {
  const src: string;
  export default src;
}
