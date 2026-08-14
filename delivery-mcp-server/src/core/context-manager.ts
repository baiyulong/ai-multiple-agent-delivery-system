import { normalizeSectionName, parseSections } from './gate-engine.js';
import { readContext, writeContext } from './store/task-store.js';
import { t } from './i18n.js';

/**
 * 共享上下文管理（PRD 8.7 / 9.11 / 9.12）：
 * 按 ## 章节定位并替换内容。
 */

export interface SectionUpdateResult {
  status: 'updated';
  section: string;
}

/** 按章节名更新 context.md（归一化匹配；替换该章节正文，保留标题行） */
export async function updateContextSection(
  root: string,
  taskId: string,
  section: string,
  content: string,
): Promise<SectionUpdateResult> {
  const md = await readContext(root, taskId);
  const lines = md.split(/\r?\n/);
  const sections = parseSections(md);

  const target = normalizeSectionName(section);
  const idx = sections.findIndex((s) => s.name === target);
  if (idx < 0) {
    throw new Error(
      t('context.section_not_found', { section, available: sections.map((s) => s.name).join('、') }),
    );
  }

  // 定位该章节标题行的原始行号
  let headingLine = -1;
  const headingRe = /^(#{1,6})\s+(.+)$/;
  for (let i = 0; i < lines.length; i++) {
    const m = headingRe.exec(lines[i]!);
    if (m && normalizeSectionName(m[2] ?? '') === target) {
      headingLine = i;
      break;
    }
  }
  if (headingLine < 0) throw new Error(t('context.heading_not_found', { section }));

  // 找下一个同级或更高级标题作为结束
  const level = (lines[headingLine]!.match(/^#{1,6}/)?.[0] ?? '').length;
  let endLine = lines.length;
  for (let i = headingLine + 1; i < lines.length; i++) {
    const m = headingRe.exec(lines[i]!);
    if (m && (m[1]!.length <= level)) {
      endLine = i;
      break;
    }
  }

  const newLines = [
    ...lines.slice(0, headingLine + 1),
    content.trimEnd(),
    '',
    ...lines.slice(endLine),
  ];
  await writeContext(root, taskId, newLines.join('\n'));

  return { status: 'updated', section: sections[idx]!.name };
}
