/**
 * 领域模型与枚举定义（对齐 PRD 第 5 章 / 8.1.3）
 * 所有 JSON 字段保持 snake_case。
 */

export const TASK_TYPES = [
  'crud',
  'lightweight_ddd',
  'full_ddd',
  'ui_only',
  'tech_refactor',
  'qa_only',
  'release_only',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

/** MVP 优先支持的三种任务类型（PRD 6.1） */
export const MVP_TASK_TYPES: readonly TaskType[] = ['crud', 'lightweight_ddd', 'full_ddd'];

export const TASK_STATUSES = ['draft', 'in_progress', 'blocked', 'completed', 'cancelled', 'archived'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STAGE_STATUSES = [
  'not_started',
  'in_progress',
  'blocked',
  'submitted',
  'validated',
  'completed',
  'needs_revision',
  'skipped',
] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const ARTIFACT_STATUSES = ['draft', 'submitted', 'validated', 'needs_revision', 'deprecated'] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

export const GATE_RESULTS = ['passed', 'failed', 'warning', 'manual_review_required'] as const;
export type GateResult = (typeof GATE_RESULTS)[number];

export const QUESTION_STATUSES = ['open', 'answered', 'resolved', 'cancelled'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/** 任务（PRD 5.1 / 10.2） */
export interface Task {
  task_id: string;
  title: string;
  description: string;
  task_type: TaskType;
  status: TaskStatus;
  current_stage: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** 阶段（PRD 5.2 / 10.3） */
export interface StageRecord {
  stage: string;
  role: string;
  required_artifact_type: string;
  /** 需要多个交付物的阶段使用（轻量/完整 DDD），缺省回退到 required_artifact_type */
  required_artifact_types?: string[];
  status: StageStatus;
  artifact_id: string | null;
}

/** 流程模板阶段定义（PRD 8.3） */
export interface FlowStageDef {
  stage: string;
  role: string;
  required_artifact_type: string;
  required_artifact_types?: string[];
  required_previous_stages: string[];
  gate_rules?: string[];
  allow_skip: boolean;
}

/** 流程模板（PRD 8.3） */
export interface FlowTemplate {
  task_type: TaskType;
  flow: FlowStageDef[];
}

/** 交付物 metadata（PRD 5.3 / 10.4） */
export interface ArtifactMeta {
  artifact_id: string;
  task_id: string;
  stage: string;
  role: string;
  artifact_type: string;
  title?: string;
  summary?: string;
  status: ArtifactStatus;
  version: number;
  /** 相对任务目录的路径，如 artifacts/product_requirement/crud_spec_card.md */
  path: string;
  created_at: string;
  updated_at: string;
}

/** 单次门禁检查记录（PRD 5.4 / 14.3） */
export interface GateCheckRecord {
  gate_id: string;
  task_id: string;
  stage: string;
  artifact_id: string;
  artifact_type: string;
  result: GateResult;
  score: number;
  missing_sections: string[];
  issues: string[];
  checked_at: string;
}

/** 阶段门禁文件结构（gates/{stage}.gate.json） */
export interface GateStageFile {
  stage: string;
  /** artifact_id -> 该交付物最近一次检查 */
  checks: Record<string, GateCheckRecord>;
  /** 全部历史检查记录（PRD 14.3 可追踪性） */
  history: GateCheckRecord[];
}

/** 待确认问题（PRD 5.5 / 10.5） */
export interface Question {
  question_id: string;
  task_id: string;
  raised_by: string;
  assigned_to_role: string;
  question: string;
  blocks_stage: string | null;
  status: QuestionStatus;
  answer?: string;
  resolved_by?: string;
  created_at: string;
  updated_at: string;
}

/** task.detect_type 输出（PRD 8.2 / 9.3） */
export interface TypeDetection {
  task_type: TaskType;
  confidence: number;
  reason: string;
  recommended_flow: string[];
}

/** 缺失上游交付物信息（PRD 7.3 / 7.4） */
export interface MissingUpstream {
  stage: string;
  role: string;
  missing_artifact_types: string[];
  assigned_agent: string;
}
