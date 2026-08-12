import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson } from './fsx.js';
import { taskDir } from './paths.js';
import { todayStamp } from './time.js';
import type { ArtifactMeta, GateStageFile, Question } from './types.js';

/**
 * ID 生成（PRD 8.1.1 / 14.3）：
 * ART-YYYYMMDD-NNN / Q-YYYYMMDD-NNN / GATE-YYYYMMDD-NNN
 * NNN = 同日期已有最大序号 + 1（三位补零）。
 *
 * 任务 ID 增加 4 位随机后缀（crypto）：TASK-YYYYMMDD-NNN-XXXX，
 * 保证多台电脑各自生成任务时也不会冲突（日期+序号在多机间会重复）。
 */

export interface IdScan {
  prefix: string;
  date: string;
  existing: string[];
}

const ID_RE = (prefix: string, date: string): RegExp =>
  new RegExp(`^${prefix}-${date}-(\\d+)(?:-[a-z0-9]+)?$`);

export function nextSequence(scan: IdScan): string {
  const re = ID_RE(scan.prefix, scan.date);
  let max = 0;
  for (const id of scan.existing) {
    const m = re.exec(id);
    if (m) {
      const n = parseInt(m[1]!, 10);
      if (n > max) max = n;
    }
  }
  return String(max + 1).padStart(3, '0');
}

/** 任务 ID 随机后缀：4 位小写十六进制（65536 种组合，足以避免多机冲突） */
export function taskIdSuffix(): string {
  return randomBytes(2).toString('hex');
}

/** 扫描 tasks/ 目录名中的任务 ID（兼容旧格式 TASK-YYYYMMDD-NNN 与新格式 TASK-YYYYMMDD-NNN-XXXX） */
export async function scanTaskIds(root: string): Promise<string[]> {
  let names: string[] = [];
  try {
    names = await readdir(join(root, 'tasks'));
  } catch {
    names = [];
  }
  return names.filter((n) => /^TASK-\d{8}-\d{3}(?:-[a-z0-9]{4})?$/.test(n));
}

/** 扫描全部任务的交付物 ID */
async function scanArtifactIds(root: string): Promise<string[]> {
  const ids: string[] = [];
  for (const taskId of await scanTaskIds(root)) {
    const index = await readJson<ArtifactMeta[]>(join(taskDir(root, taskId), 'artifacts', 'index.json'));
    if (Array.isArray(index)) {
      for (const a of index) if (a?.artifact_id) ids.push(a.artifact_id);
    }
  }
  return ids;
}

/** 扫描全部任务的 question ID */
async function scanQuestionIds(root: string): Promise<string[]> {
  const ids: string[] = [];
  for (const taskId of await scanTaskIds(root)) {
    const questions = await readJson<Question[]>(join(taskDir(root, taskId), 'questions.json'));
    if (Array.isArray(questions)) {
      for (const q of questions) if (q?.question_id) ids.push(q.question_id);
    }
  }
  return ids;
}

/** 扫描全部任务的 gate ID（含历史） */
async function scanGateIds(root: string): Promise<string[]> {
  const ids: string[] = [];
  for (const taskId of await scanTaskIds(root)) {
    const gateDir = join(taskDir(root, taskId), 'gates');
    let files: string[] = [];
    try {
      files = await readdir(gateDir);
    } catch {
      files = [];
    }
    for (const f of files) {
      if (!f.endsWith('.gate.json')) continue;
      const file = await readJson<GateStageFile>(join(gateDir, f));
      if (!file) continue;
      for (const r of file.history ?? []) if (r?.gate_id) ids.push(r.gate_id);
      const cur = (file.checks ?? {}) as Record<string, { gate_id?: string }>;
      for (const k of Object.keys(cur)) {
        if (cur[k]?.gate_id) ids.push(cur[k]!.gate_id!);
      }
    }
  }
  return ids;
}

export async function generateTaskId(root: string, date: Date = new Date()): Promise<string> {
  const d = todayStamp(date);
  const seq = nextSequence({ prefix: 'TASK', date: d, existing: await scanTaskIds(root) });
  return `TASK-${d}-${seq}-${taskIdSuffix()}`;
}

export async function generateArtifactId(root: string, date: Date = new Date()): Promise<string> {
  const d = todayStamp(date);
  const seq = nextSequence({ prefix: 'ART', date: d, existing: await scanArtifactIds(root) });
  return `ART-${d}-${seq}`;
}

export async function generateQuestionId(root: string, date: Date = new Date()): Promise<string> {
  const d = todayStamp(date);
  const seq = nextSequence({ prefix: 'Q', date: d, existing: await scanQuestionIds(root) });
  return `Q-${d}-${seq}`;
}

export async function generateGateId(root: string, date: Date = new Date()): Promise<string> {
  const d = todayStamp(date);
  const seq = nextSequence({ prefix: 'GATE', date: d, existing: await scanGateIds(root) });
  return `GATE-${d}-${seq}`;
}
