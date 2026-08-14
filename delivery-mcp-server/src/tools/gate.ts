import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadGateRule, runGate } from '../core/gate-engine.js';
import { getArtifact, setArtifactStatus } from '../core/store/artifact-store.js';
import { getStages, getTask } from '../core/store/task-store.js';
import { appendGateRecord } from '../core/store/gate-store.js';
import { setStageStatus } from '../core/store/stage-store.js';
import { generateGateId } from '../core/ids.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { notifyRole, nextStepsFooter } from '../core/notify.js';
import { fail, ok, type ToolContext } from './common.js';
import { t } from '../core/i18n.js';

/**
 * 门禁工具（PRD 7.6 / 8.6 / 9.10）：
 * gate.check 执行结构/必填/空值/禁语/列表数量检查，写门禁记录，联动 artifact/stage 状态（PRD 12.2 / 12.3）。
 */

export function registerGateTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'gate.check',
    {
      description: t('tool.gate.check.description'),
      inputSchema: {
        task_id: z.string().describe(t('tool.gate.check.task_id')),
        stage: z.string().describe(t('tool.gate.check.stage')),
        artifact_id: z.string().describe(t('tool.gate.check.artifact_id')),
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

        const got = await getArtifact(root, args.task_id, args.artifact_id);
        if (!got) return fail('artifact_not_found', t('tool.artifact.get.not_found', { id: args.artifact_id }));
        if (got.metadata.stage !== args.stage) {
          return fail('artifact_stage_mismatch', t('tool.gate.check.artifact_stage_mismatch', { id: args.artifact_id, stage: args.stage }));
        }

        const rule = await loadGateRule(root, got.metadata.artifact_type);
        if (!rule) {
          // 无门禁规则：需要人工审核
          const issue = t('tool.gate.check.no_rule', { type: got.metadata.artifact_type });
          await appendGateRecord(root, args.task_id, args.stage, {
            gate_id: await generateGateId(root),
            task_id: args.task_id,
            stage: args.stage,
            artifact_id: args.artifact_id,
            artifact_type: got.metadata.artifact_type,
            result: 'manual_review_required',
            score: 0,
            missing_sections: [],
            issues: [issue],
            checked_at: new Date().toISOString(),
          });
          // 通知阶段角色（best-effort，不影响主逻辑）
          const email = await notifyRole(
            root,
            stage.role,
            t('email.subject.gate_failed', { title: task.title }),
            [
              t('email.line.task', { title: task.title }),
              t('email.line.task_id', { id: args.task_id }),
              t('email.line.artifact_type', { type: got.metadata.artifact_type }),
              `结果：manual_review_required`,
              `分数：0`,
              t('email.line.issues', { issues: issue }),
            ].join('\n') + nextStepsFooter(args.task_id),
          );
          return ok({
            result: 'manual_review_required',
            score: 0,
            missing_sections: [],
            issues: [issue],
            email,
          });
        }

        const outcome = runGate(got.content, rule);
        const gateId = await generateGateId(root);
        await appendGateRecord(root, args.task_id, args.stage, {
          gate_id: gateId,
          task_id: args.task_id,
          stage: args.stage,
          artifact_id: args.artifact_id,
          artifact_type: got.metadata.artifact_type,
          result: outcome.result,
          score: outcome.score,
          missing_sections: outcome.missing_sections,
          issues: outcome.issues,
          checked_at: new Date().toISOString(),
        });

        // 联动状态（PRD 12.3 返工流程）
        if (outcome.result === 'passed') {
          await setArtifactStatus(root, args.task_id, args.artifact_id, 'validated');
          await setStageStatus(root, args.task_id, args.stage, 'validated', stages);
        } else {
          await setArtifactStatus(root, args.task_id, args.artifact_id, 'needs_revision');
          await setStageStatus(root, args.task_id, args.stage, 'needs_revision', stages);
        }

        // 通知阶段角色（best-effort，不影响主逻辑）
        let email: { sent: boolean; to: string[]; reason?: string } | undefined;
        if (outcome.result !== 'passed') {
          email = await notifyRole(
            root,
            stage.role,
            t('email.subject.gate_failed', { title: task.title }),
            [
              t('email.line.task', { title: task.title }),
              t('email.line.task_id', { id: args.task_id }),
              t('email.line.artifact_type', { type: got.metadata.artifact_type }),
              t('email.line.result', { result: outcome.result }),
              t('email.line.score', { score: outcome.score }),
              t('email.line.issues', { issues: outcome.issues.join('；') || t('email.line.issues_none') }),
            ].join('\n') + nextStepsFooter(args.task_id),
          );
        }

        return ok({
          gate_id: gateId,
          result: outcome.result,
          score: outcome.score,
          missing_sections: outcome.missing_sections,
          issues: outcome.issues,
          artifact_status: outcome.result === 'passed' ? 'validated' : 'needs_revision',
          stage_status: outcome.result === 'passed' ? 'validated' : 'needs_revision',
          email,
        });
      } catch (e) {
        return fail('gate_check_failed', t('tool.gate.check.failed', { msg: (e as Error).message }));
      }
    },
  );
}
