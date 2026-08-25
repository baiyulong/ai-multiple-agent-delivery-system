import { join } from 'node:path';
import { contextTemplateFile } from '../locate.js';
import { ensureDir, readJson, readText, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { generateTaskId } from '../ids.js';
import { assertInside, taskDir } from '../paths.js';
import { nowIso } from '../time.js';
import type { Question, StageRecord, Task, TaskStatus, TaskType } from '../types.js';

/** 创建任务输入（flow-engine 负责将 FlowTemplate 转成 StageRecord[]） */
export interface CreateTaskInput {
  title: string;
  description: string;
  createdBy: string;
  taskType: TaskType;
  stages: StageRecord[];
  /** 任务级指派：role -> 负责人邮箱（每角色在本任务中只有一个负责人） */
  assignees?: Record<string, string>;
}

const CONTEXT_SKELETON = '# 项目共享上下文\n';

/** 创建任务并初始化全套文件（PRD 8.1.1 / 10.1） */
export async function createTask(root: string, input: CreateTaskInput): Promise<Task> {
  const taskId = await generateTaskId(root);
  const dir = taskDir(root, taskId);
  await ensureDir(dir);
  await ensureDir(join(dir, 'artifacts'));
  await ensureDir(join(dir, 'gates'));

  const now = nowIso();
  const task: Task = {
    task_id: taskId,
    title: input.title,
    description: input.description,
    task_type: input.taskType,
    status: 'in_progress',
    current_stage: input.stages[0]?.stage ?? null,
    created_by: input.createdBy,
    created_at: now,
    updated_at: now,
    assignees: input.assignees,
  };

  await writeJsonAtomic(join(dir, 'task.json'), task);
  await writeJsonAtomic(join(dir, 'stages.json'), input.stages);
  const context = (await readText(contextTemplateFile())) ?? CONTEXT_SKELETON;
  await writeTextAtomic(join(dir, 'context.md'), injectOriginalRequirement(context, input.title, input.description));
  await writeJsonAtomic(join(dir, 'questions.json'), []);
  await writeJsonAtomic(join(dir, 'artifacts', 'index.json'), []);

  return task;
}

/**
 * 把用户首次输入的原始需求写入 context.md 的「1. 项目背景」章节，
 * 保证等待业务专家澄清期间，原始需求在共享上下文/看板中可见（PRD 9.11）。
 */
function injectOriginalRequirement(context: string, title: string, description: string): string {
  const block = [
    '> **任务标题**：' + title,
    '>',
    '> **原始需求（用户首次输入）**：',
    '> ' + description.replace(/\r?\n/g, '\n> '),
  ].join('\n');
  const marker = '## 1. 项目背景';
  const idx = context.indexOf(marker);
  if (idx < 0) return context; // 模板缺失该章节时保持原样
  const headEnd = idx + marker.length;
  return `${context.slice(0, headEnd)}\n\n${block}${context.slice(headEnd)}`;
}

/** 读取任务，不存在返回 null */
export async function getTask(root: string, taskId: string): Promise<Task | null> {
  return readJson<Task>(taskFileSafe(root, taskId, 'task.json'));
}

export async function saveTask(root: string, task: Task): Promise<void> {
  task.updated_at = nowIso();
  await writeJsonAtomic(taskFileSafe(root, task.task_id, 'task.json'), task);
}

/** 读取阶段列表 */
export async function getStages(root: string, taskId: string): Promise<StageRecord[] | null> {
  return readJson<StageRecord[]>(taskFileSafe(root, taskId, 'stages.json'));
}

export async function saveStages(root: string, taskId: string, stages: StageRecord[]): Promise<void> {
  await writeJsonAtomic(taskFileSafe(root, taskId, 'stages.json'), stages);
}

/** 读取待确认问题列表 */
export async function getQuestions(root: string, taskId: string): Promise<Question[]> {
  return (await readJson<Question[]>(taskFileSafe(root, taskId, 'questions.json'))) ?? [];
}

export async function saveQuestions(root: string, taskId: string, questions: Question[]): Promise<void> {
  await writeJsonAtomic(taskFileSafe(root, taskId, 'questions.json'), questions);
}

/** 列出所有任务 ID（按目录） */
export async function listTaskIds(root: string): Promise<string[]> {
  const { scanTaskIds } = await import('../ids.js');
  return scanTaskIds(root);
}

/** 写共享上下文全文 */
export async function writeContext(root: string, taskId: string, content: string): Promise<void> {
  await writeTextAtomic(taskFileSafe(root, taskId, 'context.md'), content);
}

/** 读共享上下文全文 */
export async function readContext(root: string, taskId: string): Promise<string> {
  return (await readText(taskFileSafe(root, taskId, 'context.md'))) ?? CONTEXT_SKELETON;
}

function taskFileSafe(root: string, taskId: string, file: string): string {
  return assertInside(root, join(taskDir(root, taskId), file));
}

export type { TaskStatus };
