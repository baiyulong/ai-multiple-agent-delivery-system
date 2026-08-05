import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exists, readText } from '../../src/core/fsx.js';
import { createTask } from '../../src/core/store/task-store.js';
import {
  getArtifact,
  listArtifacts,
  submitArtifact,
  updateArtifact,
} from '../../src/core/store/artifact-store.js';
import type { StageRecord } from '../../src/core/types.js';

const stages: StageRecord[] = [
  { stage: 'product_requirement', role: 'product-manager', required_artifact_type: 'crud_spec_card', status: 'not_started', artifact_id: null },
];

async function setup(): Promise<{ root: string; taskId: string }> {
  const root = await mkdtemp(join(tmpdir(), 'delivery-art-'));
  const task = await createTask(root, {
    title: 't',
    description: 'd',
    createdBy: 'u',
    taskType: 'crud',
    stages,
  });
  return { root, taskId: task.task_id };
}

describe('artifact-store', () => {
  it('submit → get 回环', async () => {
    const { root, taskId } = await setup();
    const meta = await submitArtifact(root, {
      taskId,
      stage: 'product_requirement',
      role: 'product-manager',
      artifactType: 'crud_spec_card',
      content: '# CRUD 功能规格卡\n\n## 1. 功能名称\n供应商分类维护\n',
      title: '供应商分类维护 CRUD 功能规格卡',
    });

    expect(meta.artifact_id).toMatch(/^ART-\d{8}-\d{3}$/);
    expect(meta.status).toBe('submitted');
    expect(meta.version).toBe(1);

    const got = await getArtifact(root, taskId, meta.artifact_id);
    expect(got?.content).toContain('供应商分类维护');
    expect(got?.metadata.artifact_type).toBe('crud_spec_card');

    const list = await listArtifacts(root, taskId);
    expect(list).toHaveLength(1);

    await rm(root, { recursive: true, force: true });
  });

  it('update 保留历史版本并递增版本', async () => {
    const { root, taskId } = await setup();
    const meta = await submitArtifact(root, {
      taskId,
      stage: 'product_requirement',
      role: 'product-manager',
      artifactType: 'crud_spec_card',
      content: 'v1',
    });

    const updated = await updateArtifact(root, taskId, meta.artifact_id, 'v2');
    expect(updated.version).toBe(2);
    expect(updated.status).toBe('submitted');

    const historyFile = join(root, 'tasks', taskId, 'artifacts', 'product_requirement', 'history', 'crud_spec_card.v1.md');
    expect(await exists(historyFile)).toBe(true);
    expect(await readText(historyFile)).toBe('v1');

    const got = await getArtifact(root, taskId, meta.artifact_id);
    expect(got?.content).toBe('v2');

    await rm(root, { recursive: true, force: true });
  });
});