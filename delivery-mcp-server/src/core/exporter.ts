import { join } from 'node:path';
import MarkdownIt from 'markdown-it';
import { ensureDir, readText, writeTextAtomic } from './fsx.js';
import { taskDir } from './paths.js';
import { nowIso } from './time.js';
import { getQuestions, getStages, getTask, readContext } from './store/task-store.js';
import { listArtifacts } from './store/artifact-store.js';
import { readGateStageFile } from './store/gate-store.js';
import { t } from './i18n.js';
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
  return `${t('export.stage_table_header')}\n|---|---|---|---|---|\n${rows}`;
}

function artifactSection(artifacts: ArtifactMeta[], contents: Map<string, string>): string {
  const parts: string[] = [];
  for (const a of artifacts) {
    const content = contents.get(a.artifact_id) ?? t('export.artifact_read_failed');
    parts.push(
      `### ${a.artifact_type} (${a.artifact_id})\n\n` +
        `${t('export.artifact_stage', { stage: a.stage })}\n${t('export.artifact_role', { role: a.role })}\n${t('export.artifact_status', { status: a.status })}\n${t('export.artifact_version', { version: a.version })}\n` +
        (a.summary ? `${t('export.artifact_summary', { summary: a.summary })}\n` : '') +
        `\n<details>\n<summary>${t('export.artifact_content_summary')}</summary>\n\n${content}\n</details>\n`,
    );
  }
  return parts.join('\n');
}

function gateSection(gateRecords: Array<{ stage: string; record: GateCheckRecord }>): string {
  if (gateRecords.length === 0) return t('export.gate_none');
  const rows = gateRecords
    .map(
      (g) =>
        `| ${g.stage} | ${g.record.artifact_id} | ${g.record.result} | ${g.record.score} | ${g.record.issues.join('; ') || '-'} |`,
    )
    .join('\n');
  return `${t('export.gate_table_header')}\n|---|---|---|---|---|\n${rows}`;
}

function questionSection(questions: Question[]): string {
  if (questions.length === 0) return t('export.question_none');
  return questions
    .map(
      (q) =>
        `- [${q.status}] ${q.question}\n  - ${t('export.question_raised_by')}：${q.raised_by} → ${q.assigned_to_role}${q.blocks_stage ? t('export.question_blocks', { stage: q.blocks_stage }) : ''}${q.answer ? `\n  - ${t('export.question_answer', { answer: q.answer })}` : ''}`,
    )
    .join('\n');
}

/** 从 context.md 提取"已确认决策"章节（标题匹配当前语言） */
function decisionsSection(contextMd: string): string {
  const heading = t('export.decisions_heading');
  const re = new RegExp(`##\\s*(?:\\d+[.、)）]\\s*)?${escapeRegExp(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  const m = re.exec(contextMd);
  return m?.[1]?.trim() ?? t('export.decisions_none');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 生成交付包 Markdown 正文（纯函数，供 md 与 html 两种格式复用；contents 为 artifact_id -> 正文） */
export function buildDeliveryPackageMarkdown(
  input: ExportInput,
  contents: Map<string, string> = new Map(),
): string {
  const { task, stages, artifacts, gateRecords, questions, contextMd } = input;
  return [
    t('export.package_title', { title: task.title }),
    '',
    t('export.task_summary'),
    '',
    t('export.task_id', { id: task.task_id }),
    t('export.task_type', { type: task.task_type }),
    t('export.status', { status: task.status }),
    t('export.created_by', { by: task.created_by }),
    t('export.created_at', { time: task.created_at }),
    t('export.description', { desc: task.description }),
    '',
    t('export.flow_stages'),
    '',
    stageTable(stages),
    '',
    t('export.artifact_list'),
    '',
    artifactSection(artifacts, contents),
    '',
    t('export.gate_results'),
    '',
    gateSection(gateRecords),
    '',
    t('export.open_questions'),
    '',
    questionSection(questions),
    '',
    t('export.key_decisions'),
    '',
    decisionsSection(contextMd),
    '',
    t('export.final_status'),
    '',
    t('export.status', { status: task.status }),
    t('export.current_stage', { stage: task.current_stage ?? '-' }),
    t('export.exported_at', { time: nowIso() }),
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
<html lang="${t('export.html_lang')}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t('export.html_title')}</title>
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

/**
 * 汇总任务当前状态为 ExportInput（任务不存在返回 null）。
 * 供关键节点（任务创建 / 阶段完成 / 创建待确认问题）自动生成文档快照复用，
 * 也供 task.export_delivery_package 与 dashboard 下载端点使用。
 */
export async function collectExportInput(root: string, taskId: string): Promise<ExportInput | null> {
  const task = await getTask(root, taskId);
  if (!task) return null;
  const [stages, artifacts, questions] = await Promise.all([
    getStages(root, taskId),
    listArtifacts(root, taskId),
    getQuestions(root, taskId),
  ]);
  const gateRecords: Array<{ stage: string; record: GateCheckRecord }> = [];
  for (const stage of stages ?? []) {
    const file = await readGateStageFile(root, taskId, stage.stage);
    for (const artifactId of Object.keys(file.checks)) {
      gateRecords.push({ stage: stage.stage, record: file.checks[artifactId]! });
    }
  }
  const contextMd = (await readContext(root, taskId)) ?? '';
  return {
    task,
    stages: stages ?? [],
    artifacts: artifacts ?? [],
    gateRecords,
    questions: questions ?? [],
    contextMd,
  };
}

export interface TaskDocuments {
  /** 相对 .delivery 根目录的可移植路径数组，如 ['tasks/<id>/delivery_package.md']。跨机器一致（Windows/Linux），用于邮件与会话展示 */
  rel_paths: string[];
  /** 当前机器完整绝对路径数组（仅本机直接打开用，不建议跨机器传阅） */
  abs_paths: string[];
  /** 可读提示（含相对路径），便于在邮件/会话中直接展示 */
  hint: string;
}

/**
 * 生成任务文档快照（md/html，不要求全部阶段完成），返回相对路径与完整绝对路径。
 * 用于任务创建 / 阶段完成 / 创建待确认问题等节点自动生成、随结果与通知展示。
 */
export async function exportTaskDocuments(
  root: string,
  taskId: string,
  opts: { formats?: ExportFormat[] } = {},
): Promise<TaskDocuments | null> {
  const input = await collectExportInput(root, taskId);
  if (!input) return null;
  const result = await exportDeliveryPackage(root, taskId, input, {
    formats: opts.formats ?? ['md', 'html'],
  });
  const abs_paths = result.paths.map((p) => join(taskDir(root, taskId), p));
  const rel_paths = result.paths.map((p) => `tasks/${taskId}/${p}`);
  const hint =
    rel_paths.length > 0
      ? t('export.documents_hint', { paths: rel_paths.join('、') })
      : '';
  return { rel_paths, abs_paths, hint };
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
