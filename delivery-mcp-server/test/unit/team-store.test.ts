import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findMembersByRole,
  normalizeAssignee,
  normalizeAssignees,
  resolveAssignee,
  upsertMember,
  validateAssignees,
} from '../../src/core/store/team-store.js';

describe('team-store findMembersByRole', () => {
  let dir: string;
  let prevEnv: string | undefined;

  it('未配置团队时返回 []', async () => {
    dir = await mkdtemp(join(tmpdir(), 'delivery-team-'));
    prevEnv = process.env.DELIVERY_ROOT;
    process.env.DELIVERY_ROOT = dir;
    expect(await findMembersByRole(dir, 'engineer')).toEqual([]);
  });

  it('按角色过滤成员（一个角色可多人承担）', async () => {
    await upsertMember(dir, { name: 'A', email: 'a@example.com', roles: ['engineer', 'qa'] });
    await upsertMember(dir, { name: 'B', email: 'b@example.com', roles: ['engineer'] });
    await upsertMember(dir, { name: 'C', email: 'c@example.com', roles: ['product-manager'] });

    const engineers = await findMembersByRole(dir, 'engineer');
    expect(engineers.map((m) => m.email)).toEqual(['a@example.com', 'b@example.com']);

    const pm = await findMembersByRole(dir, 'product-manager');
    expect(pm.map((m) => m.email)).toEqual(['c@example.com']);

    const none = await findMembersByRole(dir, 'data-engineer');
    expect(none).toEqual([]);
  });

  it('清理临时目录', async () => {
    if (prevEnv !== undefined) process.env.DELIVERY_ROOT = prevEnv;
    else delete process.env.DELIVERY_ROOT;
    if (dir) await rm(dir, { recursive: true, force: true });
  });
});

describe('team-store assignees（role -> 单一负责人）', () => {
  let dir: string;
  let prevEnv: string | undefined;

  it('normalizeAssignee / normalizeAssignees：单邮箱直接取值，旧数组格式取第一个', () => {
    expect(normalizeAssignee('a@x.com')).toBe('a@x.com');
    expect(normalizeAssignee(['a@x.com', 'b@x.com'])).toBe('a@x.com');
    expect(normalizeAssignee(undefined)).toBeUndefined();
    expect(normalizeAssignees({ engineer: 'a@x.com', qa: ['b@x.com', 'c@x.com'] })).toEqual({
      engineer: 'a@x.com',
      qa: 'b@x.com',
    });
  });

  it('validateAssignees：负责人必须是担任该角色的团队成员', async () => {
    dir = await mkdtemp(join(tmpdir(), 'delivery-team-'));
    prevEnv = process.env.DELIVERY_ROOT;
    process.env.DELIVERY_ROOT = dir;
    await upsertMember(dir, { name: 'A', email: 'a@example.com', roles: ['engineer', 'qa'] });
    await upsertMember(dir, { name: 'B', email: 'b@example.com', roles: ['engineer'] });

    const ok = await validateAssignees(dir, { engineer: 'a@example.com' });
    expect(ok).toEqual([]);

    const bad = await validateAssignees(dir, { engineer: 'nobody@example.com' });
    expect(bad.map((i) => i.reason)).toEqual(['not_member']);

    const wrongRole = await validateAssignees(dir, { qa: 'b@example.com' });
    expect(wrongRole.map((i) => i.reason)).toEqual(['role_not_in_member_roles']);

    const unknown = await validateAssignees(dir, { devops: 'a@example.com' });
    expect(unknown.map((i) => i.reason)).toEqual(['unknown_role']);
  });

  it('resolveAssignee 返回该角色在本任务的唯一负责人（兼容旧数组格式取第一个）', async () => {
    await upsertMember(dir, { name: 'A', email: 'a@example.com', roles: ['engineer'] });
    await upsertMember(dir, { name: 'B', email: 'b@example.com', roles: ['engineer'] });

    const single = await resolveAssignee(dir, { engineer: 'a@example.com' }, 'engineer');
    expect(single).toEqual({ name: 'A', email: 'a@example.com' });

    const legacy = await resolveAssignee(dir, { engineer: ['b@example.com', 'a@example.com'] }, 'engineer');
    expect(legacy).toEqual({ name: 'B', email: 'b@example.com' });

    const none = await resolveAssignee(dir, undefined, 'engineer');
    expect(none).toBeNull();
  });

  it('清理临时目录', async () => {
    if (prevEnv !== undefined) process.env.DELIVERY_ROOT = prevEnv;
    else delete process.env.DELIVERY_ROOT;
    if (dir) await rm(dir, { recursive: true, force: true });
  });
});
