import { join } from 'node:path';
import { readJson } from './fsx.js';
import { builtinFlowsDir } from './locate.js';
import { assertInside, taskDir } from './paths.js';
import { agentNameForRole } from './store/team-store.js';
import type { FlowStageDef, FlowTemplate, MissingUpstream, StageRecord, TaskType } from './types.js';

/**
 * 流程引擎（PRD 8.3 / 8.4 / 12.1）：
 * - 流程模板优先读 .delivery/config/flows/，回退内置模板（14.1 配置化）
 * - 阶段推进、上游检查、缺失交付物指派
 */

export const FLOW_FILE_NAMES: Record<TaskType, string> = {
  crud: 'crud-flow.json',
  lightweight_ddd: 'lightweight-ddd-flow.json',
  full_ddd: 'full-ddd-flow.json',
  analysis: 'analysis-flow.json',
  bug_fix: 'bug-fix-flow.json',
  ui_only: 'ui-only-flow.json',
  tech_refactor: 'tech-refactor-flow.json',
  qa_only: 'qa-only-flow.json',
  release_only: 'release-only-flow.json',
};

/** 阶段所需交付物类型列表 */
export function requiredTypes(stage: { required_artifact_type: string; required_artifact_types?: string[] }): string[] {
  return stage.required_artifact_types ?? [stage.required_artifact_type];
}

/** 加载流程模板：用户配置优先，回退内置 */
export async function loadFlowTemplate(root: string, taskType: TaskType): Promise<FlowTemplate | null> {
  const fileName = FLOW_FILE_NAMES[taskType];
  const userPath = assertInside(root, join(root, 'config', 'flows', fileName));
  const fromUser = await readJson<FlowTemplate>(userPath);
  if (fromUser) return fromUser;
  const builtinPath = join(builtinFlowsDir(), fileName);
  const fromBuiltin = await readJson<FlowTemplate>(builtinPath);
  return fromBuiltin;
}

/** 由流程模板构建初始阶段记录（PRD 10.3） */
export function buildStagesFromFlow(flow: FlowTemplate): StageRecord[] {
  return flow.flow.map((def) => ({
    stage: def.stage,
    role: def.role,
    required_artifact_type: def.required_artifact_type,
    required_artifact_types: def.required_artifact_types ?? [def.required_artifact_type],
    status: 'not_started',
    artifact_id: null,
  }));
}

/** 从模板查找阶段定义 */
export function findStageDef(flow: FlowTemplate, stageName: string): FlowStageDef | null {
  return flow.flow.find((s) => s.stage === stageName) ?? null;
}

/** 返回流程中指定阶段之后的下一阶段定义 */
export function nextStageDef(flow: FlowTemplate, stageName: string): FlowStageDef | null {
  const idx = flow.flow.findIndex((s) => s.stage === stageName);
  if (idx < 0) return null;
  return flow.flow[idx + 1] ?? null;
}

/** 返回流程中指定阶段之前的全部阶段定义 */
export function previousStageDefs(flow: FlowTemplate, stageName: string): FlowStageDef[] {
  const idx = flow.flow.findIndex((s) => s.stage === stageName);
  if (idx < 0) return [];
  return flow.flow.slice(0, idx);
}

/**
 * 上游检查（PRD 7.3 / 7.4 / 12.2）：
 * 返回缺失上游交付物清单，role -> assigned_agent（OpenCode agent 名与 role 同名）。
 */
export async function checkMissingUpstream(
  root: string,
  taskId: string,
  flow: FlowTemplate,
  stageName: string,
): Promise<MissingUpstream[]> {
  const stageDef = findStageDef(flow, stageName);
  if (!stageDef) return [];
  const upstreamDefs = stageDef.required_previous_stages.length
    ? stageDef.required_previous_stages
        .map((s) => findStageDef(flow, s))
        .filter((d): d is FlowStageDef => d !== null)
    : previousStageDefs(flow, stageName);

  const stages = await readStages(root, taskId);
  const missing: MissingUpstream[] = [];
  for (const def of upstreamDefs) {
    const record = stages?.find((s) => s.stage === def.stage);
    const satisfied = record?.status === 'completed' || record?.status === 'skipped';
    if (!satisfied) {
      missing.push({
        stage: def.stage,
        role: def.role,
        missing_artifact_types: requiredTypes(def),
        assigned_agent: agentNameForRole(def.role),
      });
    }
  }
  return missing;
}

async function readStages(root: string, taskId: string) {
  const { getStages } = await import('./store/task-store.js');
  return getStages(root, taskId);
}

/** 获取任务当前阶段 */
export async function getCurrentStage(root: string, taskId: string): Promise<string | null> {
  const { getTask } = await import('./store/task-store.js');
  const task = await getTask(root, taskId);
  return task?.current_stage ?? null;
}

/** 获取下一未完成阶段 */
export async function nextIncompleteStage(
  root: string,
  taskId: string,
  flow: FlowTemplate,
): Promise<FlowStageDef | null> {
  const stages = await readStages(root, taskId);
  if (!stages) return null;
  for (const def of flow.flow) {
    const record = stages.find((s) => s.stage === def.stage);
    if (record && record.status !== 'completed' && record.status !== 'skipped') return def;
  }
  return null;
}

/** 阶段是否可跳过（allow_skip） */
export function canSkipStage(flow: FlowTemplate, stageName: string): boolean {
  const def = findStageDef(flow, stageName);
  return def?.allow_skip ?? false;
}
