import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSection, loadGateRule, normalizeSectionName, parseSections, runGate } from '../../src/core/gate-engine.js';

describe('gate-engine', () => {
  it('normalizeSectionName 去掉序号前缀', () => {
    expect(normalizeSectionName('## 11. 权限规则')).toBe('权限规则');
    expect(normalizeSectionName('## 1. 功能名称')).toBe('功能名称');
    expect(normalizeSectionName('## 10. 删除/停用规则')).toBe('删除/停用规则');
  });

  it('normalizeSectionName 去掉中文数字序号前缀（一、/（一）等形式）', () => {
    expect(normalizeSectionName('## 一、需求背景')).toBe('需求背景');
    expect(normalizeSectionName('## 二、非功能需求')).toBe('非功能需求');
    expect(normalizeSectionName('## 十一、权限规则')).toBe('权限规则');
    expect(normalizeSectionName('## （一）需求背景')).toBe('需求背景');
    expect(normalizeSectionName('## (三) 验收标准')).toBe('验收标准');
    // 非编号场景不受影响：章节名本身以中文数字开头且无顿号/点分隔
    expect(normalizeSectionName('## 一体化设计方案')).toBe('一体化设计方案');
  });

  it('parseSections 正确切分章节', () => {
    const md = '# 标题\n\n## 1. 功能名称\n内容A\n\n## 2. 维护对象\n内容B\n';
    const sections = parseSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.name).toBe('功能名称');
    expect(sections[0]?.content).toContain('内容A');
    expect(sections[1]?.name).toBe('维护对象');
  });

  it('findSection 前缀匹配：带编号/后缀的自然标题命中必需章节', () => {
    const sections = parseSections(
      '# 需求卡\n\n## 一、需求背景\n背景内容\n\n## 2. 用户故事与优先级\n故事内容\n\n## 6. 验收标准（Given / When / Then）\n- 标准1\n',
    );
    // 后缀：文档「用户故事与优先级」命中规则要求的「用户故事」
    const us = findSection(sections, '用户故事');
    expect(us.found).toBe(true);
    expect(us.content).toContain('故事内容');
    // 括号后缀：文档「验收标准（Given / When / Then）」命中「验收标准」
    const ac = findSection(sections, '验收标准');
    expect(ac.found).toBe(true);
    expect(ac.content).toContain('标准1');
    // 中文数字编号 + 精确名
    const bg = findSection(sections, '需求背景');
    expect(bg.found).toBe(true);
    // 不存在的章节仍不命中
    expect(findSection(sections, '非功能需求').found).toBe(false);
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

  it('ubiquitous_language_code_map 门禁：完整通过，缺代码映射失败', async () => {
    const root = await mkdtemp(join(tmpdir(), 'delivery-gate-'));
    const rule = await loadGateRule(root, 'ubiquitous_language_code_map');
    expect(rule).not.toBeNull();

    const good = [
      '# 业务统一语言·代码映射',
      '## 1. 业务术语表',
      '| 术语 | 精确定义 | 所属上下文 | 示例 | 不应混淆 |',
      '| 供应商分类 | 供应商挂接的层级分类 | 采购 | 原材料 | 供应商 |',
      '## 2. 代码映射',
      '| 术语 | 代码文件 | 代码方法/符号 | 说明 |',
      '| 供应商分类 | src/domain/Category.java | class Category | 分类实体 |',
      '## 3. 未映射术语',
      '| 术语 | 原因 | 建议 |',
      '| 采购员 | 未实现 | 待补充 |',
      '## 4. 术语冲突说明',
      '| 冲突术语 | 冲突表现 | 处理建议 |',
      '| 停用/删除 | 业务用停用 | 统一停用 |',
    ].join('\n');
    expect(runGate(good, rule!).result).toBe('passed');

    // 缺代码映射章节
    const bad = good.replace('## 2. 代码映射', '## 2. 其他');
    const badOutcome = runGate(bad, rule!);
    expect(badOutcome.result).toBe('failed');
    expect(badOutcome.missing_sections).toContain('代码映射');

    await rm(root, { recursive: true, force: true });
  });

  it('technical_architecture 门禁：缺技术栈失败', async () => {
    const root = await mkdtemp(join(tmpdir(), 'delivery-gate-'));
    const rule = await loadGateRule(root, 'technical_architecture');
    expect(rule).not.toBeNull();

    const good = [
      '# 技术架构文档',
      '## 1. 架构风格',
      '分层架构',
      '## 2. 模块结构',
      'backend + frontend',
      '## 3. 代码结构要求',
      'Controller + Service + Repository',
      '## 4. 技术栈',
      'Vue3 + Spring Boot',
      '## 5. ADR 架构决策记录',
      'ADR-001 分层',
      '## 6. 数据来源说明',
      'preset',
    ].join('\n');
    expect(runGate(good, rule!).result).toBe('passed');

    const bad = good.replace('## 4. 技术栈', '## 4. 其他');
    const badOutcome = runGate(bad, rule!);
    expect(badOutcome.result).toBe('failed');
    expect(badOutcome.missing_sections).toContain('技术栈');

    await rm(root, { recursive: true, force: true });
  });
});