import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { updateContextSection } from '../core/context-manager.js';
import { readContext } from '../core/store/task-store.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { fail, ok, type ToolContext } from './common.js';
import { t } from '../core/i18n.js';

/**
 * 共享上下文工具组（PRD 8.7 / 9.11 / 9.12）：
 * context.get_shared / context.update
 */

export function registerContextTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'context.get_shared',
    {
      description: t('tool.context.get_shared.description'),
      inputSchema: { task_id: z.string().describe(t('tool.context.get_shared.task_id')) },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const content = await readContext(root, args.task_id);
        return ok({ content });
      } catch (e) {
        return fail('get_context_failed', t('tool.context.get_shared.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'context.update',
    {
      description: t('tool.context.update.description'),
      inputSchema: {
        task_id: z.string().describe(t('tool.context.update.task_id')),
        section: z.string().describe(t('tool.context.update.section')),
        content: z.string().describe(t('tool.context.update.content')),
        updated_by: z.string().optional().describe(t('tool.context.update.updated_by')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const result = await updateContextSection(root, args.task_id, args.section, args.content);
        return ok({ ...result, updated_by: args.updated_by ?? null });
      } catch (e) {
        return fail('update_context_failed', t('tool.context.update.failed', { msg: (e as Error).message }));
      }
    },
  );
}
