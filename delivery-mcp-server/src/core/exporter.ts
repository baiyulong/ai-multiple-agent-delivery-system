import { join } from 'node:path';
import MarkdownIt from 'markdown-it';
import { ensureDir, readText, writeTextAtomic } from './fsx.js';
import { taskDir } from './paths.js';
import { nowIso } from './time.js';
import type { ArtifactMeta, GateCheckRecord, Question, StageRecord, Task } from './types.js';

/**
 * 交付包导出（PRD 8.9 / 9.15）：
 * 汇总任务摘要、流程阶段、交付物列表与内容、门禁结果、待确认问题、关键决策、最终状态。
 * 支持 markdown（delivery_package.md）与自包含 HTML（delivery_package.html）两种格式，便于传阅。
 */

export interface ExportInput {
  task: Task;
  stages: StageRecord[];
  artifacts: ArtifactMeta[];
  gateRecords: Array<{ stage: string; record: GateCheckRecord }>;
  questions: Question[];
  contextMd: string;
}

/** 导出格式 */
export type ExportFormat = 'md' | 'html';

function stageTable(stages: StageRecord[]): string {
  const rows = stages
    .map(
      (s) =>
        `| ${s.stage} | ${s.role} | ${s.required_artifact_types?.join(', ') ?? s.required_artifact_type} | ${s.status} | ${s.artifact_id ?? '-'} |`,
    )
    .join('\n');
  return `| 阶段 | 角色 | 交付物类型 | 状态 | 交付物 ID |\n|---|---|---|---|---|\n${rows}`;
}

function artifactSection(artifacts: ArtifactMeta[], contents: Map<string, string>): string {
  const parts: string[] = [];
  for (const a of artifacts) {
    const content = contents.get(a.artifact_id) ?? '（内容读取失败）';
    parts.push(
      `### ${a.artifact_type} (${a.artifact_id})\n\n` +
        `- 阶段：${a.stage}\n- 角色：${a.role}\n- 状态：${a.status}\n- 版本：${a.version}\n` +
        (a.summary ? `- 摘要：${a.summary}\n` : '') +
        `\n<details>\n<summary>交付物内容</summary>\n\n${content}\n</details>\n`,
    );
  }
  return parts.join('\n');
}

function gateSection(gateRecords: Array<{ stage: string; record: GateCheckRecord }>): string {
  if (gateRecords.length === 0) return '（暂无门禁记录）';
  const rows = gateRecords
    .map(
      (g) =>
        `| ${g.stage} | ${g.record.artifact_id} | ${g.record.result} | ${g.record.score} | ${g.record.issues.join('; ') || '-'} |`,
    )
    .join('\n');
  return `| 阶段 | 交付物 | 结果 | 分数 | 问题 |\n|---|---|---|---|---|\n${rows}`;
}

function questionSection(questions: Question[]): string {
  if (questions.length === 0) return '（无待确认问题）';
  return questions
    .map(
      (q) =>
        `- [${q.status}] ${q.question}\n  - 提出方：${q.raised_by} → ${q.assigned_to_role}${q.blocks_stage ? `（阻塞 ${q.blocks_stage}）` : ''}${q.answer ? `\n  - 答复：${q.answer}` : ''}`,
    )
    .join('\n');
}

/** 从 context.md 提取"已确认决策"章节 */
function decisionsSection(contextMd: string): string {
  const re = /##\s*(?:\d+[.\、)）]\s*)?已确认决策\s*\n([\s\S]*?)(?=\n##\s|$)/;
  const m = re.exec(contextMd);
  return m?.[1]?.trim() ?? '（未记录）';
}

/** 生成交付包 Markdown 正文（纯函数，供 md 与 html 两种格式复用；contents 为 artifact_id -> 正文） */
export function buildDeliveryPackageMarkdown(
  input: ExportInput,
  contents: Map<string, string> = new Map(),
): string {
  const { task, stages, artifacts, gateRecords, questions, contextMd } = input;
  return [
    `# 交付包：${task.title}`,
    '',
    '## 任务摘要',
    '',
    `- 任务 ID：${task.task_id}`,
    `- 任务类型：${task.task_type}`,
    `- 状态：${task.status}`,
    `- 创建人：${task.created_by}`,
    `- 创建时间：${task.created_at}`,
    `- 描述：${task.description}`,
    '',
    '## 流程阶段',
    '',
    stageTable(stages),
    '',
    '## 交付物列表',
    '',
    artifactSection(artifacts, contents),
    '',
    '## 门禁结果',
    '',
    gateSection(gateRecords),
    '',
    '## 待确认问题',
    '',
    questionSection(questions),
    '',
    '## 关键决策',
    '',
    decisionsSection(contextMd),
    '',
    '## 最终状态',
    '',
    `- 任务状态：${task.status}`,
    `- 当前阶段：${task.current_stage ?? '-'}`,
    `- 导出时间：${nowIso()}`,
    '',
  ].join('\n');
}

