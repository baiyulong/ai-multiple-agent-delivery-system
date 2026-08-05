import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  checkMissingUpstream,
  loadFlowTemplate,
  nextIncompleteStage,
  nextStageDef,
  requiredTypes,
} from '../core/flow-engine.js';
import { getStages, getTask } from '../core/store/task-store.js';
import { setStageStatus } from '../core/store/stage-store.js';
import { getLatestGateRecord } from '../core/store/gate-store.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { fail, ok, type ToolContext } from './common.js';
import type { StageRecord } from '../core/types.js';

/**
 * 阶段工具组（PRD 9.5 / 9.6 / 8.4）：
 * stage.get（含 readiness/缺失上游/指派 Agent）/ stage.complete（四项前置条件）
 */

export function registerStageTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'stage.get',
    {
      description:
        '获取阶段状态与就绪信息：can_start、缺失上游交付物、指派 Agent、阻塞问题（PRD 7.3 / 7.4 / 8.4）。',
      inputSchema: {
        task_id: z.string().describe('任务 ID'),
        stage: z.string().describe('阶段名'),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', `任务不存在: ${args.task_id}`);
        const stages = (await getStages(root, args.task_id)) ?? [];
        const stage = stages.find((s) => s.stage === args.stage);
        if (!stage) {
          return fail('stage_not_found', `阶段不存在: ${args.stage}`, {
            available: stages.map((s) => s.stage),
          });
        }

        const flow = await loadFlowTemplate(root, task.task_type);
        const missingUpstream = flow ? await checkMissingUpstream(root, args.task_id, flow, args.stage) : [];
        const blockingQuestions = (await import('../core/store/task-store.js'))
          .getQuestions(root, args.task_id)
          .then((qs) => qs.filter((q) => q.blocks_stage === args.stage && q.status === 'open'));

        const canStart = missingUpstream.length === 0 && (await blockingQuestions).length === 0;

        return ok({
          stage: stage.stage,
          role: stage.role,
          status: stage.status,
          artifact_id: stage.artifact_id,
          required_artifact_types: requiredTypes(stage),
          can_start: canStart,
          missing_upstream: missingUpstream,
          assigned_agent: missingUpstream[0]?.assigned_agent ?? null,
          suggested_action: canStart ? 'generate_and_submit' : 'call_agent_to_complete_upstream',
          blocking_questions: await blockingQuestions,
        });
      } catch (e) {
        return fail('stage_get_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'stage.complete',
    {
      description:
        '标记阶段完成（PRD 7.7 / 8.4 / 9.6）。前置条件：①必需交付物存在 ②交付物状态 validated ③gate.check 通过 ④无阻塞 open question。完成后推进 current_stage。',
      inputSchema: {
        task_id: z.string().describe('任务 ID'),
        stage: z.string().describe('阶段名'),
        completed_by: z.string().optional().describe('完成人/Agent'),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', `任务不存在: ${args.task_id}`);
        const stages = (await getStages(root, args.task_id)) ?? [];
        const stage = stages.find((s) => s.stage === args.stage);
        if (!stage) return fail('stage_not_found', `阶段不存在: ${args.stage}`);
        if (stage.status === 'completed') return fail('already_completed', `阶段已完成: ${args.stage}`);

        // ① 必需交付物存在且 validated
        const artifacts = await (await import('../core/store/artifact-store.js')).listArtifacts(root, args.task_id);
        const reqTypes = requiredTypes(stage);
        const missing: string[] = [];
        const notValidated: string[] = [];
        for (const t of reqTypes) {
          const match = artifacts.find((a) => a.stage === args.stage && a.artifact_type === t);
          if (!match) missing.push(t);
          else if (match.status !== 'validated') notValidated.push(`${t}(${match.status})`);
        }
        if (missing.length > 0) {
          return fail('artifact_missing', `阶段缺少必需交付物: ${missing.join('、')}`, { missing });
        }
        if (notValidated.length > 0) {
          return fail(
            'artifact_not_validated',
            `交付物未通过门禁: ${notValidated.join('、')}。请先 gate.check。`,
            { not_validated: notValidated },
          );
        }

        // ③ gate.check 通过
        for (const t of reqTypes) {
          const match = artifacts.find((a) => a.stage === args.stage && a.artifact_type === t);
          const rec = await getLatestGateRecord(root, args.task_id, args.stage, match!.artifact_id);
          if (!rec || rec.result !== 'passed') {
            return fail(
              'gate_not_passed',
              `交付物 ${t} 未通过门禁（${rec?.result ?? '无门禁记录'}）。请先 gate.check。`,
            );
          }
        }

        // ④ 无阻塞 open question
        const questions = await (await import('../core/store/task-store.js')).getQuestions(root, args.task_id);
        const blockers = questions.filter((q) => q.blocks_stage === args.stage && q.status === 'open');
        if (blockers.length > 0) {
          return fail(
            'blocked_by_question',
            `存在阻塞本阶段的未解决问题: ${blockers.map((q) => `${q.question_id}: ${q.question}`).join('；')}`,
            { blockers: blockers.map((q) => q.question_id) },
          );
        }

        // 通过：标记完成
        await setStageStatus(root, args.task_id, args.stage, 'completed', stages);

        // 推进 current_stage
        const flow = await loadFlowTemplate(root, task.task_type);
        const next = flow ? await nextIncompleteStage(root, args.task_id, flow) : null;
        const nextDef = next ? nextStageDef(flow!, args.stage) : null;

        task.current_stage = next?.stage ?? null;
        if (!next) task.status = 'completed';
        await (await import('../core/store/task-store.js')).saveTask(root, task);

        return ok({
          stage: args.stage,
          status: 'completed',
          next_stage: next?.stage ?? null,
          next_role: nextDef?.role ?? null,
          task_status: task.status,
          completed_by: args.completed_by ?? null,
        });
      } catch (e) {
        return fail('stage_complete_failed', (e as Error).message);
      }
    },
  );
}

export type { StageRecord };
