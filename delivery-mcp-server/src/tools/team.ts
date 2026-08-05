import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  isTeamConfigured,
  readTeamConfig,
  TEAM_ROLE_LABELS,
  TEAM_ROLES,
  upsertMember,
} from '../core/store/team-store.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { ok, fail, type ToolContext } from './common.js';

/**
 * 团队工具组：team.get / team.set
 * 管理项目级团队配置（当前人、邮箱、角色，一人可多角色）。
 */

export function registerTeamTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'team.get',
    {
      description:
        '获取项目团队配置：成员姓名、邮箱与角色（一人可多角色）。未配置时返回 configured=false，需先用 team.set 配置。',
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
          role_labels: TEAM_ROLE_LABELS,
          updated_at: config?.updated_at ?? null,
        });
      } catch (e) {
        return fail('team_get_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'team.set',
    {
      description:
        '新增或更新团队成员（按邮箱匹配，roles 覆盖）。首次使用系统前必须配置至少一名成员。一人可担任多个角色。注意：写入前校验所有成员 roles 的并集必须覆盖全部 8 个角色，否则拒绝写入并提示缺失角色。',
      inputSchema: {
        name: z.string().describe('成员姓名'),
        email: z.string().email().describe('成员邮箱（唯一标识，用于更新时匹配）'),
        roles: z
          .array(z.enum(TEAM_ROLES))
          .min(1)
          .describe('担任的角色列表（可多个）'),
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
            `团队角色不完整，需覆盖全部 8 个角色：${missing.join('、')}`,
            { missing_roles: missing },
          );
        }

        const { config, created } = await upsertMember(root, member);
        return ok({
          created,
          configured: config.members.length > 0,
          members: config.members,
          role_labels: TEAM_ROLE_LABELS,
          updated_at: config.updated_at,
        });
      } catch (e) {
        return fail('team_set_failed', (e as Error).message);
      }
    },
  );
}
