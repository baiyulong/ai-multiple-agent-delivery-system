import { getStages, saveStages } from './task-store.js';
import type { StageRecord, StageStatus } from '../types.js';

/** 更新任务中某阶段的状态（联动 task.json 的 updated_at 由 saveStages 调用方负责） */
export async function setStageStatus(
  root: string,
  taskId: string,
  stageName: string,
  status: StageStatus,
  stages?: StageRecord[],
): Promise<StageRecord | null> {
  const current = stages ?? (await getStages(root, taskId));
  if (!current) return null;
  const rec = current.find((s) => s.stage === stageName);
  if (!rec) return null;
  rec.status = status;
  await saveStages(root, taskId, current);
  return rec;
}

/** 将某阶段的 artifact_id 记录到 stages.json（PRD 5.2 示例） */
export async function setStageArtifactId(
  root: string,
  taskId: string,
  stageName: string,
  artifactId: string,
  stages?: StageRecord[],
): Promise<void> {
  const current = stages ?? (await getStages(root, taskId));
  if (!current) return;
  const rec = current.find((s) => s.stage === stageName);
  if (rec) rec.artifact_id = artifactId;
  await saveStages(root, taskId, current);
}
