import { join } from 'node:path';
import { readJsonSync } from './fsx-sync.js';
import { builtinFlowsDir } from './locate.js';
import { FLOW_FILE_NAMES } from './flow-engine.js';
import type { TypeDetection, TaskType } from './types.js';

/**
 * 任务类型识别（PRD 8.2）：MVP 规则判断。
 * 规则：
 * - full_ddd：命中流程/履约/结算/库存/订单/审批链/领域事件/跨模块联动 等高复杂度信号
 * - lightweight_ddd：命中状态/审批/启用/停用/冻结/评级/规则，但不涉及复杂跨上下文
 * - crud：命中维护/字典/分类/标签/参数/新增/编辑/删除/查询，且缺少复杂状态流转
 */

const FULL_DDD_SIGNALS = ['流程', '履约', '结算', '库存', '订单', '审批链', '领域事件', '跨模块联动', '跨上下文'];
const LIGHT_DDD_SIGNALS = ['状态', '审批', '启用', '停用', '冻结', '评级', '规则', '流转'];
const CRUD_SIGNALS = ['维护', '字典', '分类', '标签', '参数', '新增', '编辑', '删除', '查询'];
const ANALYSIS_SIGNALS = ['分析', '审查', 'review', '审计', '排查', '诊断', '梳理', '理解', '研究', '调研', '评估', 'code review', '代码审查'];

function countHits(text: string, signals: string[]): number {
  return signals.filter((s) => text.includes(s)).length;
}

export function detectTaskType(description: string): TypeDetection {
  const text = description ?? '';
  const fullHits = countHits(text, FULL_DDD_SIGNALS);
  const lightHits = countHits(text, LIGHT_DDD_SIGNALS);
  const crudHits = countHits(text, CRUD_SIGNALS);

  let taskType: TaskType;
  let reason: string;
  let confidence: number;

  const analysisHits = countHits(text, ANALYSIS_SIGNALS);

  if (fullHits > 0) {
    taskType = 'full_ddd';
    reason = `命中完整 DDD 信号词（如${FULL_DDD_SIGNALS.filter((s) => text.includes(s)).join('、')}），涉及复杂业务规则/跨上下文协作`;
    confidence = Math.min(0.95, 0.6 + fullHits * 0.1);
  } else if (lightHits > 0 && crudHits <= lightHits) {
    taskType = 'lightweight_ddd';
    reason = `命中轻量 DDD 信号词（如${LIGHT_DDD_SIGNALS.filter((s) => text.includes(s)).join('、')}），存在状态流转或业务规则`;
    confidence = Math.min(0.9, 0.55 + lightHits * 0.08);
  } else if (crudHits > 0) {
    taskType = 'crud';
    reason = `主要是数据维护操作（如${CRUD_SIGNALS.filter((s) => text.includes(s)).join('、')}），没有明显复杂业务规则或状态流转`;
    confidence = Math.min(0.9, 0.5 + crudHits * 0.07);
  } else if (analysisHits > 0) {
    taskType = 'analysis';
    reason = `命中分析信号词（如${ANALYSIS_SIGNALS.filter((s) => text.includes(s)).join('、')}），属于代码/逻辑分析任务`;
    confidence = Math.min(0.85, 0.55 + analysisHits * 0.1);
  } else {
    taskType = 'crud';
    reason = '未识别到明显特征，按简单 CRUD 默认处理';
    confidence = 0.4;
  }

  confidence = Math.round(confidence * 100) / 100;

  const recommendedFlow = FLOW_FILE_NAMES[taskType]
    ? loadFlowStageNames(taskType)
    : [];

  return { task_type: taskType, confidence, reason, recommended_flow: recommendedFlow };
}

/** 读取流程模板的阶段名列表（与 task.get_flow 保持一致） */
function loadFlowStageNames(taskType: TaskType): string[] {
  const file = join(builtinFlowsDir(), FLOW_FILE_NAMES[taskType]);
  const flow = readJsonSync<{ flow: Array<{ stage: string }> }>(file);
  return flow?.flow.map((s) => s.stage) ?? [];
}
