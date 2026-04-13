# reso · 同频

你不是在「打开又一个聊天框」，而是在调频。

**reso**（*REE-soh*，来自 **resonance** —— **谐振**）想做一件事：让你的**意识流**和 **AI** 真正**同频共振**。嘴还在说、念头还在跳，语音已经流进模型，上下文不断档；像两个人站在同一块板上，节奏对齐了，振幅会突然叠上去 —— 那就是工作里少见的**极致生产力**：少打断、少复述、少从空白里重新解释自己。

这是一款面向**深度工作**的 **Voice Agent** 式 Web 应用：**说话即驱动**，口述、转写、对话与落库连成一条线，专为「边想边说边产出」的场景而设。

---

## 为什么叫「同频」与 reso

物理里，**谐振**是频率对上了，能量才能高效传递。日常里我们说的**同频**，其实是同一种直觉：不是听没听见，而是**懂不懂、跟不跟得上**。

和 AI 协作时，最大的摩擦往往来自**频道错位** —— 你要从头交代背景，它要等你打完字，你的思路已经拐到下一个弯。reso 相信：当人的念头、嘴上的句子、屏幕上的助手和背后的记忆**锁在同一相位**时，那种顺畅感会像共振峰一样明显 —— **省下来的全是认知带宽**，多出来的全是可交付的产出。

名字 **reso** 就是 **resonance** 的缩写感：**人与 AI 同频**，**语音与工作流同频**。产品里体现为：边说边记、模式一键切换、对话有线程可追溯，让「当下这一刻的你」和「一直在线的助手」始终在同一个工作频道里。

---

## 能做什么

- **Voice Agent 管线**：浏览器实时采音 → 服务端流式 ASR（阿里云百炼 DashScope / Paraformer 等）→ 与对话模型衔接，适合**站着想、走着说、双手不离键盘以外工作**的流程。
- **会话与段落**：PostgreSQL 持久化会话与分段内容，支持编号、复制与历史回顾，想法落盘不丢。
- **多工作模式**：预设与自定义模式，系统提示与流程按场景切换，同一套语音入口，多种「工作人格」。
- **智能 Agent**：基于 Qwen 兼容 Chat API；线程按模式绑定，**落库保存**，刷新或换设备（同一浏览器本地线程映射）仍可续聊。

---

## 技术栈

| 层级 | 说明 |
|------|------|
| 前端 | React 18、Vite 6、React Router |
| 服务端 | Node.js、Express、WebSocket（`ws`） |
| 数据 | PostgreSQL；[Drizzle ORM](https://orm.drizzle.team/) + `pg`（表结构见 `server/src/database/schema.ts`；新库可执行 `server/database/bootstrap.sql`） |
| 语音 / 模型 | 阿里云 DashScope（ASR + Chat） |

---

## 快速开始

**环境**：Node.js 18+（建议 LTS）。

```bash
# 安装依赖（根目录 workspaces：server + client）
npm install

# 配置环境变量（见下方）
cp .env.example .env
# 编辑 .env：至少填写 DASHSCOPE_API_KEY；若需存会话/对话，填写 PostgreSQL

# 同时启动 API 与前端开发服务
npm run dev
```

- 前端开发地址：<http://localhost:5173>（通过 Vite 代理 `/api`、`/ws` 到后端）
- 后端端口：由根目录 `.env` 中 `PORT` 决定（默认与示例中为 `3002`，避免与本机其他服务冲突）

生产构建前端：

```bash
npm run build -w client
```

生产启动后端：

```bash
npm run start -w server
```

排查数据库连接与 `sessions` / `quick_inputs` 条数（读仓库根目录 `.env`）：

```bash
npm run test-db -w server
```

### 会话 REST API（节选）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/sessions` | 新建会话，响应 `{ id }` |
| `GET` | `/api/sessions` | 列表；查询参数：`q`、`filter`（`all` \| `with` \| `empty`）、`page`、`pageSize` |
| `GET` | `/api/sessions/:sessionId` | 会话详情含段落 |
| `DELETE` | `/api/sessions/:sessionId` | 删除该会话（段落随外键级联删除） |
| `POST` | `/api/sessions/batch-delete` | **批量删除**：请求体 JSON `{ "ids": ["uuid", ...] }`，最多 **100** 条；响应 `{ ok: true, deleted: number }` |

---

## 环境变量

详见仓库根目录 **[`.env.example`](./.env.example)**。摘要：

| 变量 | 作用 |
|------|------|
| `DASHSCOPE_API_KEY` | 百炼 API Key（必填，用于 ASR 与 Agent） |
| `PORT` | 后端 HTTP/WebSocket 端口 |
| `DASHSCOPE_CHAT_MODEL` | 对话模型（如 `qwen-plus`） |
| `OPC_PG_*` / `OPC_PG_DATABASE` | PostgreSQL 连接；不配则部分存库功能不可用 |

---

## 仓库结构

```
reso/
├── client/          # Vite + React 前端
├── server/          # Express + WebSocket；`src/database/` 为 Drizzle schema；`~/` → `server/src/`（tsconfig paths）
├── package.json     # workspaces 与并发 dev 脚本
└── .env.example     # 环境变量模板
```

---

## 许可与声明

本项目为私有用途配置；使用第三方云服务（DashScope、RDS 等）时请遵守各自服务条款与合规要求。

---

**reso · 同频** — *Mind and model, in resonance. Work that compounds.*
