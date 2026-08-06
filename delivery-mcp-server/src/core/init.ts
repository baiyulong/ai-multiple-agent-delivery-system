import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { builtinFlowsDir, builtinGatesDir, builtinArchitecturesDir } from './locate.js';

/**
 * 交付根目录初始化（PRD 10.1 / 14.1）：
 * 首次运行将内置 flows/gates/architectures 模板复制到 .delivery/config/，之后用户可自定义覆盖（新增类型不改核心代码）。
 */

async function copyDirIfMissing(srcDir: string, destDir: string): Promise<{ copied: number }> {
  let files: string[] = [];
  try {
    files = await readdir(srcDir);
  } catch {
    return { copied: 0 };
  }
  await mkdir(destDir, { recursive: true });
  let copied = 0;
  for (const f of files) {
    const dest = join(destDir, f);
    const src = join(srcDir, f);
    try {
      await writeFile(dest, await readFile(src));
      copied++;
    } catch {
      // 已存在或不可写则跳过（保留用户自定义）
    }
  }
  return { copied };
}

export async function initDeliveryRoot(root: string): Promise<void> {
  await mkdir(join(root, 'tasks'), { recursive: true });
  await mkdir(join(root, 'config', 'flows'), { recursive: true });
  await mkdir(join(root, 'config', 'gates'), { recursive: true });
  await mkdir(join(root, 'config', 'architectures'), { recursive: true });

  await copyDirIfMissing(builtinFlowsDir(), join(root, 'config', 'flows'));
  await copyDirIfMissing(builtinGatesDir(), join(root, 'config', 'gates'));
  await copyDirIfMissing(builtinArchitecturesDir(), join(root, 'config', 'architectures'));
}
