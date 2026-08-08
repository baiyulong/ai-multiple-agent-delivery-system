/**
 * Dashboard HTTP API 类型定义
 * 与 delivery-mcp-server/src/dashboard.ts 的返回结构一一对应。
 * 字段保持 snake_case，与后端契约一致。
 */

// ---------- 任务 ----------

export type TaskStatus = 'draft' | 'in_progress' | 'blocked' | 'completed' | 'cancelled' | 'archived';
export type StageStatus =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'submitted'
  | 'validated'
  | 'completed'
  | 'needs_revision'
  | 'skipped';
export type ArtifactStatus = 'draft' | 'submitted' | 'validated' | 'needs_revision' | 'deprecated';
export type GateResult = 'passed' | 'failed' | 'warning' | 'manual_review_required';
export type QuestionStatus = 'open' | 'answered' | 'resolved' | 'cancelled';

/** /api/tasks 列表项（dashboard.ts buildTaskList） */
export interface TaskListItem {
  task_id: string;
  title: string;
  task_type: string;
  status: TaskStatus;
  current_stage: string | null;
  created_by?: string;
  assignees?: Record<string, string>;
  created_at: string;
  updated_at: string;
  completed_stages: number;
  total_stages: number;
}

export interface TaskListResponse {
  tasks: TaskListItem[];
}

/** 任务（完整字段） */
export interface Task {
  task_id: string;
  title: string;
  description: string;
  task_type: string;
  status: TaskStatus;
  current_stage: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  assignees?: Record<string, string>;
}

export interface StageRecord {
  stage: string;
  role: string;
  required_artifact_type: string;
  required_artifact_types?: string[];
  status: StageStatus;
  artifact_id: string | null;
}

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
  path: string;
  created_at: string;
  updated_at: string;
}

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

/** 每阶段最近一次门禁检查摘要（dashboard.ts buildTaskDetail gate_summary） */
export interface GateSummaryEntry {
  result: GateResult;
  score: number;
  checked_at: string;
}

/** /api/tasks/:id */
export interface TaskDetailResponse {
  task: Task;
  stages: StageRecord[];
  artifacts: ArtifactMeta[];
  open_questions: Question[];
  gate_summary: Record<string, GateSummaryEntry>;
}

/** /api/tasks/:id/artifacts/:artifactId */
export interface ArtifactResponse {
  metadata: ArtifactMeta;
  content: string;
}

/** /api/tasks/:id/context、/api/tasks/:id/delivery_package */
export interface ContentResponse {
  content: string;
}

// ---------- 团队 / 用户 ----------

export type TeamRole =
  | 'delivery-orchestrator'
  | 'domain-expert'
  | 'product-manager'
  | 'ux-designer'
  | 'domain-architect'
  | 'engineer'
  | 'qa'
  | 'devops';

export interface TeamMember {
  name: string;
  email: string;
  roles: TeamRole[];
}

/** /api/team */
export interface TeamResponse {
  configured: boolean;
  members: TeamMember[];
  role_labels: Record<string, string>;
  updated_at: string | null;
}

/** /api/user */
export interface UserResponse {
  configured: boolean;
  user: { name: string; email: string } | null;
  roles: string[];
  role_labels: Record<string, string>;
  in_team: boolean;
  updated_at: string | null;
}

// ---------- 公共文档 ----------

/** /api/documents 条目（dashboard.ts buildPublicDocuments） */
export interface PublicDocEntry {
  artifact_id: string | null;
  task_id: string | null;
  task_title: string | null;
  artifact_type: string;
  title: string | null;
  stage: string | null;
  role: string | null;
  status: string | null;
  version: number | null;
  updated_at: string;
  source?: string;
  task_type?: string;
  content?: string;
}

export interface DocumentsResponse {
  documents: PublicDocEntry[];
}
