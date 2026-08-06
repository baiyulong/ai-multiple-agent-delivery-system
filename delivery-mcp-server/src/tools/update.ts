import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyUpdate, checkForUpdates } from '../core/updater.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { ok, fail, type ToolContext } from './common.js';

/**
 * 更新工具组：update.check / update.apply
 * 版本源为 GitHub Releases。检测自动跑（启动后台静默），更新需手动触发。
 */

export function registerUpdateTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'update.check',
    {
      description:
        '检查 GitHub Releases 是否有新版本。默认走本地缓存（TTL 内不重复请求 GitHub）；传 force=true 强制重新请求。无网络时静默返回 network_error，不抛错。',
      inputSchema: {
        force: z.boolean().optional().describe('强制重新请求 GitHub（忽略 TTL 缓存）'),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const state = await checkForUpdates(root, { force: args.force });
        return ok(state);
      } catch (e) {
        return fail('update_check_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'update.apply',
    {
      description:
        '手动触发更新到最新版本。需显式传入 confirm=true 才会执行。会 clone 最新 tag、备份并替换工具本体与角色文件，然后重新 install 与 build。',
      inputSchema: {
        confirm: z.boolean().describe('必须显式传 true 才执行更新，防止误触发'),
      },
    },
    async (args) => {
      if (args.confirm !== true) {
        return fail('confirmation_required', '必须显式传入 confirm=true 才会执行更新');
      }
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const result = await applyUpdate(root);
        return ok(result);
      } catch (e) {
        return fail('update_apply_failed', (e as Error).message);
      }
    },
  );
}