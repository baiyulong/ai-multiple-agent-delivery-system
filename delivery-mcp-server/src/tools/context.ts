import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { updateContextSection } from '../core/context-manager.js';
import { readContext } from '../core/store/task-store.js';
import { readProjectBackground, writeProjectBackground } from '../core/store/project-context.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { fail, ok, type ToolContext } from './common.js';
import { t } from '../core/i18n.js';

/**
 * 共享上下文工具组（PRD 8.7 / 9.11 / 9.12）：
 * context.get_shared / context.update / context.get_project_background / context.set_project_background
 */

export function registerContextTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'context.get_project_background',
    {
      description: t('tool.context.get_project_background.description'),
      inputSchema: {},
    },
    async () => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const content = await readProjectBackground(root);
        return ok({
          content,
          exists: content !== null,
          hint:
            content === null
              ? t('tool.context.get_project_background.hint_missing')
              : t('tool.context.get_project_background.hint_present'),
        });
      } catch (e) {
        return fail('get_project_background_failed', t('tool.context.get_project_background.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'context.set_project_background',
    {
      description: t('tool.context.set_project_background.description'),
      inputSchema: {
        content: z.string().min(1).describe(t('tool.context.set_project_background.content')),
        updated_by: z.string().optional().describe(t('tool.context.set_project_background.updated_by')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        await writeProjectBackground(root, args.content);
        return ok({ bytes: Buffer.byteLength(args.content, 'utf-8'), updated_by: args.updated_by ?? null });
      } catch (e) {
        return fail('set_project_background_failed', t('tool.context.set_project_background.failed', { msg: (e as Error).message }));
      }
    },
  );

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
