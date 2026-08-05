import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadGateRule, normalizeSectionName, parseSections, runGate } from '../../src/core/gate-engine.js';

describe('gate-engine', () => {
  it('normalizeSectionName 去掉序号前缀', () => {
    expect(normalizeSectionName('## 11. 权限规则')).toBe('权限规则');
    expect(normalizeSectionName('## 1. 功能名称')).toBe('功能名称');
    expect(normalizeSectionName('## 10. 删除/停用规则')).toBe('删除/停用规则');
  });

  it('parseSections 正确切分章节', () => {
    const md = '# 标题\n\n## 1. 功能名称\n内容A\n\n## 2. 维护对象\n内容B\n';
    const sections = parseSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.name).toBe('功能名称');
    expect(sections[0]?.content).toContain('内容A');
    expect(sections[1]?.name).toBe('维护对象');
  });

  it('PRD 16.3：缺权限规则和验收标准 → failed 且 missing_sections 正确', async () => {
    const root = await mkdtemp(join(tmpdir(), 'delivery-gate-'));
    const rule = await loadGateRule(root, 'crud_spec_card');
    expect(rule).not.toBeNull();

    const sections = [
      '# CRUD 功能规格卡',
      '## 1. 功能名称',
      '供应商分类维护',
      '## 2. 维护对象',
      '供应商分类',
      '## 3. 使用角色',
      '采购管理员',
      '## 4. 业务目的',
      '维护分类',
      '## 5. 页面类型',
      '列表页+弹窗',
      '## 6. 查询条件',
      '名称',
      '## 7. 列表字段',
      '名称、状态',
      '## 8. 新增规则',
      '名称必填',
      '## 9. 编辑规则',
      '可改名称',
      '## 10. 删除/停用规则',
      '已引用不可删',
      '## 11. 权限规则',
      '仅采购管理员可维护',
      '## 12. 数据校验',
      '名称唯一',
      '## 13. 审计要求',
      '记录操作日志',
      '## 14. 验收标准',
      '- 新增分类成功',
      '- 停用分类成功',
      '- 查询分类成功',
    ];
    const md = sections.join('\n');

    const outcome = runGate(md, rule!);
    expect(outcome.result).toBe('passed');
    expect(outcome.missing_sections).toHaveLength(0);

    // 缺权限规则和验收标准：显式构建缺少这两个章节的文档
    const bad = sections
      .filter((l) => l !== '## 11. 权限规则' && l !== '仅采购管理员可维护')
      .filter((l) => !l.startsWith('## 14.'))
      .filter((l) => !l.startsWith('- 新增') && !l.startsWith('- 停用') && !l.startsWith('- 查询'))
      .join('\n');
    const badOutcome = runGate(bad, rule!);
    expect(badOutcome.result).toBe('failed');
    expect(badOutcome.missing_sections).toContain('权限规则');
    expect(badOutcome.missing_sections).toContain('验收标准');

    await rm(root, { recursive: true, force: true });
  });

  it('权限规则只写「按权限控制」→ failed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'delivery-gate-'));
    const rule = await loadGateRule(root, 'crud_spec_card');
    const md = [
      '# CRUD 功能规格卡',
      '## 1. 功能名称',
      'x',
      '## 2. 维护对象',
      'x',
      '## 3. 使用角色',
      'x',
      '## 4. 业务目的',
      'x',
      '## 5. 页面类型',
      'x',
      '## 6. 查询条件',
      'x',
      '## 7. 列表字段',
      'x',
      '## 8. 新增规则',
      'x',
      '## 9. 编辑规则',
      'x',
      '## 10. 删除/停用规则',
      'x',
      '## 11. 权限规则',
      '按权限控制',
      '## 12. 数据校验',
      'x',
      '## 13. 审计要求',
      'x',
      '## 14. 验收标准',
      '- a',
      '- b',
      '- c',
    ].join('\n');
    const outcome = runGate(md, rule!);
    expect(outcome.result).toBe('failed');
    expect(outcome.issues.some((i) => i.includes('按权限控制'))).toBe(true);

    await rm(root, { recursive: true, force: true });
  });

  it('验收标准不足 3 条 → failed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'delivery-gate-'));
    const rule = await loadGateRule(root, 'crud_spec_card');
    const md = [
      '# CRUD 功能规格卡',
      '## 1. 功能名称',
      'x',
      '## 2. 维护对象',
      'x',
      '## 3. 使用角色',
      'x',
      '## 4. 业务目的',
      'x',
      '## 5. 页面类型',
      'x',
      '## 6. 查询条件',
      'x',
      '## 7. 列表字段',
      'x',
      '## 8. 新增规则',
      'x',
      '## 9. 编辑规则',
      'x',
      '## 10. 删除/停用规则',
      'x',
      '## 11. 权限规则',
      '仅管理员',
      '## 12. 数据校验',
      'x',
      '## 13. 审计要求',
      'x',
      '## 14. 验收标准',
      '- 只有一条',
    ].join('\n');
    const outcome = runGate(md, rule!);
    expect(outcome.result).toBe('failed');
    expect(outcome.issues.some((i) => i.includes('验收标准'))).toBe(true);

    await rm(root, { recursive: true, force: true });
  });
});