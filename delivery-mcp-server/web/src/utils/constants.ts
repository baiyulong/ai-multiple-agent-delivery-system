/**
 * 与旧版 app.js 完全一致的映射表，不做任何视觉重设计。
 * 文案取自构建期语言字典（VITE_LANG）。
 */
import { t } from './i18n';

export const TASK_TYPE_MAP: Record<string, string> = {
  crud: t('taskType.crud'),
  lightweight_ddd: t('taskType.lightweight_ddd'),
  full_ddd: t('taskType.full_ddd'),
  ui_only: t('taskType.ui_only'),
  tech_refactor: t('taskType.tech_refactor'),
  qa_only: t('taskType.qa_only'),
  release_only: t('taskType.release_only'),
};

export const STATUS_MAP: Record<string, string> = {
  draft: t('status.draft'),
  in_progress: t('status.in_progress'),
  blocked: t('status.blocked'),
  completed: t('status.completed'),
  cancelled: t('status.cancelled'),
  archived: t('status.archived'),
};

export const STAGE_STATUS_MAP: Record<string, string> = {
  not_started: t('stageStatus.not_started'),
  in_progress: t('stageStatus.in_progress'),
  submitted: t('stageStatus.submitted'),
  validated: t('stageStatus.validated'),
  completed: t('stageStatus.completed'),
  blocked: t('stageStatus.blocked'),
  needs_revision: t('stageStatus.needs_revision'),
  skipped: t('stageStatus.skipped'),
};

export const STAGE_NAME_MAP: Record<string, string> = {
  product_requirement: t('stage.name.product_requirement'),
  ux_design: t('stage.name.ux_design'),
  domain_review: t('stage.name.domain_review'),
  domain_design: t('stage.name.domain_design'),
  engineering_design: t('stage.name.engineering_design'),
  implementation: t('stage.name.implementation'),
  qa_validation: t('stage.name.qa_validation'),
};

export const ROLE_NAME_MAP: Record<string, string> = {
  'product-manager': t('role.product-manager'),
  'ux-designer': t('role.ux-designer'),
  'architect': t('role.architect'),
  engineer: t('role.engineer'),
  developer: t('role.developer'),
  'data-engineer': t('role.data-engineer'),
  qa: t('role.qa'),
  'domain-expert': t('role.domain-expert'),
};

export const ARTIFACT_TYPE_MAP: Record<string, string> = {
  crud_spec_card: t('artifactType.crud_spec_card'),
  product_requirement_card: t('artifactType.product_requirement_card'),
  ux_interaction_card: t('artifactType.ux_interaction_card'),
  ddd_applicability_review: t('artifactType.ddd_applicability_review'),
  engineering_plan: t('artifactType.engineering_plan'),
  implementation_record: t('artifactType.implementation_record'),
  qa_test_plan: t('artifactType.qa_test_plan'),
  user_stories: t('artifactType.user_stories'),
  acceptance_criteria: t('artifactType.acceptance_criteria'),
  business_rules: t('artifactType.business_rules'),
  ubiquitous_language: t('artifactType.ubiquitous_language'),
  state_action_matrix: t('artifactType.state_action_matrix'),
  lightweight_domain_model: t('artifactType.lightweight_domain_model'),
  bounded_context: t('artifactType.bounded_context'),
  aggregate_design: t('artifactType.aggregate_design'),
  domain_events: t('artifactType.domain_events'),
  api_contract: t('artifactType.api_contract'),
  ubiquitous_language_code_map: t('artifactType.ubiquitous_language_code_map'),
  technical_architecture: t('artifactType.technical_architecture'),
};

export const PUBLIC_DOCUMENT_TYPES = [
  'ubiquitous_language_code_map',
  'technical_architecture',
];

export const GATE_RESULT_MAP: Record<string, string> = {
  passed: t('gateResult.passed'),
  failed: t('gateResult.failed'),
  warning: t('gateResult.warning'),
  manual_review_required: t('gateResult.manual_review_required'),
};
