import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** 递归创建目录 */
export async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

export async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** 读文本，文件不存在返回 null */
export async function readText(p: string): Promise<string | null> {
  try {
    return await readFile(p, 'utf8');
  } catch {
    return null;
  }
}

/** 读 JSON，缺失或损坏返回 null */
export async function readJson<T>(p: string): Promise<T | null> {
  const text = await readText(p);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** 原子写文本：临时文件 + rename（PRD 18.4 状态一致性） */
export async function writeTextAtomic(p: string, content: string): Promise<void> {
  const dir = dirname(p);
  await ensureDir(dir);
  const tmp = `${p}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, p);
}

/** 原子写 JSON（格式化缩进） */
export async function writeJsonAtomic(p: string, value: unknown): Promise<void> {
  await writeTextAtomic(p, `${JSON.stringify(value, null, 2)}\n`);
}
