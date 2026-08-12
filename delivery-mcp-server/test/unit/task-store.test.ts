import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exists } from '../../src/core/fsx.js';
import { createTask, getStages, getTask } from '../../src/core/store/task-store.js';
import type { StageRecord } from '../../src/core/types.js';

const stages: StageRecord[] = [
  { stage: 'product_requirement', role: 'product-manager', required_artifact_type: 'crud_spec_card', status: 'not_started', artifact_id: null },
  { stage: 'ux_design', role: 'ux-designer', required_artifact_type: 'ux_interaction_card', status: 'not_started', artifact_id: null },
];

describe('task-store', () => {
  it('createTask 初始化全套文件', async () => {
    const root = await mkdtemp(join(tmpdir(), 'delivery-task-'));
    const task = await createTask(root, {
      title: '供应商分类维护',
      description: '支持采购管理员维护供应商分类，包括新增、编辑、停用和查询。',
      createdBy: 'Yulong',
      taskType: 'crud',
      stages,
    });

    expect(task.task_id).toMatch(/^TASK-\d{8}-\d{3}-[a-f0-9]{4}$/);
    expect(task.status).toBe('in_progress');
    expect(task.current_stage).toBe('product_requirement');

    const dir = join(root, 'tasks', task.task_id);
    expect(await exists(join(dir, 'task.json'))).toBe(true);
    expect(await exists(join(dir, 'stages.json'))).toBe(true);
    expect(await exists(join(dir, 'context.md'))).toBe(true);
    expect(await exists(join(dir, 'questions.json'))).toBe(true);
    expect(await exists(join(dir, 'artifacts', 'index.json'))).toBe(true);
    expect(await exists(join(dir, 'gates'))).toBe(true);

    const readBack = await getTask(root, task.task_id);
    expect(readBack?.title).toBe('供应商分类维护');
    expect(readBack?.task_type).toBe('crud');

    const stagesBack = await getStages(root, task.task_id);
    expect(stagesBack).toHaveLength(2);
    expect(stagesBack?.[0]?.stage).toBe('product_requirement');

    await rm(root, { recursive: true, force: true });
  });
});