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

/**
 * 角色 key → OpenCode Agent 文件名（不带 .md）。
 * Agent 文件统一加 delivery- 前缀，避免与目标项目自带的同名 agent（engineer/qa 等）冲突。
 */
export const ROLE_AGENT_MAP: Record<string, string> = {
  'delivery-orchestrator': 'delivery-orchestrator',
  'domain-expert': 'delivery-domain-expert',
  'product-manager': 'delivery-product-manager',
  'ux-designer': 'delivery-ux-designer',
  'domain-architect': 'delivery-domain-architect',
  engineer: 'delivery-engineer',
  qa: 'delivery-qa',
  devops: 'delivery-devops',
  // flow 模板中 devops 阶段使用的角色 key
  'platform-devops': 'delivery-devops',
};

/** 角色 → OpenCode Agent 名（未映射时回退角色 key 本身） */
export function agentNameForRole(role: string): string {
  return ROLE_AGENT_MAP[role] ?? role;
}

/**
 * 角色 key 归一化：flow 模板中 devops 阶段使用 `platform-devops`，
 * 而团队成员 roles 使用 `devops`。归一化后两者视为同一角色。
 */
export function normalizeRoleKey(role: string): string {
  return role === 'platform-devops' ? 'devops' : role;
}

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

/** 按角色查找成员（roles 数组包含该角色，角色 key 先归一化），未配置返回 [] */
export async function findMembersByRole(root: string, role: string): Promise<TeamMember[]> {
  const config = await readTeamConfig(root);
  if (!config) return [];
  const norm = normalizeRoleKey(role);
  return config.members.filter((m) => m.roles.includes(norm as TeamRole));
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

/** 校验 assignees：每个 role 必须是合法角色 key，且 email 是团队成员并担任该角色。返回非法项列表 */
export async function validateAssignees(
  root: string,
  assignees: Record<string, string>,
): Promise<Array<{ role: string; email: string; reason: string }>> {
  const invalid: Array<{ role: string; email: string; reason: string }> = [];
  for (const [role, email] of Object.entries(assignees)) {
    const norm = normalizeRoleKey(role);
    if (!TEAM_ROLES.includes(norm as TeamRole)) {
      invalid.push({ role, email, reason: 'unknown_role' });
      continue;
    }
    const member = await findMemberByEmail(root, email);
    if (!member) {
      invalid.push({ role, email, reason: 'not_member' });
      continue;
    }
    if (!member.roles.includes(norm as TeamRole)) {
      invalid.push({ role, email, reason: 'role_not_in_member_roles' });
    }
  }
  return invalid;
}

/** 解析某角色在本任务的负责人成员（无指派返回 null） */
export async function resolveAssignee(
  root: string,
  assignees: Record<string, string> | undefined,
  role: string,
): Promise<{ name: string; email: string } | null> {
  const email = assignees?.[role] ?? assignees?.[normalizeRoleKey(role)];
  if (!email) return null;
  const member = await findMemberByEmail(root, email);
  if (!member) return null;
  return { name: member.name, email: member.email };
}