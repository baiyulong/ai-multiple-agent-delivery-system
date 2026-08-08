/**
 * 与旧版 app.js 完全一致的映射表，不做任何视觉重设计。
 */

export const TASK_TYPE_MAP: Record<string, string> = {
  crud: 'CRUD',
  lightweight_ddd: '轻量 DDD',
  full_ddd: '完整 DDD',
  ui_only: 'UI',
  tech_refactor: '技术重构',
  qa_only: '仅测试',
  release_only: '仅发布',
};

export const STATUS_MAP: Record<string, string> = {
  draft: '草稿',
  in_progress: '进行中',
  blocked: '已阻塞',
  completed: '已完成',
  cancelled: '已取消',
  archived: '已归档',
};

export const STAGE_STATUS_MAP: Record<string, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  submitted: '已提交',
  validated: '已验证',
  completed: '已完成',
  blocked: '已阻塞',
  needs_revision: '需修改',
  skipped: '已跳过',
};

export const STAGE_NAME_MAP: Record<string, string> = {
  product_requirement: '产品需求',
  ux_design: '交互设计',
  domain_review: '领域评审',
  engineering_design: '工程设计',
  qa_validation: 'QA 验证',
};

export const ROLE_NAME_MAP: Record<string, string> = {
  'product-manager': '产品经理',
  'ux-designer': 'UX 设计师',
  'domain-architect': '领域架构师',
  engineer: '工程师',
  qa: 'QA',
  'platform-devops': '平台运维',
  'domain-expert': '领域专家',
};

export const ARTIFACT_TYPE_MAP: Record<string, string> = {
  crud_spec_card: 'CRUD 规格卡',
  product_requirement_card: '产品需求卡',
  ux_interaction_card: '交互设计卡',
  ddd_applicability_review: 'DDD 适用性评审',
  engineering_plan: '工程方案',
  qa_test_plan: '测试方案',
  release_checklist: '发布清单',
  user_stories: '用户故事',
  acceptance_criteria: '验收标准',
  business_rules: '业务规则',
  ubiquitous_language: '统一语言',
  state_action_matrix: '状态动作矩阵',
  lightweight_domain_model: '轻量领域模型',
  bounded_context: '限界上下文',
  aggregate_design: '聚合设计',
  domain_events: '领域事件',
  api_contract: '接口契约',
  ubiquitous_language_code_map: '业务统一语言·代码映射',
  technical_architecture: '技术架构文档',
};

export const PUBLIC_DOCUMENT_TYPES = [
  'ubiquitous_language_code_map',
  'technical_architecture',
];

export const GATE_RESULT_MAP: Record<string, string> = {
  passed: '通过',
  failed: '未通过',
  warning: '警告',
  manual_review_required: '待人工审核',
};
