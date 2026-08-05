import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { updateContextSection } from '../core/context-manager.js';
import { readContext } from '../core/store/task-store.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { fail, ok, type ToolContext } from './common.js';

/**
 * 共享上下文工具组（PRD 8.7 / 9.11 / 9.12）：
 * context.get_shared / context.update
 */

export function registerContextTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'context.get_shared',
    {
      description: '读取任务共享上下文 context.md（PRD 7.8 / 9.11）：项目背景、业务规则、统一语言、已确认决策、待确认问题等。',
      inputSchema: { task_id: z.string().describe('任务 ID') },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const content = await readContext(root, args.task_id);
        return ok({ content });
      } catch (e) {
        return fail('get_context_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'context.update',
    {
      description: '按章节更新共享上下文（PRD 9.12）。章节名如「统一语言表」或「5. 统一语言表」。',
      inputSchema: {
        task_id: z.string().describe('任务 ID'),
        section: z.string().describe('章节名'),
        content: z.string().describe('章节新内容（正文，不含标题）'),
        updated_by: z.string().optional().describe('更新人/Agent'),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const result = await updateContextSection(root, args.task_id, args.section, args.content);
        return ok({ ...result, updated_by: args.updated_by ?? null });
      } catch (e) {
        return fail('update_context_failed', (e as Error).message);
      }
    },
  );
}
