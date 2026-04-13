export const PORT = Number(process.env.PORT) || 3002;

export const DASHSCOPE_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/';
export const DEFAULT_ASR_MODEL = 'paraformer-realtime-v2';
export const ASR_MODEL_ID_RE = /^[a-zA-Z0-9_.-]{1,80}$/;

export const DASHSCOPE_CHAT_BASE =
  process.env.DASHSCOPE_COMPAT_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
export const DASHSCOPE_CHAT_MODEL = process.env.DASHSCOPE_CHAT_MODEL || 'qwen-plus';
export const CHAT_MODEL_ID_RE = /^[a-zA-Z0-9_.-]{1,80}$/;

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
