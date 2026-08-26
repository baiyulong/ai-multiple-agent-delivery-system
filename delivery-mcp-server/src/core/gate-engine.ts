import { join } from 'node:path';
import { readJson, readText } from './fsx.js';
import { builtinGatesDir } from './locate.js';
import { assertInside } from './paths.js';
import { t } from './i18n.js';
import type { GateResult } from './types.js';

/**
 * 门禁引擎（PRD 8.6 / 11.x）：
 * MVP 实现结构检查、必填项检查、内容空值检查、禁用语检查、列表数量检查。
 * 规则配置化：.delivery/config/gates/{artifact_type}.json 优先，回退内置。
 */

export interface ForbiddenPattern {
  section: string;
  pattern: string;
  message: string;
}

export interface MinListItems {
  section: string;
  min: number;
  message?: string;
}

export interface GateRule {
  artifact_type: string;
  required_sections: string[];
  /** 章节别名（兼容不同写法） */
  aliases?: Record<string, string[]>;
  non_empty_sections?: string[];
  forbidden_patterns?: ForbiddenPattern[];
  min_list_items?: MinListItems[];
  /** 通过阈值（0-100），缺省 60 */
  pass_threshold?: number;
}

export interface ParsedSection {
  name: string;
  /** 标题层级（#=1, ##=2 ...） */
  level: number;
  content: string;
}

export interface GateOutcome {
  result: GateResult;
  score: number;
  missing_sections: string[];
  issues: string[];
}

/** 归一化章节名：去掉 # 前缀与序号前缀（阿拉伯数字"## 11. 权限规则"、
 *  中文数字"## 一、需求背景"、"## （一）需求背景" -> "权限规则"/"需求背景"）与空白 */
export function normalizeSectionName(name: string): string {
  return name
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\d+(\.\d+)*[.\、)）]\s*/, '')
    .replace(/^[一二三四五六七八九十]+[、.．]\s*/, '')
    .replace(/^[（(][一二三四五六七八九十]+[)）]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 解析 Markdown 章节：以 #/##/### 为边界切分，内容 = 标题到下一同级标题。
 *  文档标题（# 一级）作为文档头，不作为业务章节。 */
export function parseSections(md: string): ParsedSection[] {
  const lines = md.split(/\r?\n/);
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  const headingRe = /^(#{1,6})\s+(.+)$/;

  for (const line of lines) {
    const m = headingRe.exec(line);
    if (m) {
      const level = m[1]!.length;
      if (current) sections.push(current);
      // 一级标题视为文档标题，不构成业务章节（业务章节从 ## 起）
      current =
        level === 1
          ? null
          : {
              name: normalizeSectionName(m[2] ?? ''),
              level,
              content: '',
            };
    } else if (current) {
      current.content += `${line}\n`;
    }
  }
  if (current) sections.push(current);
  return sections;
}

/** 找到章节内容（含别名），找不到返回 null */
export function findSection(
  sections: ParsedSection[],
  name: string,
  rule?: GateRule,
): { found: boolean; content: string } {
  const aliases = rule?.aliases?.[name] ?? [];
  const candidates = [name, ...aliases];
  const normalized = candidates.map((c) => normalizeSectionName(c));
  const sec = sections.find((s) => normalized.includes(s.name));
  return sec ? { found: true, content: sec.content } : { found: false, content: '' };
}

/** 统计章节内的列表项（- / * / + / 数字.）数量，用于"至少 N 条验收标准"检查 */
export function countListItems(content: string): number {
  const lines = content.split(/\r?\n/);
  let count = 0;
  for (const line of lines) {
    const t = line.trim();
    if (/^[-*+]\s+/.test(t) || /^\d+[.、)]\s+/.test(t)) count++;
  }
  return count;
}

/** 加载门禁规则：用户配置优先，回退内置 */
export async function loadGateRule(root: string, artifactType: string): Promise<GateRule | null> {
  const userPath = assertInside(root, join(root, 'config', 'gates', `${artifactType}.json`));
  const fromUser = await readJson<GateRule>(userPath);
  if (fromUser) return fromUser;
  const builtinPath = join(builtinGatesDir(), `${artifactType}.json`);
  return readJson<GateRule>(builtinPath);
}

/** 执行门禁检查（结构 + 必填 + 空值 + 禁语 + 列表数量） */
export function runGate(content: string, rule: GateRule): GateOutcome {
  const sections = parseSections(content);
  const missingSections: string[] = [];
  const issues: string[] = [];
  let score = 100;

  // 1. 结构检查 / 必填项检查（PRD 8.6-1/2）
  for (const required of rule.required_sections) {
    const { found } = findSection(sections, required, rule);
    if (!found) {
      missingSections.push(required);
      score -= 15;
    }
  }

  // 2. 内容空值检查（PRD 8.6-3 / 11.1-2）
  for (const nonEmpty of rule.non_empty_sections ?? []) {
    const { found, content: secContent } = findSection(sections, nonEmpty, rule);
    if (!found) {
      // 已计入 missing；不重复
      continue;
    }
    if (secContent.trim().length === 0) {
      issues.push(t('gate.issue.empty_section', { section: nonEmpty }));
      score -= 10;
    }
  }

  // 3. 禁用语检查（PRD 11.1-3/4）
  for (const f of rule.forbidden_patterns ?? []) {
    const { found, content: secContent } = findSection(sections, f.section, rule);
    if (!found) continue;
    try {
      if (new RegExp(f.pattern, 'm').test(secContent)) {
        issues.push(f.message || t('gate.issue.forbidden_pattern', { section: f.section }));
        score -= 10;
      }
    } catch {
      // 非法正则忽略
    }
  }

  // 4. 列表数量检查（PRD 11.1-5：至少 3 条验收标准）
  for (const m of rule.min_list_items ?? []) {
    const { found, content: secContent } = findSection(sections, m.section, rule);
    if (!found) continue;
    const n = countListItems(secContent);
    if (n < m.min) {
      issues.push(m.message || t('gate.issue.min_list_items', { section: m.section, min: m.min, n }));
      score -= 10;
    }
  }

  score = Math.max(0, score);

  // 4. 结果判定（PRD 9.10）
  let result: GateResult;
  if (missingSections.length > 0) {
    result = 'failed';
  } else if (issues.length > 0) {
    result = 'failed';
  } else if (score < (rule.pass_threshold ?? 60)) {
    result = 'warning';
  } else {
    result = 'passed';
  }

  return { result, score, missing_sections: missingSections, issues };
}

/** 读交付物内容（供 gate.check 用），null 表示不存在 */
export async function readArtifactContent(pathAbs: string): Promise<string | null> {
  return readText(pathAbs);
}
