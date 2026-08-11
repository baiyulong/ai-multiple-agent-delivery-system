import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findMembersByRole,
  normalizeAssigneeList,
  normalizeAssignees,
  resolveAssignees,
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

  it('按角色过滤成员', async () => {
    await upsertMember(dir, { name: 'A', email: 'a@example.com', roles: ['engineer', 'qa'] });
    await upsertMember(dir, { name: 'B', email: 'b@example.com', roles: ['product-manager'] });

    const engineers = await findMembersByRole(dir, 'engineer');
    expect(engineers.map((m) => m.email)).toEqual(['a@example.com']);

    const pm = await findMembersByRole(dir, 'product-manager');
    expect(pm.map((m) => m.email)).toEqual(['b@example.com']);

    const none = await findMembersByRole(dir, 'devops');
    expect(none).toEqual([]);
  });

  it('清理临时目录', async () => {
    if (prevEnv !== undefined) process.env.DELIVERY_ROOT = prevEnv;
    else delete process.env.DELIVERY_ROOT;
    if (dir) await rm(dir, { recursive: true, force: true });
  });
});

describe('team-store assignees（role -> 多人）', () => {
  let dir: string;
  let prevEnv: string | undefined;

  it('normalizeAssigneeList / normalizeAssignees 兼容单邮箱与数组', () => {
    expect(normalizeAssigneeList('a@x.com')).toEqual(['a@x.com']);
    expect(normalizeAssigneeList(['a@x.com', 'b@x.com'])).toEqual(['a@x.com', 'b@x.com']);
    expect(normalizeAssigneeList(undefined)).toEqual([]);
    expect(normalizeAssignees({ engineer: 'a@x.com', qa: ['b@x.com', 'c@x.com'] })).toEqual({
      engineer: ['a@x.com'],
      qa: ['b@x.com', 'c@x.com'],
    });
  });

  it('validateAssignees 支持一个角色多个人', async () => {
    dir = await mkdtemp(join(tmpdir(), 'delivery-team-'));
    prevEnv = process.env.DELIVERY_ROOT;
    process.env.DELIVERY_ROOT = dir;
    await upsertMember(dir, { name: 'A', email: 'a@example.com', roles: ['engineer', 'qa'] });
    await upsertMember(dir, { name: 'B', email: 'b@example.com', roles: ['engineer'] });

    const ok = await validateAssignees(dir, { engineer: ['a@example.com', 'b@example.com'] });
    expect(ok).toEqual([]);

    const bad = await validateAssignees(dir, { engineer: ['a@example.com', 'nobody@example.com'] });
    expect(bad.map((i) => i.reason)).toEqual(['not_member']);

    const wrongRole = await validateAssignees(dir, { qa: 'b@example.com' });
    expect(wrongRole.map((i) => i.reason)).toEqual(['role_not_in_member_roles']);
  });

  it('resolveAssignees 返回该角色全部指派成员（兼容旧单邮箱格式）', async () => {
    await upsertMember(dir, { name: 'A', email: 'a@example.com', roles: ['engineer'] });
    await upsertMember(dir, { name: 'B', email: 'b@example.com', roles: ['engineer'] });

    const multi = await resolveAssignees(dir, { engineer: ['a@example.com', 'b@example.com'] }, 'engineer');
    expect(multi.map((m) => m.email)).toEqual(['a@example.com', 'b@example.com']);

    const legacy = await resolveAssignees(dir, { engineer: 'a@example.com' }, 'engineer');
    expect(legacy.map((m) => m.email)).toEqual(['a@example.com']);

    const none = await resolveAssignees(dir, undefined, 'engineer');
    expect(none).toEqual([]);
  });

  it('清理临时目录', async () => {
    if (prevEnv !== undefined) process.env.DELIVERY_ROOT = prevEnv;
    else delete process.env.DELIVERY_ROOT;
    if (dir) await rm(dir, { recursive: true, force: true });
  });
});