/** 读取交付物内容（artifacts -> 内容映射），供正文生成使用 */
async function loadArtifactContents(
  root: string,
  taskId: string,
  artifacts: ArtifactMeta[],
): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  for (const a of artifacts) {
    const abs = join(taskDir(root, taskId), a.path);
    const text = await readText(abs);
    if (text !== null) contents.set(a.artifact_id, text);
  }
  return contents;
}

/** 生成自包含 HTML（内联样式，离线可看、方便传阅） */
export function buildDeliveryPackageHtml(md: string): string {
  const renderer = new MarkdownIt({ html: true, linkify: true, breaks: true });
  const body = renderer.render(md);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>交付包</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif;
    max-width: 900px; margin: 0 auto; padding: 32px 20px;
    line-height: 1.7; color: #1a1d23; background: #fff;
  }
  h1 { font-size: 1.6rem; border-bottom: 2px solid #bfdbfe; padding-bottom: 8px; }
  h2 { font-size: 1.25rem; margin-top: 1.6em; border-bottom: 1px solid #e2e5ea; padding-bottom: 4px; }
  h3 { font-size: 1.05rem; margin-top: 1.2em; }
  a { color: #1e40af; }
  table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 0.9rem; }
  th, td { border: 1px solid #e2e5ea; padding: 6px 12px; text-align: left; }
  th { background: #f3f4f6; }
  details { margin: 0.5em 0; border: 1px solid #e2e5ea; border-radius: 6px; padding: 6px 10px; }
  summary { cursor: pointer; font-weight: 500; }
  pre { background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; overflow-x: auto; }
  code { background: #f3f4f6; padding: 1px 5px; border-radius: 3px; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #bfdbfe; margin: 0; padding-left: 12px; color: #5f6570; }
  hr { border: none; border-top: 1px solid #e2e5ea; margin: 1.5em 0; }
  @media (prefers-color-scheme: dark) {
    body { color: rgba(255,255,255,0.85); background: #141414; }
    h1 { border-bottom-color: #1f3a68; }
    h2 { border-bottom-color: #303030; }
    th, td { border-color: #303030; }
    th { background: #1f1f1f; }
    code { background: #1f1f1f; }
    blockquote { border-left-color: #1f3a68; color: rgba(255,255,255,0.65); }
    details { border-color: #303030; }
    a { color: #93c5fd; }
  }
  @media print { body { padding: 0; } details { border: none; } }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

export interface ExportResult {
  path: string;
  status: 'exported';
}

export async function exportDeliveryPackage(
  root: string,
  taskId: string,
  input: ExportInput,
  opts: { formats?: ExportFormat[] } = {},
): Promise<{ path: string; status: 'exported'; paths: string[] }> {
  const { task, stages, artifacts, gateRecords, questions, contextMd } = input;
  const formats = opts.formats ?? ['md'];

  // 汇总阶段与交付物内容
  const contents = await loadArtifactContents(root, taskId, artifacts);
  const inputWithContents: ExportInput = { task, stages, artifacts, gateRecords, questions, contextMd };

  const md = buildDeliveryPackageMarkdown(inputWithContents, contents);

  const paths: string[] = [];
  const written: string[] = [];
  for (const fmt of formats) {
    if (fmt === 'html') {
      const rel = 'delivery_package.html';
      const abs = join(taskDir(root, taskId), rel);
      await ensureDir(taskDir(root, taskId));
      await writeTextAtomic(abs, buildDeliveryPackageHtml(md));
      paths.push(rel);
      written.push(rel);
    } else {
      const rel = 'delivery_package.md';
      const abs = join(taskDir(root, taskId), rel);
      await ensureDir(taskDir(root, taskId));
      await writeTextAtomic(abs, md);
      paths.push(rel);
      written.push(rel);
    }
  }

  return { path: written[0] ?? '', status: 'exported', paths };
}
