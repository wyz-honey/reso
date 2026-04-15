import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import type { AppDb } from '~/database/db.ts';
import { getChatThreadAgentMemory, setChatThreadAgentMemory } from '~/services/chatThreadService.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, 'skills');

const SAFE_SKILL = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.md$/;

function textResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    details: undefined as undefined,
  };
}

export function buildResoAgentTools(ctx: { db: AppDb; threadId: string }): AgentTool<any>[] {
  const { db, threadId } = ctx;

  const reso_memory_read: AgentTool = {
    name: 'reso_memory_read',
    label: '读取线程记忆',
    description: '读取当前对话线程已保存的知识库记忆（纯文本）。',
    parameters: Type.Object({}),
    execute: async () => {
      const mem = await getChatThreadAgentMemory(db, threadId);
      return textResult(mem.trim() ? mem : '（暂无记忆）');
    },
  };

  const reso_memory_append: AgentTool = {
    name: 'reso_memory_append',
    label: '追加线程记忆',
    description: '向当前线程知识库追加一条笔记（多行字符串）。',
    parameters: Type.Object({
      note: Type.String({ description: '要追加的笔记内容' }),
    }),
    execute: async (_id, params) => {
      const p = params as { note?: string };
      const note = typeof p.note === 'string' ? p.note.trim() : '';
      if (!note) {
        return textResult('未追加：note 为空');
      }
      const cur = await getChatThreadAgentMemory(db, threadId);
      const next = cur ? `${cur}\n\n${note}` : note;
      await setChatThreadAgentMemory(db, threadId, next);
      return textResult('已追加到线程记忆。');
    },
  };

  const reso_list_skills: AgentTool = {
    name: 'reso_list_skills',
    label: '列出技能文件',
    description: '列出内置技能 Markdown 文件名（不含路径）。',
    parameters: Type.Object({}),
    execute: async () => {
      let names: string[] = [];
      try {
        const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
        names = entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);
      } catch {
        names = [];
      }
      return textResult(names.length ? names.join('\n') : '（无技能文件）');
    },
  };

  const reso_read_skill: AgentTool = {
    name: 'reso_read_skill',
    label: '读取技能',
    description: '读取 server/agents/reso/skills 下某个 .md 技能文件正文。',
    parameters: Type.Object({
      filename: Type.String({ description: '例如 reso-core.md' }),
    }),
    execute: async (_id, params) => {
      const p = params as { filename?: string };
      const name = typeof p.filename === 'string' ? p.filename.trim() : '';
      if (!SAFE_SKILL.test(name)) {
        return textResult('拒绝：filename 只允许安全文件名（*.md）');
      }
      try {
        const body = await readFile(join(SKILLS_DIR, name), 'utf8');
        const max = 24_000;
        const text = body.length > max ? `${body.slice(0, max)}\n\n…（已截断）` : body;
        return textResult(text);
      } catch {
        return textResult(`无法读取：${name}`);
      }
    },
  };

  return [reso_memory_read, reso_memory_append, reso_list_skills, reso_read_skill];
}
