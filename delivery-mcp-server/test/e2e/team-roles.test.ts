import { describe, expect, it } from 'vitest';
import { normalizeRoleKey } from '../../src/core/store/team-store.js';
import { createHarness } from './helpers.js';

const ALL_ROLES = [
  'delivery-orchestrator',
  'domain-expert',
  'product-manager',
  'ux-designer',
  'architect',
  'engineer',
  'developer',
  'data-engineer',
  'qa',
];

/**
 * team.set 9 角色覆盖校验（tools/team.ts）。
 * 校验基于"当前配置 + 本次成员"合并后的 roles 并集是否覆盖全部 9 角色。
 */
describe('team.set 9 角色覆盖校验', () => {
  it('并集未覆盖全部 9 角色 → roles_incomplete，不写入', async () => {
    const h = await createHarness();
    // harness 已有 Test User（product-manager, engineer），再加一个 qa 仍缺多个角色
    const res = await h.call('team.set', {
      name: 'QA',
      email: 'qa@example.com',
      roles: ['qa'],
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('roles_incomplete');
    expect(Array.isArray(res.details.missing_roles)).toBe(true);
    expect(res.details.missing_roles.length).toBeGreaterThan(0);

    const get = await h.call('team.get', {});
    // 未写入：仍只有 harness 预置的 1 名成员
    expect(get.members).toHaveLength(1);
    await h.cleanup();
  });

  it('补全全部 9 角色后写入成功', async () => {
    const h = await createHarness();
    const res = await h.call('team.set', {
      name: 'Full Team',
      email: 'full@example.com',
      roles: ALL_ROLES,
    });
    expect(res.configured).toBe(true);
    expect(res.updated_at).toBeTruthy();

    const get = await h.call('team.get', {});
    const allRoles = new Set<string>();
    for (const m of get.members as Array<{ roles: string[] }>) for (const r of m.roles) allRoles.add(r);
    for (const r of ALL_ROLES) expect(allRoles.has(r)).toBe(true);
    await h.cleanup();
  });
});

describe('角色 key 归一化（旧 key 兼容）', () => {
  it('domain-architect（领域架构师旧 key）归一化为 architect', () => {
    expect(normalizeRoleKey('domain-architect')).toBe('architect');
    expect(normalizeRoleKey('architect')).toBe('architect');
    // 其他旧 key 兼容不受影响
    expect(normalizeRoleKey('platform-devops')).toBe('devops');
    expect(normalizeRoleKey('qa')).toBe('qa');
  });
});
