import { describe, expect, it } from 'vitest';
import { exists } from '../../src/core/fsx.js';
import { join } from 'node:path';
import {
  createHarness,
  validCrudSpecCard,
  validDddReview,
  validEngineeringPlan,
  validQaTestPlan,
  validUxInteractionCard,
} from './helpers.js';

/**
 * E2E 验收测试：PRD 第 16 章五个验收场景 + 返工流程（12.3）+ 问题阻塞/解除（7.9）。
 */

describe('PRD 16.1+16.4：CRUD 全流程闭环与阶段完成推进', () => {
  it('创建任务 → 识别类型 → 提交交付物 → 门禁通过 → 阶段完成推进', async () => {
    const h = await createHarness();

    // 16.1: 创建任务并识别类型
    const created = await h.call('task.create', {
      title: '供应商分类维护',
      description: '维护供应商分类，支持新增、编辑、停用和查询',
      created_by: 'Yulong',
    });
    expect(created.task_type).toBe('crud');
    expect(created.status).toBe('in_progress');
    expect(created.current_stage).toBe('product_requirement');
    const taskId = created.task_id as string;

    // 提交 crud_spec_card
    const submit = await h.call('artifact.submit', {
      task_id: taskId,
      stage: 'product_requirement',
      role: 'product-manager',
      artifact_type: 'crud_spec_card',
      content: validCrudSpecCard(),
      title: '供应商分类维护 CRUD 功能规格卡',
    });
    expect(submit.status).toBe('submitted');
    const artifactId = submit.artifact_id as string;

    // 门禁通过
    const gate = await h.call('gate.check', { task_id: taskId, stage: 'product_requirement', artifact_id: artifactId });
    expect(gate.result).toBe('passed');
    expect(gate.score).toBe(100);

    // 16.4: 阶段完成推进
    const complete = await h.call('stage.complete', { task_id: taskId, stage: 'product_requirement', completed_by: 'orchestrator' });
    expect(complete.status).toBe('completed');
    expect(complete.next_stage).toBe('ux_design');
    expect(complete.next_role).toBe('ux-designer');

    // 任务详情核对
    const detail = await h.call('task.get', { task_id: taskId });
    expect(detail.task.current_stage).toBe('ux_design');
    expect(detail.artifacts).toHaveLength(1);

    await h.cleanup();
  });
});

describe('PRD 16.2：缺失交付物阻塞与回退补齐', () => {
  it('ux_design 未完成时请求 domain_review → blocked + 指派 ux-designer', async () => {
    const h = await createHarness();
    const created = await h.call('task.create', {
      title: '供应商分类维护',
      description: '维护供应商分类',
      created_by: 'u',
    });
    const taskId = created.task_id as string;

    // 直接请求 domain_review（其直接上游是 ux_design，尚未完成）
    const stage = await h.call('stage.get', { task_id: taskId, stage: 'domain_review' });
    expect(stage.can_start).toBe(false);
    expect(stage.status).toBe('not_started');
    expect(stage.missing_upstream.length).toBeGreaterThan(0);
    expect(stage.missing_upstream.some((m: { stage: string }) => m.stage === 'ux_design')).toBe(true);
    expect(stage.assigned_agent).toBe('ux-designer');

    // 试图直接提交下游交付物也被拦截（PRD 12.2 双保险）
    const submit = await h.call('artifact.submit', {
      task_id: taskId,
      stage: 'engineering_design',
      role: 'engineer',
      artifact_type: 'engineering_plan',
      content: validEngineeringPlan(),
    });
    expect(submit.ok).toBe(false);
    expect(submit.code).toBe('upstream_missing');

    await h.cleanup();
  });
});

describe('PRD 16.3：门禁失败返回 missing_sections', () => {
  it('缺权限规则和验收标准 → failed 且 missing_sections 正确，阶段不得完成', async () => {
    const h = await createHarness();
    const created = await h.call('task.create', {
      title: 't',
      description: '维护供应商分类',
      created_by: 'u',
    });
    const taskId = created.task_id as string;

    // 构造缺少两个章节的规格卡
    const badContent = validCrudSpecCard()
      .split('\n')
      .filter((l) => l !== '## 11. 权限规则' && !l.startsWith('仅采购管理员'))
      .filter((l) => !l.startsWith('## 14.') && !l.startsWith('- '))
      .join('\n');

    const submit = await h.call('artifact.submit', {
      task_id: taskId,
      stage: 'product_requirement',
      role: 'product-manager',
      artifact_type: 'crud_spec_card',
      content: badContent,
    });
    const artifactId = submit.artifact_id as string;

    const gate = await h.call('gate.check', { task_id: taskId, stage: 'product_requirement', artifact_id: artifactId });
    expect(gate.result).toBe('failed');
    expect(gate.missing_sections).toContain('权限规则');
    expect(gate.missing_sections).toContain('验收标准');

    // 阶段不得完成
    const complete = await h.call('stage.complete', { task_id: taskId, stage: 'product_requirement' });
    expect(complete.ok).toBe(false);
    expect(complete.code).toBe('artifact_not_validated');

    await h.cleanup();
  });
});

