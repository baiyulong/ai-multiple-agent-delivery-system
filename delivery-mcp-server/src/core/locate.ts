import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 定位包根目录（含 config/ 与 templates/ 资源）。
 * 兼容：tsx 开发（src/core 内）与 tsup 打包（dist/server.js）。
 */
let cachedRoot: string | null = null;

export function packageRoot(): string {
  if (cachedRoot) return cachedRoot;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const pj = join(dir, 'package.json');
    if (existsSync(pj)) {
      try {
        const pkg = JSON.parse(readFileSync(pj, 'utf8')) as { name?: string };
        if (pkg?.name === 'delivery-mcp-server') {
          cachedRoot = dir;
          return dir;
        }
      } catch {
        // 继续向上
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  cachedRoot = resolve(process.cwd());
  return cachedRoot;
}

/** 语言类型 */
export type Lang = 'zh' | 'en';

/** 默认语言 */
export const DEFAULT_LANG: Lang = 'zh';

let cachedLang: Lang | null = null;

/**
 * 当前语言（安装期单语言）：优先级
 * 1) config/lang/active.json（install.js --lang 写入，如 {"lang":"en"}）
 * 2) 环境变量 DELIVERY_LANG（zh/en）
 * 3) 默认 zh
 */
export function activeLang(): Lang {
  if (cachedLang) return cachedLang;
  // 1) active.json
  try {
    const activePath = join(packageRoot(), 'config', 'lang', 'active.json');
    if (existsSync(activePath)) {
      const cfg = JSON.parse(readFileSync(activePath, 'utf8')) as { lang?: string };
      if (cfg?.lang === 'en' || cfg?.lang === 'zh') {
        cachedLang = cfg.lang;
        return cachedLang;
      }
    }
  } catch {
    // 忽略读取失败，继续降级
  }
  // 2) 环境变量
  const env = process.env.DELIVERY_LANG;
  if (env === 'en' || env === 'zh') {
    cachedLang = env;
    return cachedLang;
  }
  // 3) 默认
  cachedLang = DEFAULT_LANG;
  return cachedLang;
}

/** 测试/动态切换用：重置缓存 */
export function resetLang(): void {
  cachedLang = null;
}

/** flows 语言中性（stage/role 均为英文 key），无需语言子目录 */
export const builtinFlowsDir = (): string => join(packageRoot(), 'config', 'flows');
/** gates / architectures / templates 按语言子目录分版（config/{dir}/{lang}/） */
export const builtinGatesDir = (): string => join(packageRoot(), 'config', 'gates', activeLang());
export const builtinArchitecturesDir = (): string => join(packageRoot(), 'config', 'architectures', activeLang());
export const templatesDir = (): string => join(packageRoot(), 'templates', activeLang());
export const contextTemplateFile = (): string => join(templatesDir(), 'context.md');
