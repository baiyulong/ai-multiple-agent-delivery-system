import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectTaskType } from '../../src/core/type-detector.js';

describe('type-detector（PRD 8.2）', () => {
  it('PRD 7.2 例句判定为 crud', () => {
    const r = detectTaskType('维护供应商分类，支持新增、编辑、停用和查询');
    expect(r.task_type).toBe('crud');
    expect(r.confidence).toBeGreaterThan(0.5);
    expect(r.recommended_flow).toContain('product_requirement');
    expect(r.recommended_flow).toContain('qa_validation');
  });

  it('数据维护型描述判定为 crud', () => {
    const r = detectTaskType('标签维护，支持新增、编辑、删除');
    expect(r.task_type).toBe('crud');
  });

  it('含状态流转与业务规则判定为 lightweight_ddd', () => {
    const r = detectTaskType('客户评级规则管理，含状态审批与冻结解冻流转');
    expect(r.task_type).toBe('lightweight_ddd');
    expect(r.recommended_flow).toContain('devops_release');
  });

  it('跨模块复杂流程判定为 full_ddd', () => {
    const r = detectTaskType('采购订单履约流程，跨模块联动库存结算，含审批链和领域事件');
    expect(r.task_type).toBe('full_ddd');
    expect(r.recommended_flow).toContain('business_discovery');
    expect(r.recommended_flow).toContain('devops_release');
  });

  it('分析型描述判定为 analysis', () => {
    const r = detectTaskType('分析这段代码逻辑，排查潜在风险点');
    expect(r.task_type).toBe('analysis');
    expect(r.recommended_flow).toContain('analysis_requirement');
    expect(r.recommended_flow).toContain('analysis_report');
  });

  it('代码审查型描述判定为 analysis', () => {
    const r = detectTaskType('审查核心模块代码，梳理处理逻辑');
    expect(r.task_type).toBe('analysis');
  });

  it('调研评估型描述判定为 analysis', () => {
    const r = detectTaskType('调研现有评估机制，诊断性能瓶颈');
    expect(r.task_type).toBe('analysis');
  });
});