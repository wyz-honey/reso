// 在 index 里最先 import：先加载仓库根目录 .env，再执行其它模块（否则会读不到 PORT、PG_* 等）。
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const rootEnv = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: rootEnv });

if (process.env.PG_DEBUG === '1') {
  console.log('[loadEnv]', rootEnv);
}
