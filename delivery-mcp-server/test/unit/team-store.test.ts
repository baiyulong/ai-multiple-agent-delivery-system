import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findMembersByRole, upsertMember } from '../../src/core/store/team-store.js';

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