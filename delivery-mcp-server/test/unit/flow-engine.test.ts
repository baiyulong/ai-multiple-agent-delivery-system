import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildStagesFromFlow,
  checkMissingUpstream,
  loadFlowTemplate,
  nextStageDef,
  requiredTypes,
} from '../../src/core/flow-engine.js';
import { createTask, getStages } from '../../src/core/store/task-store.js';
import { setStageStatus } from '../../src/core/store/stage-store.js';
import type { StageRecord } from '../../src/core/types.js';

describe('flow-engine', () => {
  it('加载 CRUD 流程模板并构建初始阶段', async () => {
    const root = await mkdtemp(join(tmpdir(), 'delivery-flow-'));
    const flow = await loadFlowTemplate(root, 'crud');
    expect(flow).not.toBeNull();
    expect(flow?.flow).toHaveLength(5);
    expect(flow?.flow[0]?.stage).toBe('product_requirement');

    const stages = buildStagesFromFlow(flow!);
    expect(stages[0]).toMatchObject({
      stage: 'product_requirement',
      role: 'product-manager',
      status: 'not_started',
      artifact_id: null,
    });

    await rm(root, { recursive: true, force: true });
  });

  it('requiredTypes 支持多交付物阶段', () => {
    const flow = { task_type: 'full_ddd' as const, flow: [] };
    void flow;
    const stage: StageRecord = {
      stage: 'domain_design',
      role: 'domain-architect',
      required_artifact_type: 'bounded_context',
      required_artifact_types: ['bounded_context', 'aggregate_design', 'domain_events', 'api_contract'],
      status: 'not_started',
      artifact_id: null,
    };
    expect(requiredTypes(stage)).toHaveLength(4);
  });

  it('nextStageDef 返回流程下一阶段', async () => {
    const root = await mkdtemp(join(tmpdir(), 'delivery-flow-'));
    const flow = await loadFlowTemplate(root, 'crud');
    const next = nextStageDef(flow!, 'product_requirement');
    expect(next?.stage).toBe('ux_design');
    await rm(root, { recursive: true, force: true });
  });

  it('checkMissingUpstream：上游未完成时返回缺失清单', async () => {
    const root = await mkdtemp(join(tmpdir(), 'delivery-flow-'));
    const flow = await loadFlowTemplate(root, 'crud');
    const task = await createTask(root, {
      title: 't',
      description: 'd',
      createdBy: 'u',
      taskType: 'crud',
      stages: buildStagesFromFlow(flow!),
    });

    // 尝试开始 ux_design，product_requirement 未完成
    const missing = await checkMissingUpstream(root, task.task_id, flow!, 'ux_design');
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({
      stage: 'product_requirement',
      role: 'product-manager',
      assigned_agent: 'product-manager',
    });
    expect(missing[0]?.missing_artifact_types).toContain('crud_spec_card');

    // 完成上游后不再缺失
    const stages = await getStages(root, task.task_id);
    await setStageStatus(root, task.task_id, 'product_requirement', 'completed', stages!);
    const missing2 = await checkMissingUpstream(root, task.task_id, flow!, 'ux_design');
    expect(missing2).toHaveLength(0);

    await rm(root, { recursive: true, force: true });
  });
});