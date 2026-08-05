import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  isEmailConfigured,
  readEmailConfig,
  writeEmailConfig,
} from '../core/store/email-store.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { ok, fail, type ToolContext } from './common.js';

/**
 * 邮件工具组：email.get / email.set
 * 管理项目级 SMTP 邮件通知配置。pass 仅用于发送，绝不返回。
 */

/** 对外暴露的配置（不含 pass） */
function publicConfig(cfg: { host: string; port: number; secure: boolean; user: string; from: string }) {
  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    user: cfg.user,
    from: cfg.from,
  };
}

export function registerEmailTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'email.get',
    {
      description:
        '获取邮件通知配置（SMTP 服务器、端口、加密、账号、发件人）。出于安全考虑不返回密码。未配置时 configured=false。',
      inputSchema: {},
    },
    async () => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const configured = await isEmailConfigured(root);
        const cfg = await readEmailConfig(root);
        return ok({
          configured,
          config: cfg ? publicConfig(cfg) : null,
          updated_at: null,
        });
      } catch (e) {
        return fail('email_get_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'email.set',
    {
      description:
        '写入邮件通知配置（SMTP）。pass 仅用于发送，不会在返回中暴露。',
      inputSchema: {
        host: z.string().describe('SMTP 服务器地址'),
        port: z.number().int().describe('SMTP 端口'),
        secure: z.boolean().optional().describe('是否使用 TLS/SSL（465 端口通常为 true）'),
        user: z.string().describe('SMTP 账号'),
        pass: z.string().describe('SMTP 密码/授权码'),
        from: z.string().email().describe('发件人邮箱'),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const file = await writeEmailConfig(root, {
          host: args.host,
          port: args.port,
          secure: args.secure ?? false,
          user: args.user,
          pass: args.pass,
          from: args.from,
        });
        return ok({
          configured: true,
          config: publicConfig(file),
          updated_at: file.updated_at,
        });
      } catch (e) {
        return fail('email_set_failed', (e as Error).message);
      }
    },
  );
}