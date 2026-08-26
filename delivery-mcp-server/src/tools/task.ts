import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { rm } from 'node:fs/promises';
import { detectTaskType } from '../core/type-detector.js';
import { buildStagesFromFlow, loadFlowTemplate, nextIncompleteStage } from '../core/flow-engine.js';
import { exportDeliveryPackage, exportTaskDocuments } from '../core/exporter.js';
import { getQuestions, getStages, getTask } from '../core/store/task-store.js';
import { listArtifacts } from '../core/store/artifact-store.js';
import { readGateStageFile } from '../core/store/gate-store.js';
import { readContext } from '../core/store/task-store.js';
import { createTask, saveTask } from '../core/store/task-store.js';
import { ok, fail, type ToolContext } from './common.js';
import { resolveDeliveryRoot, taskDir } from '../core/paths.js';
import { dashboardUrl } from '../core/dashboard-url.js';
import { MVP_TASK_TYPES, type TaskType } from '../core/types.js';
import { FLOW_FILE_NAMES } from '../core/flow-engine.js';
import { isTeamConfigured, normalizeAssignees, validateAssignees, findMembersByRole, resolveAssignee } from '../core/store/team-store.js';
import { isUserConfigured } from '../core/store/user-store.js';
import { setStageStatus } from '../core/store/stage-store.js';
import { t } from '../core/i18n.js';

/**
 * 任务工具组（PRD 9.1-9.4 / 9.15）：
 * task.create / task.get / task.detect_type / task.get_flow / task.export_delivery_package
 */

