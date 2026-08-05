import { join } from 'node:path';
import { assertInside } from '../paths.js';
import { readJson, writeJsonAtomic } from '../fsx.js';
import { nowIso } from '../time.js';

/**
 * 团队配置（项目级）：记录当前项目参与人及其角色（一人可多角色）。
 * 配置文件：.delivery/config/team.json
 *
 * 首次使用系统（如 task.create）时强制要求先配置（PRD 协作上下文）。
 */

/** 系统角色列表（与 OpenCode Agent 同名） */
export const TEAM_ROLES = [
  'delivery-orchestrator',
  'domain-expert',
  'product-manager',
  'ux-designer',
  'domain-architect',
  'engineer',
  'qa',
  'devops',
] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];

/** 团队成员：一人可担任多个角色 */
export interface TeamMember {
  name: string;
  email: string;
  roles: TeamRole[];
}

export interface TeamConfig {
  members: TeamMember[];
  updated_at: string;
}

export const TEAM_ROLE_LABELS: Record<string, string> = {
  'delivery-orchestrator': '交付编排总控',
  'domain-expert': '业务专家',
  'product-manager': '产品经理',
  'ux-designer': 'UI/UX 设计',
  'domain-architect': '领域架构师',
  engineer: '工程实现',
  qa: '质量测试',
  devops: '平台与 DevOps',
};

function teamConfigFile(root: string): string {
  return assertInside(root, join(root, 'config', 'team.json'));
}

/** 读取团队配置，未配置返回 null */
export async function readTeamConfig(root: string): Promise<TeamConfig | null> {
  return readJson<TeamConfig>(teamConfigFile(root));
}

/** 写入团队配置 */
export async function writeTeamConfig(root: string, config: TeamConfig): Promise<void> {
  config.updated_at = nowIso();
  await writeJsonAtomic(teamConfigFile(root), config);
}

/** 是否已配置团队 */
export async function isTeamConfigured(root: string): Promise<boolean> {
  const config = await readTeamConfig(root);
  return config !== null && Array.isArray(config.members) && config.members.length > 0;
}

/** 按邮箱查找成员 */
export async function findMemberByEmail(root: string, email: string): Promise<TeamMember | null> {
  const config = await readTeamConfig(root);
  if (!config) return null;
  return config.members.find((m) => m.email.toLowerCase() === email.toLowerCase()) ?? null;
}

/** 新增或更新成员（按邮箱匹配；roles 覆盖为传入值） */
export async function upsertMember(
  root: string,
  member: TeamMember,
): Promise<{ config: TeamConfig; created: boolean }> {
  const existing = (await readTeamConfig(root)) ?? { members: [] as TeamMember[], updated_at: nowIso() };
  const idx = existing.members.findIndex((m) => m.email.toLowerCase() === member.email.toLowerCase());
  const created = idx < 0;
  if (created) {
    existing.members.push(member);
  } else {
    existing.members[idx] = member;
  }
  await writeTeamConfig(root, existing);
  return { config: existing, created };
}