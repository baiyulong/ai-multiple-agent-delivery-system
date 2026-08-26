import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readProjectBackground, writeProjectBackground } from '../../src/core/store/project-context.js';

describe('project-context（项目背景，项目级跨任务共享）', () => {
  it('未录入时返回 null', async () => {
    const root = await mkdtemp(join(tmpdir(), 'delivery-pctx-'));
    expect(await readProjectBackground(root)).toBeNull();
    await rm(root, { recursive: true, force: true });
  });

  it('写入后可读取，存于 .delivery/context/project-background.md（全文覆盖）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'delivery-pctx-'));
    const v1 = '# 项目背景\n\n零售供应链领域……';
    await writeProjectBackground(root, v1);
    expect(await readProjectBackground(root)).toBe(v1);

    // 落盘位置正确（.delivery 根即传入 root，背景在 context/ 子目录）
    const onDisk = await readFile(join(root, 'context', 'project-background.md'), 'utf-8');
    expect(onDisk).toBe(v1);

    // 全文覆盖语义
    const v2 = '# 项目背景（更新）\n\n……';
    await writeProjectBackground(root, v2);
    expect(await readProjectBackground(root)).toBe(v2);

    await rm(root, { recursive: true, force: true });
  });
});
