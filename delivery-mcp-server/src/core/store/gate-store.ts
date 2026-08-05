import { readJson, writeJsonAtomic } from '../fsx.js';
import { gateFile } from '../paths.js';
import type { GateCheckRecord, GateStageFile } from '../types.js';

/** 读取阶段门禁文件（不存在返回空结构） */
export async function readGateStageFile(root: string, taskId: string, stage: string): Promise<GateStageFile> {
  const file = await readJson<GateStageFile>(gateFile(root, taskId, stage));
  return file ?? { stage, checks: {}, history: [] };
}

/** 追加门禁检查记录：按 artifact_id 保留最新 checks，全部进 history（PRD 14.3） */
export async function appendGateRecord(
  root: string,
  taskId: string,
  stage: string,
  record: GateCheckRecord,
): Promise<void> {
  const file = await readGateStageFile(root, taskId, stage);
  file.checks[record.artifact_id] = record;
  file.history.push(record);
  await writeJsonAtomic(gateFile(root, taskId, stage), file);
}

/** 获取阶段某交付物最近一次门禁记录 */
export async function getLatestGateRecord(
  root: string,
  taskId: string,
  stage: string,
  artifactId: string,
): Promise<GateCheckRecord | null> {
  const file = await readGateStageFile(root, taskId, stage);
  return file.checks[artifactId] ?? null;
}
