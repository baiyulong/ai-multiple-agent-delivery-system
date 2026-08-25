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
  'developer',
  'data-engineer',
  'qa',
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
  developer: '程序员',
  'data-engineer': '数据工程师',
  qa: '质量测试',
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
  developer: 'delivery-developer',
  'data-engineer': 'delivery-data-engineer',
  qa: 'delivery-qa',
};

/** 角色 → OpenCode Agent 名（未映射时回退角色 key 本身） */
export function agentNameForRole(role: string): string {
  return ROLE_AGENT_MAP[role] ?? role;
}

/**
 * 角色 key 归一化：旧流程模板中 devops 阶段使用 `platform-devops`，
 * 归一化到 `devops`。devops 角色已移除，此处仅做兼容映射（视为已废弃角色）。
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

/** 按姓名查找成员（不区分大小写） */
export async function findMemberByName(root: string, name: string): Promise<TeamMember | null> {
  const config = await readTeamConfig(root);
  if (!config) return null;
  return config.members.find((m) => m.name.toLowerCase() === name.toLowerCase()) ?? null;
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

/** 归一化某角色指派值为单个负责人邮箱（兼容旧数组格式，取第一个） */
export function normalizeAssignee(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return undefined;
}

/** 归一化 assignees：role -> 负责人邮箱（每角色一个负责人；兼容旧数组格式取第一个，空值丢弃） */
export function normalizeAssignees(
  assignees: Record<string, string | string[]> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, raw] of Object.entries(assignees ?? {})) {
    const email = normalizeAssignee(raw);
    if (email) out[role] = email;
  }
  return out;
}

/** 校验 assignees：每个 role 必须是合法角色 key，且 email 是团队成员并担任该角色。返回非法项列表 */
export async function validateAssignees(
  root: string,
  assignees: Record<string, string | string[]>,
): Promise<Array<{ role: string; email: string; reason: string }>> {
  const invalid: Array<{ role: string; email: string; reason: string }> = [];
  for (const [role, raw] of Object.entries(assignees)) {
    const norm = normalizeRoleKey(role);
    const email = normalizeAssignee(raw) ?? '';
    if (!TEAM_ROLES.includes(norm as TeamRole)) {
      invalid.push({ role, email: Array.isArray(raw) ? raw.join('、') : email, reason: 'unknown_role' });
      continue;
    }
    if (!email) {
      invalid.push({ role, email, reason: 'empty_email' });
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

/** 解析某角色在本任务的负责人成员（未指派返回 null） */
export async function resolveAssignee(
  root: string,
  assignees: Record<string, string | string[]> | undefined,
  role: string,
): Promise<{ name: string; email: string } | null> {
  const email = normalizeAssignee(assignees?.[role] ?? assignees?.[normalizeRoleKey(role)]);
  if (!email) return null;
  const member = await findMemberByEmail(root, email);
  return member ? { name: member.name, email: member.email } : null;
}