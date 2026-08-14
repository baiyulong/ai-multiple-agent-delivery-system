import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  isTeamConfigured,
  readTeamConfig,
  TEAM_ROLES,
  upsertMember,
} from '../core/store/team-store.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { ok, fail, type ToolContext } from './common.js';
import { roleLabels, t } from '../core/i18n.js';

/**
 * 团队工具组：team.get / team.set
 * 管理项目级团队配置（当前人、邮箱、角色，一人可多角色）。
 */

export function registerTeamTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'team.get',
    {
      description: t('tool.team.get.description'),
      inputSchema: {},
    },
    async () => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const configured = await isTeamConfigured(root);
        const config = await readTeamConfig(root);
        return ok({
          configured,
          members: config?.members ?? [],
          role_labels: roleLabels(),
          updated_at: config?.updated_at ?? null,
        });
      } catch (e) {
        return fail('team_get_failed', t('tool.team.get.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'team.set',
    {
      description: t('tool.team.set.description'),
      inputSchema: {
        name: z.string().describe(t('tool.team.set.name')),
        email: z.string().email().describe(t('tool.team.set.email')),
        roles: z
          .array(z.enum(TEAM_ROLES))
          .min(1)
          .describe(t('tool.team.set.roles')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const member = {
          name: args.name,
          email: args.email,
          roles: args.roles as (typeof TEAM_ROLES)[number][],
        };

        // 校验：合并当前配置 + 本次成员后，roles 并集必须覆盖全部 8 角色，否则拒绝写入
        const existing = (await readTeamConfig(root))?.members ?? [];
        const merged = [...existing];
        const idx = merged.findIndex((m) => m.email.toLowerCase() === args.email.toLowerCase());
        if (idx >= 0) merged[idx] = member;
        else merged.push(member);
        const union = new Set<string>();
        for (const m of merged) for (const r of m.roles) union.add(r);
        const missing = TEAM_ROLES.filter((r) => !union.has(r));
        if (missing.length > 0) {
          return fail(
            'roles_incomplete',
            t('tool.team.set.roles_incomplete', { missing: missing.join('、') }),
            { missing_roles: missing },
          );
        }

        const { config, created } = await upsertMember(root, member);
        return ok({
          created,
          configured: config.members.length > 0,
          members: config.members,
          role_labels: roleLabels(),
          updated_at: config.updated_at,
        });
      } catch (e) {
        return fail('team_set_failed', t('tool.team.set.failed', { msg: (e as Error).message }));
      }
    },
  );
}
