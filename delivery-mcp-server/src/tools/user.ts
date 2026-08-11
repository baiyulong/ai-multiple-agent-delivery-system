import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { isUserConfigured, readCurrentUser, writeCurrentUser } from '../core/store/user-store.js';
import { isEmailConfigured } from '../core/store/email-store.js';
import { isTeamConfigured, readTeamConfig, TEAM_ROLE_LABELS } from '../core/store/team-store.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { ok, fail, type ToolContext } from './common.js';

/**
 * 用户工具组：user.get / user.set
 * 管理"当前操作人"的个人配置（姓名、邮箱），存储在用户主目录，跨项目沿用。
 * 与项目级团队配置（team.get / team.set）分离：团队名册是所有人的角色分工，
 * 个人配置只回答"当前我是谁"；当前人的角色通过邮箱在团队名册中匹配。
 * 个人 SMTP 邮件配置（服务器 + 认证，email.get / email.set）也存于同一文件，
 * 同样属于当前用户个人、跨项目沿用。
 */

export function registerUserTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'user.get',
    {
      description:
        '获取当前操作人的个人配置（姓名、邮箱），以及按邮箱在项目团队名册中匹配到的角色。未配置时返回 configured=false，需先用 user.set 配置。',
      inputSchema: {},
    },
    async () => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const [user, teamConfig] = await Promise.all([readCurrentUser(), readTeamConfig(root)]);
        const teamConfigured = await isTeamConfigured(root);
        const emailConfigured = await isEmailConfigured();
        const member = user
          ? (teamConfig?.members ?? []).find(
              (m) => m.email.toLowerCase() === user.email.toLowerCase(),
            ) ?? null
          : null;
        return ok({
          configured: !!user,
          user: user ? { name: user.name, email: user.email } : null,
          email_configured: emailConfigured,
          roles: member?.roles ?? [],
          role_labels: TEAM_ROLE_LABELS,
          in_team: !!member,
          team_configured: teamConfigured,
          updated_at: user?.updated_at ?? null,
        });
      } catch (e) {
        return fail('user_get_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'user.set',
    {
      description:
        '设置当前操作人的个人配置（姓名、邮箱）。首次使用系统前必须配置。个人配置存储在用户主目录，跨项目沿用；不会影响已配置的个人邮件（email.set）。团队角色分工请另用 team.set 配置。',
      inputSchema: {
        name: z.string().min(1).describe('当前操作人姓名'),
        email: z.string().email().describe('当前操作人邮箱（用于在团队名册中匹配角色）'),
      },
    },
    async (args) => {
      try {
        const user = await writeCurrentUser({ name: args.name, email: args.email });
        return ok({
          configured: true,
          user: { name: user.name, email: user.email },
          updated_at: user.updated_at,
        });
      } catch (e) {
        return fail('user_set_failed', (e as Error).message);
      }
    },
  );
}
