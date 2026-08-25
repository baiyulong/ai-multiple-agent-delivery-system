import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { generateQuestionId } from '../core/ids.js';
import { getQuestions, getStages, getTask, saveQuestions } from '../core/store/task-store.js';
import { setStageStatus } from '../core/store/stage-store.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { nowIso } from '../core/time.js';
import { notifyPerson, notifyRole, nextStepsFooter } from '../core/notify.js';
import { exportTaskDocuments } from '../core/exporter.js';
import { normalizeAssignee } from '../core/store/team-store.js';
import { fail, ok, type ToolContext } from './common.js';
import { t } from '../core/i18n.js';

/**
 * 待确认问题工具组（PRD 7.9 / 8.8 / 9.13 / 9.14）：
 * question.create（可阻塞阶段）/ question.resolve（解除阻塞）
 */

export function registerQuestionTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'question.create',
    {
      description: t('tool.question.create.description'),
      inputSchema: {
        task_id: z.string().describe(t('tool.question.create.task_id')),
        raised_by: z.string().describe(t('tool.question.create.raised_by')),
        assigned_to_role: z.string().describe(t('tool.question.create.assigned_to_role')),
        question: z.string().describe(t('tool.question.create.question')),
        blocks_stage: z.string().optional().describe(t('tool.question.create.blocks_stage')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', t('error.task_not_found', { id: args.task_id }));
        const stages = (await getStages(root, args.task_id)) ?? [];

        if (args.blocks_stage && !stages.some((s) => s.stage === args.blocks_stage)) {
          return fail('stage_not_found', t('tool.question.create.stage_not_found', { stage: args.blocks_stage }));
        }

        const now = nowIso();
        const question = {
          question_id: await generateQuestionId(root),
          task_id: args.task_id,
          raised_by: args.raised_by,
          assigned_to_role: args.assigned_to_role,
          question: args.question,
          blocks_stage: args.blocks_stage ?? null,
          status: 'open' as const,
          created_at: now,
          updated_at: now,
        };
        const questions = await getQuestions(root, args.task_id);
        questions.push(question);
        await saveQuestions(root, args.task_id, questions);

        // 阻塞对应阶段（PRD 7.9）
        if (args.blocks_stage) {
          await setStageStatus(root, args.task_id, args.blocks_stage, 'blocked', stages);
        }

        // 通知负责确认的角色（best-effort，不影响主逻辑）
        // 合并该任务下指派给同一角色的全部 open 问题为一封邮件，避免一个问题一封
        const openForRole = questions.filter(
          (x) => x.assigned_to_role === args.assigned_to_role && (x.status === 'open' || x.status === 'answered'),
        );
        const lines = [
          t('email.line.task', { title: task.title }),
          t('email.line.task_id', { id: args.task_id }),
          t('email.line.question_role', { role: args.assigned_to_role }),
          t('email.line.open_questions', { count: openForRole.length }),
          '',
          ...openForRole.map((x, i) => {
            return t('email.line.question_item', {
              i: i + 1,
              id: x.question_id,
              question: x.question,
              blocked: x.blocks_stage ? t('email.line.blocked_stage', { stage: x.blocks_stage }) : '',
            });
          }),
        ];

        // 等待补充问题时自动生成文档快照（best-effort），邮件正文附相对路径便于查看
        const documents = await exportTaskDocuments(root, args.task_id).catch(() => null);
        const docHint =
          documents && documents.rel_paths.length > 0
            ? t('email.doc_hint', { paths: documents.rel_paths.join('\n          ') })
            : '';

        const email = await notifyRole(
          root,
          args.assigned_to_role,
          t('email.subject.question_pending', { title: task.title, count: openForRole.length }),
          `${lines.join('\n')}${docHint}${nextStepsFooter(args.task_id)}`,
          { assignees: normalizeAssignee(task.assignees?.[args.assigned_to_role]) ? [normalizeAssignee(task.assignees?.[args.assigned_to_role])!] : [] },
        );

        return ok({
          question_id: question.question_id,
          status: question.status,
          blocked_stage: args.blocks_stage ?? null,
          documents,
          document_hint: documents?.hint ?? null,
          email,
        });
      } catch (e) {
        return fail('question_create_failed', t('tool.question.create.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'question.resolve',
    {
      description: t('tool.question.resolve.description'),
      inputSchema: {
        task_id: z.string().describe(t('tool.question.resolve.task_id')),
        question_id: z.string().describe(t('tool.question.resolve.question_id')),
        answer: z.string().describe(t('tool.question.resolve.answer')),
        resolved_by: z.string().optional().describe(t('tool.question.resolve.resolved_by')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', t('error.task_not_found', { id: args.task_id }));
        const questions = await getQuestions(root, args.task_id);
        const q = questions.find((x) => x.question_id === args.question_id);
        if (!q) return fail('question_not_found', t('tool.question.resolve.not_found', { id: args.question_id }));
        if (q.status === 'resolved' || q.status === 'cancelled') {
          return fail('question_closed', t('tool.question.resolve.closed', { id: args.question_id, status: q.status }));
        }

        const now = nowIso();
        q.status = 'resolved';
        q.answer = args.answer;
        q.resolved_by = args.resolved_by;
        q.updated_at = now;
        await saveQuestions(root, args.task_id, questions);

        // 解除阶段阻塞（若无其他 open 问题阻塞该阶段）
        if (q.blocks_stage) {
          const stillBlocked = questions.some(
            (x) => x.blocks_stage === q.blocks_stage && x.status === 'open',
          );
          if (!stillBlocked) {
            const stages = (await getStages(root, args.task_id)) ?? [];
            const stage = stages.find((s) => s.stage === q.blocks_stage);
            if (stage && stage.status === 'blocked') {
              await setStageStatus(root, args.task_id, q.blocks_stage, 'in_progress', stages);
            }
          }
        }

        // 通知提出方（best-effort，不影响主逻辑）
        const email = await notifyRole(
          root,
          q.raised_by,
          t('email.subject.question_resolved', { title: task.title }),
          [
            t('email.line.task', { title: task.title }),
            t('email.line.task_id', { id: args.task_id }),
            t('email.line.question_id', { id: q.question_id }),
            t('email.line.question', { q: q.question }),
            t('email.line.answer', { answer: args.answer }),
            t('email.line.resolved_by', { by: args.resolved_by ?? t('email.line.resolved_by_unknown') }),
          ].join('\n') + nextStepsFooter(args.task_id),
          { assignees: normalizeAssignee(task.assignees?.[q.raised_by]) ? [normalizeAssignee(task.assignees?.[q.raised_by])!] : [] },
        );

        // 额外通知解决人本人（resolved_by 为邮箱/姓名/角色时解析；best-effort）
        const resolverEmail = args.resolved_by
          ? await notifyPerson(
              root,
              args.resolved_by,
              t('email.subject.question_resolved_confirm', { title: task.title }),
              [
                t('email.line.confirmed_recorded'),
                t('email.line.task', { title: task.title }),
                t('email.line.task_id', { id: args.task_id }),
                t('email.line.question_id', { id: q.question_id }),
                t('email.line.question', { q: q.question }),
                t('email.line.your_answer', { answer: args.answer }),
                t('email.line.blocked_stage_value', { stage: q.blocks_stage ?? t('email.line.blocked_stage_none') }),
              ].join('\n') + nextStepsFooter(args.task_id),
            )
          : undefined;

        return ok({ question_id: q.question_id, status: q.status, email, resolver_email: resolverEmail });
      } catch (e) {
        return fail('question_resolve_failed', t('tool.question.resolve.failed', { msg: (e as Error).message }));
      }
    },
  );
}
