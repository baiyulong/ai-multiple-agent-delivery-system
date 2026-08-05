import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureDir } from '../../src/core/fsx.js';
import { generateArtifactId, generateQuestionId, generateTaskId } from '../../src/core/ids.js';

async function freshRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'delivery-ids-'));
  await ensureDir(join(root, 'tasks'));
  return root;
}

describe('ID 生成', () => {
  it('同日首个任务为 001', async () => {
    const root = await freshRoot();
    const id = await generateTaskId(root, new Date(2026, 7, 4));
    expect(id).toMatch(/^TASK-20260804-001$/);
    await rm(root, { recursive: true, force: true });
  });

  it('同日第二个任务为 002', async () => {
    const root = await freshRoot();
    await ensureDir(join(root, 'tasks', 'TASK-20260804-001'));
    const id = await generateTaskId(root, new Date(2026, 7, 4));
    expect(id).toBe('TASK-20260804-002');
    await rm(root, { recursive: true, force: true });
  });

  it('跨日回到 001', async () => {
    const root = await freshRoot();
    await ensureDir(join(root, 'tasks', 'TASK-20260804-005'));
    const id = await generateTaskId(root, new Date(2026, 7, 5));
    expect(id).toBe('TASK-20260805-001');
    await rm(root, { recursive: true, force: true });
  });

  it('ART 与 Q 前缀正确', async () => {
    const root = await freshRoot();
    const art = await generateArtifactId(root, new Date(2026, 7, 4));
    const q = await generateQuestionId(root, new Date(2026, 7, 4));
    expect(art).toBe('ART-20260804-001');
    expect(q).toBe('Q-20260804-001');
    await rm(root, { recursive: true, force: true });
  });
});