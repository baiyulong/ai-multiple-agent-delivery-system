import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { activeLang, packageRoot, type Lang } from './locate.js';

/**
 * i18n 字典（安装期单语言，随 config/lang/ 分发）：
 * - 字典文件：config/lang/{zh,en}.json（扁平 key → 值，支持 {param} 插值）
 * - 当前语言：由 locate.activeLang() 决定（active.json > DELIVERY_LANG > zh）
 * - t(key, params) 取字典值并插值；缺失 key 时回退英文 → 原样返回 key
 */

export type MessageDict = Record<string, string>;

let cachedDict: { lang: Lang; messages: MessageDict } | null = null;

function loadDict(lang: Lang): MessageDict {
  try {
    const file = join(packageRoot(), 'config', 'lang', `${lang}.json`);
    if (!existsSync(file)) return {};
    return JSON.parse(readFileSync(file, 'utf8')) as MessageDict;
  } catch {
    return {};
  }
}

/** 当前语言（与 locate 一致，缓存字典） */
export function currentLang(): Lang {
  if (!cachedDict || cachedDict.lang !== activeLang()) {
    cachedDict = { lang: activeLang(), messages: loadDict(activeLang()) };
  }
  return cachedDict.lang;
}

/** 翻译：取当前语言字典值，缺失回退英文，再缺失返回 key 本身 */
export function t(key: string, params?: Record<string, string | number>): string {
  const lang = currentLang();
  let msg = cachedDict!.messages[key] ?? '';
  if (!msg && lang !== 'en') {
    // 回退英文
    const en = loadDict('en');
    msg = en[key] ?? '';
  }
  if (!msg) return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replaceAll(`{${k}}`, String(v));
    }
  }
  return msg;
}

/** 角色名本地化（team-store 角色 key → 当前语言显示名） */
export function roleLabel(role: string): string {
  return t(`role.${role}`);
}

/** 全部系统角色本地化标签（供 team.get / user.get 的 role_labels 字段） */
export function roleLabels(): Record<string, string> {
  return {
    'delivery-orchestrator': roleLabel('delivery-orchestrator'),
    'domain-expert': roleLabel('domain-expert'),
    'product-manager': roleLabel('product-manager'),
    'ux-designer': roleLabel('ux-designer'),
    'domain-architect': roleLabel('domain-architect'),
    engineer: roleLabel('engineer'),
    developer: roleLabel('developer'),
    'data-engineer': roleLabel('data-engineer'),
    qa: roleLabel('qa'),
  };
}

/** 清空缓存（测试/切换用） */
export function resetI18n(): void {
  cachedDict = null;
}
