/**
 * 构建期单语言 i18n：由 VITE_LANG 环境变量（install.js 传入）决定语言，
 * 无运行时切换。缺省 zh。
 */
import zh from '@/locales/zh';
import en from '@/locales/en';

export type Lang = 'zh' | 'en';

const lang: Lang = import.meta.env.VITE_LANG === 'en' ? 'en' : 'zh';

const dict: Record<string, string> = lang === 'en' ? en : zh;

/** 取文案；key 缺失时回退 key 本身。{name} 形式插值。 */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = dict[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

export { lang };
