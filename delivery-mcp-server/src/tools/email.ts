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
import { t } from '../core/i18n.js';

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
      description: t('tool.email.get.description'),
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
        return fail('email_get_failed', t('tool.email.get.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'email.set',
    {
      description: t('tool.email.set.description'),
      inputSchema: {
        provider: z.string().optional().describe(t('tool.email.set.provider')),
        host: z.string().optional().describe(t('tool.email.set.host')),
        port: z.number().int().optional().describe(t('tool.email.set.port')),
        secure: z.boolean().optional().describe(t('tool.email.set.secure')),
        user: z.string().describe(t('tool.email.set.user')),
        pass: z.string().describe(t('tool.email.set.pass')),
        from: z.string().email().optional().describe(t('tool.email.set.from')),
      },
    },
    async (args) => {
      try {
        if (!(await isUserConfigured())) {
          return fail('user_not_configured', t('tool.email.set.user_not_configured'));
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
        return fail('email_set_failed', t('tool.email.set.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'email.providers',
    {
      description: t('tool.email.providers.description'),
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
        return fail('email_providers_failed', t('tool.email.providers.failed', { msg: (e as Error).message }));
      }
    },
  );
}