describe('PRD 16.5：交付包导出', () => {
  it('全部阶段完成后导出 delivery_package.md', async () => {
    const h = await createHarness();
    const created = await h.call('task.create', {
      title: '供应商分类维护',
      description: '维护供应商分类，支持新增、编辑、停用和查询',
      created_by: 'u',
    });
    const taskId = created.task_id as string;

    // 依次完成 CRUD 五个阶段
    const stages = [
      { stage: 'product_requirement', type: 'crud_spec_card', content: validCrudSpecCard() },
      { stage: 'ux_design', type: 'ux_interaction_card', content: validUxInteractionCard() },
      { stage: 'domain_review', type: 'ddd_applicability_review', content: validDddReview() },
      { stage: 'engineering_design', type: 'engineering_plan', content: validEngineeringPlan() },
      { stage: 'qa_validation', type: 'qa_test_plan', content: validQaTestPlan() },
    ];
    for (const s of stages) {
      const submit = await h.call('artifact.submit', {
        task_id: taskId,
        stage: s.stage,
        role: 'agent',
        artifact_type: s.type,
        content: s.content,
      });
      const gate = await h.call('gate.check', { task_id: taskId, stage: s.stage, artifact_id: submit.artifact_id });
      expect(gate.result).toBe('passed');
      const complete = await h.call('stage.complete', { task_id: taskId, stage: s.stage });
      expect(complete.status).toBe('completed');
    }

    const detail = await h.call('task.get', { task_id: taskId });
    expect(detail.task.status).toBe('completed');

    const exported = await h.call('task.export_delivery_package', { task_id: taskId });
    expect(exported.status).toBe('exported');

    // 交付包文件落盘
    const pkgPath = join(h.root, 'tasks', taskId, 'delivery_package.md');
    expect(await exists(pkgPath)).toBe(true);

    await h.cleanup();
  });
});

describe('PRD 12.3：返工流程', () => {
  it('gate failed → artifact.update 修订 → 重新 gate 通过 → 阶段完成', async () => {
    const h = await createHarness();
    const created = await h.call('task.create', {
      title: 't',
      description: '维护供应商分类',
      created_by: 'u',
    });
    const taskId = created.task_id as string;

    const badContent = validCrudSpecCard()
      .split('\n')
      .filter((l) => !l.startsWith('## 14.') && !l.startsWith('- '))
      .join('\n');

    const submit = await h.call('artifact.submit', {
      task_id: taskId,
      stage: 'product_requirement',
      role: 'product-manager',
      artifact_type: 'crud_spec_card',
      content: badContent,
    });
    const artifactId = submit.artifact_id as string;

    const gate1 = await h.call('gate.check', { task_id: taskId, stage: 'product_requirement', artifact_id: artifactId });
    expect(gate1.result).toBe('failed');
    expect(gate1.missing_sections).toContain('验收标准');

    // 修订（恢复验收标准章节）
    const updated = await h.call('artifact.update', {
      task_id: taskId,
      artifact_id: artifactId,
      content: validCrudSpecCard(),
    });
    expect(updated.version).toBe(2);

    const gate2 = await h.call('gate.check', { task_id: taskId, stage: 'product_requirement', artifact_id: artifactId });
    expect(gate2.result).toBe('passed');

    const complete = await h.call('stage.complete', { task_id: taskId, stage: 'product_requirement' });
    expect(complete.status).toBe('completed');

    await h.cleanup();
  });
});

describe('PRD 7.9 / 8.8：问题阻塞与解除', () => {
  it('question.create 阻塞阶段，question.resolve 解除', async () => {
    const h = await createHarness();
    const created = await h.call('task.create', {
      title: 't',
      description: '维护供应商分类',
      created_by: 'u',
    });
    const taskId = created.task_id as string;

    const q = await h.call('question.create', {
      task_id: taskId,
      raised_by: 'domain-architect',
      assigned_to_role: 'product-manager',
      question: '已被供应商引用的分类是否允许删除？',
      blocks_stage: 'product_requirement',
    });
    expect(q.status).toBe('open');

    // 阶段被阻塞
    const stage = await h.call('stage.get', { task_id: taskId, stage: 'product_requirement' });
    expect(stage.status).toBe('blocked');

    // 提交完整规格卡也无法通过 gate 后完成（存在阻塞问题）
    const submit = await h.call('artifact.submit', {
      task_id: taskId,
      stage: 'product_requirement',
      role: 'product-manager',
      artifact_type: 'crud_spec_card',
      content: validCrudSpecCard(),
    });
    const gate = await h.call('gate.check', { task_id: taskId, stage: 'product_requirement', artifact_id: submit.artifact_id });
    expect(gate.result).toBe('passed');
    const complete = await h.call('stage.complete', { task_id: taskId, stage: 'product_requirement' });
    expect(complete.ok).toBe(false);
    expect(complete.code).toBe('blocked_by_question');

    // 解决后解除阻塞
    const resolved = await h.call('question.resolve', {
      task_id: taskId,
      question_id: q.question_id,
      answer: '被引用的分类不可删除，只能停用。',
      resolved_by: 'product-manager',
    });
    expect(resolved.status).toBe('resolved');

    const complete2 = await h.call('stage.complete', { task_id: taskId, stage: 'product_requirement' });
    expect(complete2.status).toBe('completed');

    await h.cleanup();
  });
});
