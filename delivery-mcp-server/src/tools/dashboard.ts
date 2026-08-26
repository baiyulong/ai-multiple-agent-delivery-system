import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { dashboardStatus, startDashboard, stopDashboard } from '../core/dashboard-manager.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { fail, ok, type ToolContext } from './common.js';
import { t } from '../core/i18n.js';

/**
 * 看板管理工具组：dashboard.start / dashboard.stop / dashboard.status
 *
 * 目的：AI 可直接通过 MCP 工具启停看板，无需查找源码或构造启动命令。
 * 启动为 detached 独立进程（不随 MCP server 退出），日志在 <数据根>/dashboard.log。
 */

export function registerDashboardTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'dashboard.start',
    {
      description: t('tool.dashboard.start.description'),
      inputSchema: {
        confirm: z.boolean().optional().describe(t('tool.dashboard.start.confirm')),
      },
    },
    async () => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const result = await startDashboard(root);
        return ok({
          ...result,
          hint: result.already_running
            ? t('tool.dashboard.start.hint_already_running')
            : t('tool.dashboard.start.hint_started'),
        });
      } catch (e) {
        return fail('dashboard_start_failed', t('tool.dashboard.start.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'dashboard.stop',
    {
      description: t('tool.dashboard.stop.description'),
      inputSchema: {},
    },
    async () => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const result = await stopDashboard(root);
        return ok(result);
      } catch (e) {
        return fail('dashboard_stop_failed', t('tool.dashboard.stop.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'dashboard.status',
    {
      description: t('tool.dashboard.status.description'),
      inputSchema: {},
    },
    async () => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        return ok(await dashboardStatus(root));
      } catch (e) {
        return fail('dashboard_status_failed', t('tool.dashboard.status.failed', { msg: (e as Error).message }));
      }
    },
  );
}
