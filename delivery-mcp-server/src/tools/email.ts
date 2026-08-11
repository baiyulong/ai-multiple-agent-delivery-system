import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  isEmailConfigured,
  readEmailConfig,
  writeEmailConfig,
} from '../core/store/email-store.js';
import { isUserConfigured } from '../core/store/user-store.js';
import { PRESET_KEYS, SMTP_PRESETS, resolveEmailConfig } from '../core/smtp-presets.js';
import { ok, fail, type ToolContext } from './common.js';

/**
 * 邮件工具组：email.get / email.set / email.providers
 * 管理"当前操作人"的个人级 SMTP 邮件通知配置（存储于用户主目录 user.json，
 * 跨项目沿用），不使用项目级/全局配置。pass 仅用于发送，绝不返回。
 * email.set 支持只提供邮箱+授权码，host/port/secure 按服务商预设自动填充。
 */

/** 对外暴露的配置（不含 pass） */
function publicConfig(cfg: { host: string; port: number; secure: boolean; user: string; from: string; provider?: string }) {
  return {
    provider: cfg.provider ?? null,
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
        '获取当前操作人的邮件通知配置（SMTP 服务器、端口、加密、账号、发件人）。配置属于当前用户个人，存储于用户主目录，跨项目沿用。出于安全考虑不返回密码。未配置时 configured=false。',
      inputSchema: {},
    },
    async () => {
      try {
        const configured = await isEmailConfigured();
        const cfg = await readEmailConfig();
        return ok({
          configured,
          config: cfg ? publicConfig(cfg) : null,
          updated_at: cfg?.updated_at ?? null,
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
        '写入当前操作人的邮件通知配置（SMTP，个人级，存储于用户主目录，跨项目沿用）。只需提供邮箱 user + 授权码 pass：host/port/secure/from 会自动按邮箱域名或 provider 填充（支持 QQ/163/126/yeah/Foxmail/Gmail/Outlook/iCloud）。也可显式覆盖 host/port。pass 仅用于发送，不会在返回中暴露。',
      inputSchema: {
        provider: z.string().optional().describe('邮件服务商 key（可选，如 qq/163/gmail）。省略时按 user 邮箱域名自动推断'),
        host: z.string().optional().describe('SMTP 服务器地址（可选，省略时按 provider 或域名填充）'),
        port: z.number().int().optional().describe('SMTP 端口（可选，省略时按预设填充；显式指定 host 时必须提供）'),
        secure: z.boolean().optional().describe('是否使用 TLS/SSL（465 端口通常为 true，可选）'),
        user: z.string().describe('SMTP 账号（通常是发件邮箱）'),
        pass: z.string().describe('SMTP 密码/授权码（不是登录密码，需在邮箱服务商开启 SMTP 后获取）'),
        from: z.string().email().optional().describe('发件人邮箱（可选，默认取 user）'),
      },
    },
    async (args) => {
      try {
        if (!(await isUserConfigured())) {
          return fail('user_not_configured', '请先用 user.set 配置当前操作人（姓名、邮箱），再配置个人邮件。');
        }

        const resolved = resolveEmailConfig({
          provider: args.provider,
          host: args.host,
          port: args.port,
          secure: args.secure,
          user: args.user,
          from: args.from,
        });
        if (!resolved.ok) {
          return fail(resolved.code, resolved.message, { providers: resolved.providers });
        }

        const file = await writeEmailConfig({ ...resolved.config, pass: args.pass });
        return ok({
          configured: true,
          provider: resolved.config.provider ?? null,
          config: publicConfig(file),
          updated_at: file.updated_at,
        });
      } catch (e) {
        return fail('email_set_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'email.providers',
    {
      description:
        '列出内置支持的邮件服务商 SMTP 预设（host/port/secure 与开启授权码的注意事项）。供 email.set 选择 provider 使用。',
      inputSchema: {},
    },
    async () => {
      try {
        return ok({
          providers: PRESET_KEYS.map((key) => {
            const p = SMTP_PRESETS[key];
            return { key: p.key, name: p.name, host: p.host, port: p.port, secure: p.secure, note: p.note };
          }),
        });
      } catch (e) {
        return fail('email_providers_failed', (e as Error).message);
      }
    },
  );
}
