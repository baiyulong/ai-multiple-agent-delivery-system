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
  it('同日首个任务为 001 并带随机后缀', async () => {
    const root = await freshRoot();
    const id = await generateTaskId(root, new Date(2026, 7, 4));
    expect(id).toMatch(/^TASK-20260804-001-[a-f0-9]{4}$/);
    await rm(root, { recursive: true, force: true });
  });

  it('同日第二个任务为 002（兼容旧格式目录）', async () => {
    const root = await freshRoot();
    await ensureDir(join(root, 'tasks', 'TASK-20260804-001'));
    const id = await generateTaskId(root, new Date(2026, 7, 4));
    expect(id).toMatch(/^TASK-20260804-002-[a-f0-9]{4}$/);
    await rm(root, { recursive: true, force: true });
  });

  it('同日后缀任务也计入序号', async () => {
    const root = await freshRoot();
    await ensureDir(join(root, 'tasks', 'TASK-20260804-001-abcd'));
    await ensureDir(join(root, 'tasks', 'TASK-20260804-003'));
    const id = await generateTaskId(root, new Date(2026, 7, 4));
    expect(id).toMatch(/^TASK-20260804-004-[a-f0-9]{4}$/);
    await rm(root, { recursive: true, force: true });
  });

  it('跨日回到 001', async () => {
    const root = await freshRoot();
    await ensureDir(join(root, 'tasks', 'TASK-20260804-005'));
    const id = await generateTaskId(root, new Date(2026, 7, 5));
    expect(id).toMatch(/^TASK-20260805-001-[a-f0-9]{4}$/);
    await rm(root, { recursive: true, force: true });
  });

  it('多机生成不冲突：后缀随机', async () => {
    const root = await freshRoot();
    const ids = await Promise.all([generateTaskId(root, new Date(2026, 7, 4)), generateTaskId(root, new Date(2026, 7, 4))]);
    // 两台"机器"各自独立生成时，即使序号相同，后缀也应不同（模拟：调用两次，后缀随机）
    const suffixes = ids.map((id) => id.slice(-4));
    expect(suffixes[0]).not.toBe(suffixes[1]);
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