/**
 * 共享工具函数，与旧版 app.js 行为一一对应。
 */
import {
  ARTIFACT_TYPE_MAP,
  ROLE_NAME_MAP,
  STAGE_NAME_MAP,
} from './constants';
import type { TeamResponse, UserResponse, TeamMember, TeamRole } from '@/api/types';

/** 格式化 ISO 时间为友好显示 */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

/** 获取状态对应的 badge class */
export function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    completed: 'badge-success',
    validated: 'badge-success',
    passed: 'badge-success',
    in_progress: 'badge-primary',
    submitted: 'badge-primary',
    draft: 'badge-muted',
    not_started: 'badge-muted',
    skipped: 'badge-muted',
    manual_review_required: 'badge-muted',
    warning: 'badge-warning',
    blocked: 'badge-danger',
    failed: 'badge-danger',
    needs_revision: 'badge-warning',
    cancelled: 'badge-muted',
    archived: 'badge-muted',
    open: 'badge-warning',
    answered: 'badge-success',
    resolved: 'badge-success',
  };
  return map[status] || 'badge-muted';
}

/** 阶段名称翻译 */
export function stageDisplayName(name: string): string {
  return STAGE_NAME_MAP[name] || name;
}

/** 角色名称翻译 */
export function roleName(role: string): string {
  return ROLE_NAME_MAP[role] || role;
}

/** 交付物类型翻译 */
export function artifactTypeName(type: string): string {
  return ARTIFACT_TYPE_MAP[type] || type;
}

/** 该阶段的负责人（团队名册中认领该角色的成员） */
export function stageAssignees(
  role: string,
  team: TeamResponse | null,
): TeamMember[] {
  if (!team || !team.configured || !team.members || team.members.length === 0)
    return [];
  return team.members.filter((m) => (m.roles || []).includes(role as TeamRole));
}

/** 当前操作人是否负责该角色 */
export function currentUserOwnsRole(
  role: string,
  user: UserResponse | null,
): boolean {
  return !!(user && user.configured && (user.roles || []).includes(role));
}
