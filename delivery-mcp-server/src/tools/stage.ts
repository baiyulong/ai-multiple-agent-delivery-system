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
import { findMembersByRole, resolveAssignee } from '../core/store/team-store.js';
import { getLatestGateRecord } from '../core/store/gate-store.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { dashboardUrl } from '../core/dashboard-url.js';
import { notifyRole, nextStepsFooter } from '../core/notify.js';
import { exportTaskDocuments } from '../core/exporter.js';
import { fail, ok, type ToolContext } from './common.js';
import { t } from '../core/i18n.js';
import type { StageRecord } from '../core/types.js';

/**
 * 阶段工具组（PRD 9.5 / 9.6 / 8.4）：
 * stage.get（含 readiness/缺失上游/指派 Agent）/ stage.complete（四项前置条件）
 */

export function registerStageTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'stage.get',
    {
      description: t('tool.stage.get.description'),
      inputSchema: {
        task_id: z.string().describe(t('tool.stage.get.task_id')),
        stage: z.string().describe(t('tool.stage.get.stage')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', t('error.task_not_found', { id: args.task_id }));
        const stages = (await getStages(root, args.task_id)) ?? [];
        const stage = stages.find((s) => s.stage === args.stage);
        if (!stage) {
          return fail('stage_not_found', t('tool.stage.get.stage_not_found', { stage: args.stage }), {
            available: stages.map((s) => s.stage),
          });
        }

        const flow = await loadFlowTemplate(root, task.task_type);
        const missingUpstream = flow ? await checkMissingUpstream(root, args.task_id, flow, args.stage) : [];
        const blockingQuestions = (await import('../core/store/task-store.js'))
          .getQuestions(root, args.task_id)
          .then((qs) => qs.filter((q) => q.blocks_stage === args.stage && q.status === 'open'));

        const canStart = missingUpstream.length === 0 && (await blockingQuestions).length === 0;

        const assignee = await resolveAssignee(root, task.assignees, stage.role);
        const candidates = assignee
          ? null
          : (await findMembersByRole(root, stage.role)).map((m) => ({ name: m.name, email: m.email }));

        return ok({
          stage: stage.stage,
          role: stage.role,
          status: stage.status,
          artifact_id: stage.artifact_id,
          required_artifact_types: requiredTypes(stage),
          can_start: canStart,
          missing_upstream: missingUpstream,
          assigned_agent: missingUpstream[0]?.assigned_agent ?? null,
          assignee,
          candidates,
          assignment_required: !assignee,
          suggested_action: canStart ? 'generate_and_submit' : 'call_agent_to_complete_upstream',
          blocking_questions: await blockingQuestions,
        });
      } catch (e) {
        return fail('stage_get_failed', t('tool.stage.get.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'stage.complete',
    {
      description: t('tool.stage.complete.description'),
      inputSchema: {
        task_id: z.string().describe(t('tool.stage.complete.task_id')),
        stage: z.string().describe(t('tool.stage.complete.stage')),
        confirmed_by: z.string().min(1).describe(t('tool.stage.complete.confirmed_by')),
        completed_by: z.string().optional().describe(t('tool.stage.complete.completed_by')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', t('error.task_not_found', { id: args.task_id }));
        const stages = (await getStages(root, args.task_id)) ?? [];
        const stage = stages.find((s) => s.stage === args.stage);
        if (!stage) return fail('stage_not_found', t('error.stage_not_found', { stage: args.stage }));
        if (stage.status === 'completed') return fail('already_completed', t('tool.stage.complete.already_completed', { stage: args.stage }));

        // ① 必需交付物存在且 validated
        const artifacts = await (await import('../core/store/artifact-store.js')).listArtifacts(root, args.task_id);
        const reqTypes = requiredTypes(stage);
        const missing: string[] = [];
        const notValidated: string[] = [];
        for (const reqType of reqTypes) {
          const match = artifacts.find((a) => a.stage === args.stage && a.artifact_type === reqType);
          if (!match) missing.push(reqType);
          else if (match.status !== 'validated') notValidated.push(`${reqType}(${match.status})`);
        }
        if (missing.length > 0) {
          return fail('artifact_missing', t('tool.stage.complete.artifact_missing', { missing: missing.join('、') }), { missing });
        }
        if (notValidated.length > 0) {
          return fail(
            'artifact_not_validated',
            t('tool.stage.complete.artifact_not_validated', { items: notValidated.join('、') }),
            { not_validated: notValidated },
          );
        }

        // ③ gate.check 通过
        for (const reqType of reqTypes) {
          const match = artifacts.find((a) => a.stage === args.stage && a.artifact_type === reqType);
          const rec = await getLatestGateRecord(root, args.task_id, args.stage, match!.artifact_id);
          if (!rec || rec.result !== 'passed') {
            return fail(
              'gate_not_passed',
              t('tool.stage.complete.gate_not_passed', { type: reqType, result: rec?.result ?? t('tool.stage.complete.no_gate_record') }),
            );
          }
        }

        // ④ 任务内不存在任何 open 阻塞问题（任何阶段只要有 open 阻塞问题，任何角色都不能标记完成）
        const questions = await (await import('../core/store/task-store.js')).getQuestions(root, args.task_id);
        const blockers = questions.filter((q) => q.blocks_stage && q.status === 'open');
        if (blockers.length > 0) {
          const blockedStages = [...new Set(blockers.map((q) => q.blocks_stage as string))].join('、');
          return fail(
            'blocked_by_question',
            t('tool.stage.complete.blocked_by_question', {
              stages: blockedStages,
              questions: blockers.map((q) => `${q.question_id}: ${q.question}`).join('；'),
            }),
            { blockers: blockers.map((q) => q.question_id), blocked_stages: blockedStages },
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

        // 阶段完成（需下一角色处理）时自动生成文档快照，返回相对路径便于查看/传阅
        const documents = await exportTaskDocuments(root, args.task_id).catch(() => null);
        const docHint =
          documents && documents.rel_paths.length > 0
            ? t('email.doc_hint', { paths: documents.rel_paths.join('\n          ') })
            : '';

        // 通知下一阶段角色（best-effort，不影响主逻辑）
        const nextAssignee = nextDef ? await resolveAssignee(root, task.assignees, nextDef.role) : null;
        let email: { sent: boolean; to: string[]; reason?: string } | undefined;
        if (nextDef?.role) {
          email = await notifyRole(
            root,
            nextDef.role,
            t('email.subject.stage_complete', { title: task.title }),
            [
              t('email.line.task', { title: task.title }),
              t('email.line.task_id', { id: args.task_id }),
              t('email.line.completed_stage', { stage: args.stage }),
              t('email.line.next_stage', { stage: next?.stage ?? t('email.line.next_stage_none') }),
              t('email.line.next_role', { role: nextDef.role }),
            ].join('\n') + docHint + nextStepsFooter(args.task_id),
            { assignees: nextAssignee ? [nextAssignee.email] : [] },
          );
        }

        // 下一阶段角色负责人：未固化时返回候选成员，供 AI 询问用户选择后调用 task.assign 固化
        const assignmentRequired = Boolean(nextDef && next?.stage && !nextAssignee);
        const nextCandidates = assignmentRequired
          ? (await findMembersByRole(root, nextDef!.role)).map((m) => ({ name: m.name, email: m.email }))
          : null;

        return ok({
          stage: args.stage,
          status: 'completed',
          next_stage: next?.stage ?? null,
          next_role: nextDef?.role ?? null,
          next_role_assignee: nextAssignee,
          next_role_assignment_required: assignmentRequired,
          next_role_candidates: nextCandidates,
          next_role_assignment_hint: assignmentRequired
            ? t('tool.stage.complete.assignment_hint', {
                stage: next!.stage,
                role: nextDef!.role,
                candidates: nextCandidates!.map((m) => `${m.name}(${m.email})`).join('、'),
              })
            : null,
          task_status: task.status,
          completed_by: args.completed_by ?? null,
          confirmed_by: args.confirmed_by,
          documents,
          document_hint: documents?.hint ?? null,
          dashboard_url: dashboardUrl(args.task_id),
          view_hint: t('tool.stage.complete.view_hint', { url: dashboardUrl(args.task_id) }),
          email,
        });
      } catch (e) {
        return fail('stage_complete_failed', t('tool.stage.complete.failed', { msg: (e as Error).message }));
      }
    },
  );
}

export type { StageRecord };