export function registerTaskTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'task.create',
    {
      description: t('tool.task.create.description'),
      inputSchema: {
        title: z.string().describe(t('tool.task.create.title')),
        description: z.string().describe(t('tool.task.create.description.arg')),
        created_by: z.string().optional().describe(t('tool.task.create.created_by')),
        task_type: z
          .enum(['crud', 'lightweight_ddd', 'full_ddd', 'analysis', 'bug_fix'])
          .optional()
          .describe(t('tool.task.create.task_type')),
        assignees: z
          .record(z.string(), z.string().email())
          .optional()
          .describe(t('tool.task.create.assignees')),
        skip_stages: z
          .array(z.string())
          .optional()
          .describe(t('tool.task.create.skip_stages')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        // 首次使用强制校验：需先配置当前人（user.set）与团队名册（team.set）
        const [userConfigured, teamConfigured] = await Promise.all([
          isUserConfigured(),
          isTeamConfigured(root),
        ]);
        if (!userConfigured || !teamConfigured) {
          const missing: string[] = [];
          if (!userConfigured) missing.push(t('tool.task.create.need_user'));
          if (!teamConfigured) missing.push(t('tool.task.create.need_team'));
          return fail(
            'config_required',
            t('tool.task.create.config_required', { missing: missing.join('、') }),
          );
        }
        let taskType = args.task_type as TaskType | undefined;
        if (!taskType) {
          taskType = detectTaskType(args.description).task_type;
        }
        if (!(MVP_TASK_TYPES as readonly string[]).includes(taskType)) {
          return fail('unsupported_task_type', t('tool.task.create.unsupported_type', { types: MVP_TASK_TYPES.join(' / ') }), { task_type: taskType });
        }
        const flow = await loadFlowTemplate(root, taskType);
        if (!flow) return fail('flow_not_found', t('tool.task.create.flow_not_found', { type: taskType }));

        const assignees = normalizeAssignees(args.assignees);
        const invalid = await validateAssignees(root, assignees);
        if (invalid.length > 0) {
          return fail('invalid_assignee', t('tool.task.create.invalid_assignee', { details: invalid.map((i) => `${i.role}=${i.email}(${i.reason})${i.hint ? `；${i.hint}` : ''}`).join('、') }), { invalid });
        }

        const task = await createTask(root, {
          title: args.title,
          description: args.description,
          createdBy: args.created_by ?? 'unknown',
          taskType,
          stages: buildStagesFromFlow(flow),
          assignees,
        });

        // skip_stages：校验每个阶段必须存在于流程模板，并将其标记为 skipped
        const skippedStages: string[] = [];
        if (args.skip_stages && args.skip_stages.length > 0) {
          const unknown = args.skip_stages.filter((name) => !flow.flow.some((s) => s.stage === name));
          if (unknown.length > 0) {
            return fail('unknown_stage', t('tool.task.create.unknown_stage', { stages: unknown.join('、') }), { unknown_stages: unknown });
          }
          for (const name of args.skip_stages) {
            await setStageStatus(root, task.task_id, name, 'skipped');
            skippedStages.push(name);
          }
        }

        // 自动生成任务文档快照（md + html，best-effort），返回完整路径便于查看/传阅
        const documents = await exportTaskDocuments(root, task.task_id).catch(() => null);

        // 当前首个待处理阶段的角色负责人：未固化时返回候选成员，
        // 供 AI 立即询问用户选择后调用 task.assign 固化（后续角色在各自阶段完成时再询问）
        const firstStage = flow ? await nextIncompleteStage(root, task.task_id, flow) : null;
        const firstRole = firstStage?.role ?? null;
        const firstAssignee = firstRole ? await resolveAssignee(root, task.assignees, firstRole) : null;
        const firstAssignmentRequired = Boolean(firstRole && !firstAssignee);
        const firstCandidates = firstAssignmentRequired
          ? (await findMembersByRole(root, firstRole!)).map((m) => ({ name: m.name, email: m.email }))
          : null;

        return ok({
          task_id: task.task_id,
          status: task.status,
          current_stage: task.current_stage,
          task_path: `tasks/${task.task_id}`,
          task_type: task.task_type,
          assignees: task.assignees ?? null,
          skipped_stages: skippedStages,
          documents,
          document_hint: documents?.hint ?? null,
          current_stage_role: firstRole,
          current_role_assignee: firstAssignee,
          current_role_assignment_required: firstAssignmentRequired,
          current_role_candidates: firstCandidates,
          current_role_assignment_hint: firstAssignmentRequired
            ? t('tool.task.create.assignment_hint', {
                stage: firstStage!.stage,
                role: firstRole!,
                candidates: firstCandidates!.map((m) => `${m.name}(${m.email})`).join('、'),
              })
            : null,
          dashboard_url: dashboardUrl(),
          view_hint: t('tool.task.create.view_hint', { url: dashboardUrl() }),
          dashboard_hint: t('tool.dashboard.hint.commands'),
        });
      } catch (e) {
        return fail('create_failed', t('tool.task.create.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'task.assign',
    {
      description: t('tool.task.assign.description'),
      inputSchema: {
        task_id: z.string().describe(t('tool.task.assign.task_id')),
        role: z.string().describe(t('tool.task.assign.role')),
        email: z.string().email().describe(t('tool.task.assign.email')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', t('error.task_not_found', { id: args.task_id }));

        const invalid = await validateAssignees(root, { [args.role]: args.email });
        if (invalid.length > 0) {
          return fail('invalid_assignee', t('tool.task.assign.invalid_assignee', { details: invalid.map((i) => `${i.role}=${i.email}(${i.reason})${i.hint ? `；${i.hint}` : ''}`).join('、') }), { invalid });
        }

        task.assignees = { ...(task.assignees ?? {}), [args.role]: args.email };
        await saveTask(root, task);

        return ok({
          task_id: task.task_id,
          assignees: task.assignees,
          assigned: { role: args.role, email: args.email },
        });
      } catch (e) {
        return fail('assign_failed', t('tool.task.assign.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'task.role_candidates',
    {
      description: t('tool.task.role_candidates.description'),
      inputSchema: {
        task_id: z.string().describe(t('tool.task.role_candidates.task_id')),
        role: z.string().describe(t('tool.task.role_candidates.role')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', t('error.task_not_found', { id: args.task_id }));

        const candidates = await findMembersByRole(root, args.role);
        const assignee = await resolveAssignee(root, task.assignees, args.role);

        return ok({
          task_id: task.task_id,
          role: args.role,
          current_assignee: assignee,
          candidates: candidates.map((m) => ({ name: m.name, email: m.email })),
          hint: assignee
            ? t('tool.task.role_candidates.hint_assigned', { role: args.role, name: assignee.name, email: assignee.email })
            : t('tool.task.role_candidates.hint_unassigned', { role: args.role }),
        });
      } catch (e) {
        return fail('role_candidates_failed', t('tool.task.role_candidates.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'task.get',
    {
      description: t('tool.task.get.description'),
      inputSchema: { task_id: z.string().describe(t('tool.task.get.task_id')) },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', t('error.task_not_found', { id: args.task_id }));
        const [stages, artifacts, openQuestions] = await Promise.all([
          getStages(root, args.task_id),
          listArtifacts(root, args.task_id),
          getQuestions(root, args.task_id),
        ]);
        return ok({
          task,
          stages: stages ?? [],
          artifacts,
          open_questions: openQuestions.filter((q) => q.status === 'open' || q.status === 'answered'),
        });
      } catch (e) {
        return fail('get_failed', t('tool.task.get.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'task.delete',
    {
      description: t('tool.task.delete.description'),
      inputSchema: {
        task_id: z.string().describe(t('tool.task.delete.task_id')),
        confirmed_by: z
          .boolean()
          .describe(t('tool.task.delete.confirmed_by')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', t('error.task_not_found', { id: args.task_id }));
        if (args.confirmed_by !== true) {
          return fail('confirmation_required', t('tool.task.delete.confirmation_required'));
        }

        const dir = taskDir(root, args.task_id);
        await rm(dir, { recursive: true, force: true });
        return ok({
          task_id: args.task_id,
          status: 'deleted',
          deleted_path: `tasks/${args.task_id}`,
          hint: t('tool.task.delete.hint'),
        });
      } catch (e) {
        return fail('delete_failed', t('tool.task.delete.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'task.detect_type',
    {
      description: t('tool.task.detect_type.description'),
      inputSchema: {
        task_description: z.string().describe(t('tool.task.detect_type.task_description')),
        context: z.record(z.unknown()).optional().describe(t('tool.task.detect_type.context')),
      },
    },
    async (args) => {
      try {
        return ok(detectTaskType(args.task_description));
      } catch (e) {
        return fail('detect_failed', t('tool.task.detect_type.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'task.get_flow',
    {
      description: t('tool.task.get_flow.description'),
      inputSchema: {
        task_type: z.enum(['crud', 'lightweight_ddd', 'full_ddd', 'analysis', 'bug_fix']).describe(t('tool.task.get_flow.task_type')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const flow = await loadFlowTemplate(root, args.task_type);
        if (!flow) return fail('flow_not_found', t('tool.task.get_flow.flow_not_found', { type: args.task_type }));
        return ok(flow);
      } catch (e) {
        return fail('get_flow_failed', t('tool.task.get_flow.failed', { msg: (e as Error).message }));
      }
    },
  );
  server.registerTool(
    'task.export_delivery_package',
    {
      description: t('tool.task.export_delivery_package.description'),
      inputSchema: {
        task_id: z.string().describe(t('tool.task.export_delivery_package.task_id')),
        format: z
          .enum(['md', 'html', 'both'])
          .optional()
          .describe(t('tool.task.export_delivery_package.format')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', t('error.task_not_found', { id: args.task_id }));

        const stages = (await getStages(root, args.task_id)) ?? [];
        const incomplete = stages.filter((s) => s.status !== 'completed' && s.status !== 'skipped');
        if (incomplete.length > 0) {
          return fail(
            'stages_incomplete',
            t('tool.task.export_delivery_package.stages_incomplete', { stages: incomplete.map((s) => `${s.stage}(${s.status})`).join('、') }),
            { incomplete_stages: incomplete.map((s) => s.stage) },
          );
        }

        const artifacts = await listArtifacts(root, args.task_id);
        const gateRecords: Array<{ stage: string; record: NonNullable<Awaited<ReturnType<typeof readGateStageFile>>['checks'][string]> }> = [];
        for (const stage of stages) {
          const file = await readGateStageFile(root, args.task_id, stage.stage);
          for (const artifactId of Object.keys(file.checks)) {
            gateRecords.push({ stage: stage.stage, record: file.checks[artifactId]! });
          }
        }
        const questions = await getQuestions(root, args.task_id);
        const contextMd = await readContext(root, args.task_id);

        const formats = args.format === 'both' ? ['md', 'html'] : [args.format ?? 'md'];
        const result = await exportDeliveryPackage(root, args.task_id, {
          task,
          stages,
          artifacts,
          gateRecords,
          questions,
          contextMd,
        }, { formats: formats as Array<'md' | 'html'> });

        return ok({
          paths: result.paths.map((p) => `tasks/${args.task_id}/${p}`),
          path: result.paths[0] ? `tasks/${args.task_id}/${result.paths[0]}` : null,
          status: result.status,
          document_hint:
            result.paths.length > 0
              ? t('tool.task.export_delivery_package.document_hint', { paths: result.paths.map((p) => `tasks/${args.task_id}/${p}`).join('、') })
              : null,
        });
      } catch (e) {
        return fail('export_failed', t('tool.task.export_delivery_package.failed', { msg: (e as Error).message }));
      }
    },
  );
}

export { FLOW_FILE_NAMES };
