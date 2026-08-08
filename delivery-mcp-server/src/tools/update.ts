import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { checkForUpdates } from '../core/updater.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { ok, fail, type ToolContext } from './common.js';

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
      description:
        '检查 GitHub Releases 是否有新版本。默认走本地缓存（TTL 内不重复请求 GitHub）；传 force=true 强制重新请求。无网络时静默返回 network_error，不抛错。有新版本时需手动执行更新：node delivery-mcp-server/install.js --release。',
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
}