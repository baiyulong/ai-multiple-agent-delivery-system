import { readFileSync } from 'node:fs';

/** 同步读 JSON（仅用于内置配置静态加载），缺失返回 null */
export function readJsonSync<T>(p: string): T | null {
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}
