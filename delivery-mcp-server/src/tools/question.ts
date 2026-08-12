import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { generateQuestionId } from '../core/ids.js';
import { getQuestions, getStages, getTask, saveQuestions } from '../core/store/task-store.js';
import { setStageStatus } from '../core/store/stage-store.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { nowIso } from '../core/time.js';
import { notifyPerson, notifyRole, nextStepsFooter } from '../core/notify.js';
import { normalizeAssigneeList } from '../core/store/team-store.js';
import { fail, ok, type ToolContext } from './common.js';

/**
 * 待确认问题工具组（PRD 7.9 / 8.8 / 9.13 / 9.14）：
 * question.create（可阻塞阶段）/ question.resolve（解除阻塞）
 */

export function registerQuestionTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'question.create',
    {
      description:
        '创建待确认问题（PRD 7.9 / 9.13）。指定 blocks_stage 时将对应阶段标记为 blocked。',
      inputSchema: {
        task_id: z.string().describe('任务 ID'),
        raised_by: z.string().describe('提出方角色 Agent'),
        assigned_to_role: z.string().describe('负责确认的角色'),
        question: z.string().describe('问题内容'),
        blocks_stage: z.string().optional().describe('阻塞的阶段名（可选）'),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', `任务不存在: ${args.task_id}`);
        const stages = (await getStages(root, args.task_id)) ?? [];

        if (args.blocks_stage && !stages.some((s) => s.stage === args.blocks_stage)) {
          return fail('stage_not_found', `阻塞阶段不存在: ${args.blocks_stage}`);
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
          `任务：${task.title}`,
          `任务ID：${args.task_id}`,
          `需确认角色：${args.assigned_to_role}`,
          `待确认问题（${openForRole.length} 个）：`,
          '',
          ...openForRole.map((x, i) => {
            return `[${i + 1}] ${x.question_id}：${x.question}${x.blocks_stage ? `（阻塞阶段：${x.blocks_stage}）` : ''}`;
          }),
        ];
        const email = await notifyRole(
          root,
          args.assigned_to_role,
          `【任务待确认】${task.title}（${openForRole.length} 个问题）`,
          `${lines.join('\n')}${nextStepsFooter(args.task_id)}`,
          { assignees: normalizeAssigneeList(task.assignees?.[args.assigned_to_role]) },
        );

        return ok({
          question_id: question.question_id,
          status: question.status,
          blocked_stage: args.blocks_stage ?? null,
          email,
        });
      } catch (e) {
        return fail('question_create_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'question.resolve',
    {
      description: '解决待确认问题（PRD 9.14）。该阶段无其他 open 问题时解除 blocked 状态。',
      inputSchema: {
        task_id: z.string().describe('任务 ID'),
        question_id: z.string().describe('问题 ID'),
        answer: z.string().describe('确认答复'),
        resolved_by: z.string().optional().describe('解决人/Agent'),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', `任务不存在: ${args.task_id}`);
        const questions = await getQuestions(root, args.task_id);
        const q = questions.find((x) => x.question_id === args.question_id);
        if (!q) return fail('question_not_found', `问题不存在: ${args.question_id}`);
        if (q.status === 'resolved' || q.status === 'cancelled') {
          return fail('question_closed', `问题已关闭: ${args.question_id} (${q.status})`);
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
          `【问题已解决】${task.title}`,
          [
            `任务：${task.title}`,
            `任务ID：${args.task_id}`,
            `问题ID：${q.question_id}`,
            `问题：${q.question}`,
            `答复：${args.answer}`,
            `解决人：${args.resolved_by ?? '未知'}`,
          ].join('\n') + nextStepsFooter(args.task_id),
          { assignees: normalizeAssigneeList(task.assignees?.[q.raised_by]) },
        );

        // 额外通知解决人本人（resolved_by 为邮箱/姓名/角色时解析；best-effort）
        const resolverEmail = args.resolved_by
          ? await notifyPerson(
              root,
              args.resolved_by,
              `【问题已解决确认】${task.title}`,
              [
                `您确认的问题已记录：`,
                `任务：${task.title}`,
                `任务ID：${args.task_id}`,
                `问题ID：${q.question_id}`,
                `问题：${q.question}`,
                `您的答复：${args.answer}`,
                `阻塞阶段：${q.blocks_stage ?? '无'}`,
              ].join('\n') + nextStepsFooter(args.task_id),
            )
          : undefined;

        return ok({ question_id: q.question_id, status: q.status, email, resolver_email: resolverEmail });
      } catch (e) {
        return fail('question_resolve_failed', (e as Error).message);
      }
    },
  );
}
