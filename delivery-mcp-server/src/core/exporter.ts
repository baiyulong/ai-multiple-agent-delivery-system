import { join } from 'node:path';
import { ensureDir, readText, writeTextAtomic } from './fsx.js';
import { taskDir } from './paths.js';
import { nowIso } from './time.js';
import type { ArtifactMeta, GateCheckRecord, Question, StageRecord, Task } from './types.js';

/**
 * 交付包导出（PRD 8.9 / 9.15）：
 * 汇总任务摘要、流程阶段、交付物列表与内容、门禁结果、待确认问题、关键决策、最终状态。
 */

export interface ExportInput {
  task: Task;
  stages: StageRecord[];
  artifacts: ArtifactMeta[];
  gateRecords: Array<{ stage: string; record: GateCheckRecord }>;
  questions: Question[];
  contextMd: string;
}

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

export async function exportDeliveryPackage(
  root: string,
  taskId: string,
  input: ExportInput,
): Promise<{ path: string; status: 'exported' }> {
  const { task, stages, artifacts, gateRecords, questions, contextMd } = input;

  // 汇总阶段与交付物内容
  const contents = new Map<string, string>();
  for (const a of artifacts) {
    const abs = join(taskDir(root, taskId), a.path);
    const text = await readText(abs);
    if (text !== null) contents.set(a.artifact_id, text);
  }

  const md = [
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

  const rel = `delivery_package.md`;
  const abs = join(taskDir(root, taskId), rel);
  await ensureDir(taskDir(root, taskId));
  await writeTextAtomic(abs, md);
  return { path: rel, status: 'exported' };
}
