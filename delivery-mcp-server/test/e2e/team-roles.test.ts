import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeRoleKey, readTeamConfig, validateAssignees } from '../../src/core/store/team-store.js';
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

describe('任务创建时的首角色询问（创建时不要求全量指派）', () => {
  it('不带 assignees 创建 → 返回 current_role_assignment_required + 候选成员', async () => {
    const h = await createHarness();
    const res = await h.call('task.create', {
      title: 'ask first role',
      description: '新增一个分类管理 CRUD 功能',
    });
    // 首阶段角色未固化：返回询问信息与候选（harness 预置 Test User 担任 product-manager/engineer）
    expect(res.current_stage_role).toBe('product-manager');
    expect(res.current_role_assignee).toBeNull();
    expect(res.current_role_assignment_required).toBe(true);
    expect(res.current_role_candidates).toEqual([{ name: 'Test User', email: 'test@example.com' }]);
    expect(res.current_role_assignment_hint).toContain('product-manager');
    await h.cleanup();
  });

  it('创建后 task.assign 固化首角色 → 再次创建同任务类型不重复询问（已固化时 required=false）', async () => {
    const h = await createHarness();
    const res = await h.call('task.create', {
      title: 'pre-assigned first role',
      description: '新增一个标签管理 CRUD 功能',
      assignees: { 'product-manager': 'test@example.com' },
    });
    // 创建时直接指派当前首阶段角色 → 不再要求询问
    expect(res.current_stage_role).toBe('product-manager');
    expect(res.current_role_assignment_required).toBe(false);
    expect(res.current_role_candidates).toBeNull();
    expect(res.current_role_assignee).toMatchObject({ email: 'test@example.com' });
    await h.cleanup();
  });
});

describe('团队名册旧 key 存量数据兼容（读取/写入侧归一化）', () => {
  it('team.json 含旧 key domain-architect → 读取侧归一化为 architect，task.create 指派成功', async () => {
    const h = await createHarness();
    // 直接落盘一份含旧 key 的名册（模拟旧版本写入的存量数据）
    await writeFile(
      join(h.root, 'config', 'team.json'),
      JSON.stringify({
        members: [
          { name: 'Test User', email: 'test@example.com', roles: ['product-manager', 'engineer'] },
          { name: 'Legacy Arch', email: 'legacy@example.com', roles: ['domain-architect', 'qa'] },
        ],
        updated_at: new Date().toISOString(),
      }),
      'utf-8',
    );

    // 读取侧归一化
    const config = await readTeamConfig(h.root);
    const legacy = config?.members.find((m) => m.email === 'legacy@example.com');
    expect(legacy?.roles).toEqual(['architect', 'qa']);

    // 规范键指派成功（修复前：role_not_in_member_roles 永远失败）
    const res = await h.call('task.create', {
      title: 'legacy key assign',
      description: '测试旧 key 存量名册下的角色指派',
      assignees: { architect: 'legacy@example.com' },
    });
    expect(res.task_id).toBeTruthy();
    expect(res.assignees).toMatchObject({ architect: 'legacy@example.com' });
    await h.cleanup();
  });

  it('旧 key 指派输入（domain-architect）同样成功（双向兼容）', async () => {
    const h = await createHarness();
    await writeFile(
      join(h.root, 'config', 'team.json'),
      JSON.stringify({
        members: [
          { name: 'Test User', email: 'test@example.com', roles: ['product-manager', 'engineer', 'architect'] },
        ],
        updated_at: new Date().toISOString(),
      }),
      'utf-8',
    );
    const res = await h.call('task.create', {
      title: 'legacy input key',
      description: '测试旧 key 作为指派输入',
      assignees: { 'domain-architect': 'test@example.com' },
    });
    expect(res.task_id).toBeTruthy();
    // 归一化后落盘为规范键
    expect(res.assignees).toMatchObject({ architect: 'test@example.com' });
    await h.cleanup();
  });

  it('upsertMember 写入侧归一化：旧 key 落盘为规范 key', async () => {
    const h = await createHarness();
    const { upsertMember } = await import('../../src/core/store/team-store.js');
    await upsertMember(h.root, { name: 'W', email: 'w@example.com', roles: ['domain-architect', 'qa'] as never });
    const config = await readTeamConfig(h.root);
    const m = config?.members.find((x) => x.email === 'w@example.com');
    expect(m?.roles).toEqual(['architect', 'qa']);
    await h.cleanup();
  });
});

describe('validateAssignees 报错自诊断', () => {
  it('role_not_in_member_roles 携带 normalized_role / member_roles / hint', async () => {
    const h = await createHarness();
    // harness 预置：Test User 担任 product-manager / engineer
    const invalid = await validateAssignees(h.root, { qa: 'test@example.com' });
    expect(invalid).toHaveLength(1);
    const item = invalid[0]!;
    expect(item.reason).toBe('role_not_in_member_roles');
    expect(item.normalized_role).toBe('qa');
    expect(item.member_roles).toEqual(['product-manager', 'engineer']);
    expect(item.hint).toContain('qa');
    await h.cleanup();
  });

  it('unknown_role 携带合法角色清单 hint', async () => {
    const h = await createHarness();
    const invalid = await validateAssignees(h.root, { 'no-such-role': 'test@example.com' });
    expect(invalid[0]?.reason).toBe('unknown_role');
    expect(invalid[0]?.hint).toContain('architect');
    await h.cleanup();
  });
});
