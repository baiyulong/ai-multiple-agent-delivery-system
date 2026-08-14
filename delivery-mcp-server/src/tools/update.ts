import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { checkForUpdates } from '../core/updater.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { ok, fail, type ToolContext } from './common.js';
import { t } from '../core/i18n.js';

/**
 * 更新工具：update.check
 * 版本源为 GitHub Releases。检测自动跑（启动后台静默）。
 * 更新统一走 install.js --release（停进程 → 下载 → 删除旧版 → 拷贝 → 构建 → 启动），
 * 不在 MCP 内执行（进程内无法自停自身，Windows 存在文件锁风险）。
 */

export function registerUpdateTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'update.check',
    {
      description: t('tool.update.check.description'),
      inputSchema: {
        force: z.boolean().optional().describe(t('tool.update.check.force')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const state = await checkForUpdates(root, { force: args.force });
        return ok(state);
      } catch (e) {
        return fail('update_check_failed', t('tool.update.check.failed', { msg: (e as Error).message }));
      }
    },
  );
}