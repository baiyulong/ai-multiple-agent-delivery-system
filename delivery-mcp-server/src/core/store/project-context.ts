import { join } from 'node:path';
import { ensureDir, readText, writeTextAtomic } from '../fsx.js';

/**
 * 项目级背景（跨任务共享，PRD 背景：项目背景/领域知识与 agent 流程模板解耦——
 * 升级只覆盖全局 agent，项目背景存 .delivery/context/project-background.md 不受影响）
 */

const BACKGROUND_FILE = ['context', 'project-background.md'];

/** 写项目背景（全文覆盖） */
export async function writeProjectBackground(root: string, content: string): Promise<void> {
  const dir = join(root, 'context');
  await ensureDir(dir);
  await writeTextAtomic(join(dir, 'project-background.md'), content);
}

/** 读项目背景（未录入返回 null，由调用方决定引导补录） */
export async function readProjectBackground(root: string): Promise<string | null> {
  return readText(join(root, ...BACKGROUND_FILE));
}
