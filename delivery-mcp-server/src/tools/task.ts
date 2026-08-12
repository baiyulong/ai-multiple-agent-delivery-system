import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { rm } from 'node:fs/promises';
import { detectTaskType } from '../core/type-detector.js';
import { buildStagesFromFlow, loadFlowTemplate } from '../core/flow-engine.js';
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
import { isTeamConfigured, normalizeAssignees, normalizeAssigneeList, validateAssignees } from '../core/store/team-store.js';
import { isUserConfigured } from '../core/store/user-store.js';
import { setStageStatus } from '../core/store/stage-store.js';

/**
 * 任务工具组（PRD 9.1-9.4 / 9.15）：
 * task.create / task.get / task.detect_type / task.get_flow / task.export_delivery_package
 */

export function registerTaskTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'task.create',
    {
      description: '创建 AI 交付任务：初始化 task.json/stages.json/context.md/questions.json/artifacts/ 等全套文件（PRD 7.1 / 8.1.1）。未指定 task_type 时自动识别。',
      inputSchema: {
        title: z.string().describe('任务标题'),
        description: z.string().describe('任务描述（用于识别任务类型）'),
        created_by: z.string().optional().describe('创建人'),
        task_type: z
          .enum(['crud', 'lightweight_ddd', 'full_ddd', 'analysis', 'bug_fix'])
          .optional()
          .describe('任务类型（缺省自动识别）：crud / lightweight_ddd / full_ddd / analysis / bug_fix'),
        assignees: z
          .record(z.string(), z.union([z.string().email(), z.array(z.string().email())]))
          .optional()
          .describe('任务级指派：role -> 成员邮箱（可单个或数组，一个角色可指派多人，可选）'),
        skip_stages: z
          .array(z.string())
          .optional()
          .describe('不需要执行的阶段名列表（可选），这些阶段将标记为 skipped 并跳过'),
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
          if (!userConfigured) missing.push('user.set（当前操作人姓名/邮箱）');
          if (!teamConfigured) missing.push('team.set（团队名册，至少一名成员）');
          return fail(
            'config_required',
            `首次使用需先完成配置：${missing.join('、')}。请先调用对应工具配置后再创建任务。`,
          );
        }
        let taskType = args.task_type as TaskType | undefined;
        if (!taskType) {
          taskType = detectTaskType(args.description).task_type;
        }
        if (!(MVP_TASK_TYPES as readonly string[]).includes(taskType)) {
          return fail('unsupported_task_type', `MVP 仅支持 ${MVP_TASK_TYPES.join(' / ')}`, { task_type: taskType });
        }
        const flow = await loadFlowTemplate(root, taskType);
        if (!flow) return fail('flow_not_found', `未找到流程模板: ${taskType}`);

        const assignees = normalizeAssignees(args.assignees);
        const invalid = await validateAssignees(root, assignees);
        if (invalid.length > 0) {
          return fail('invalid_assignee', `指派无效: ${invalid.map((i) => `${i.role}=${i.email}(${i.reason})`).join('、')}`, { invalid });
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
            return fail('unknown_stage', `未知阶段: ${unknown.join('、')}`, { unknown_stages: unknown });
          }
          for (const name of args.skip_stages) {
            await setStageStatus(root, task.task_id, name, 'skipped');
            skippedStages.push(name);
          }
        }

        // 自动生成任务文档快照（md + html，best-effort），返回完整路径便于查看/传阅
        const documents = await exportTaskDocuments(root, task.task_id).catch(() => null);

        return ok({
          task_id: task.task_id,
          status: task.status,
          current_stage: task.current_stage,
          task_path: `tasks/${task.task_id}`,
          task_type: task.task_type,
          assignees: task.assignees ?? null,
          skipped_stages: skippedStages,
          documents,
          dashboard_url: dashboardUrl(),
          view_hint: `新任务已创建，可在浏览器查看: ${dashboardUrl()}`,
        });
      } catch (e) {
        return fail('create_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'task.assign',
    {
      description:
        '为任务某角色追加指派成员（role -> 成员邮箱，一个角色可指派多人；重复添加会去重）。用于在后续流程中指定/补派，如 task.create 未指定或需要多人时。',
      inputSchema: {
        task_id: z.string().describe('任务 ID'),
        role: z.string().describe('角色 key，如 engineer/qa/product-manager'),
        email: z.string().email().describe('成员邮箱'),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', `任务不存在: ${args.task_id}`);

        const invalid = await validateAssignees(root, { [args.role]: args.email });
        if (invalid.length > 0) {
          return fail('invalid_assignee', `指派无效: ${invalid.map((i) => `${i.role}=${i.email}(${i.reason})`).join('、')}`, { invalid });
        }

        const current = normalizeAssigneeList(task.assignees?.[args.role]);
        const merged = [...new Set([...current, args.email])];
        task.assignees = { ...(task.assignees ?? {}), [args.role]: merged };
        await saveTask(root, task);

        return ok({
          task_id: task.task_id,
          assignees: task.assignees,
          assigned: { role: args.role, emails: merged },
        });
      } catch (e) {
        return fail('assign_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'task.get',
    {
      description: '获取任务详情：基本信息、阶段、交付物摘要、待确认问题（PRD 8.1.2 / 9.2）。',
      inputSchema: { task_id: z.string().describe('任务 ID') },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', `任务不存在: ${args.task_id}`);
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
        return fail('get_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'task.delete',
    {
      description:
        '删除任务（PRD 8.1.2 扩展）：永久删除 tasks/{task_id}/ 目录（task.json/stages.json/context.md/questions.json/artifacts/gates/delivery_package），不可恢复。必须显式确认 confirmed_by=true 才会删除，防止误删。',
      inputSchema: {
        task_id: z.string().describe('任务 ID'),
        confirmed_by: z
          .boolean()
          .describe('确认删除（必须为 true，防止误删）。删除不可恢复，请先与用户确认。'),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', `任务不存在: ${args.task_id}`);
        if (args.confirmed_by !== true) {
          return fail('confirmation_required', '删除任务必须显式确认：confirmed_by=true。删除不可恢复，请与用户确认后再执行。');
        }

        const dir = taskDir(root, args.task_id);
        await rm(dir, { recursive: true, force: true });
        return ok({
          task_id: args.task_id,
          status: 'deleted',
          deleted_path: `tasks/${args.task_id}`,
          hint: '任务已永久删除，不可恢复。',
        });
      } catch (e) {
        return fail('delete_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'task.detect_type',
    {
      description: '判断任务类型并推荐流程（PRD 7.2 / 8.2 / 9.3）。',
      inputSchema: {
        task_description: z.string().describe('任务描述'),
        context: z.record(z.unknown()).optional().describe('预留上下文'),
      },
    },
    async (args) => {
      try {
        return ok(detectTaskType(args.task_description));
      } catch (e) {
        return fail('detect_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'task.get_flow',
    {
      description: '获取任务类型对应的流程模板（PRD 9.4）。',
      inputSchema: {
        task_type: z.enum(['crud', 'lightweight_ddd', 'full_ddd', 'analysis', 'bug_fix']).describe('任务类型'),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const flow = await loadFlowTemplate(root, args.task_type);
        if (!flow) return fail('flow_not_found', `未找到流程模板: ${args.task_type}`);
        return ok(flow);
      } catch (e) {
        return fail('get_flow_failed', (e as Error).message);
      }
    },
  );
  server.registerTool(
    'task.export_delivery_package',
    {
      description:
        '导出完整交付包 delivery_package.md（PRD 7.10 / 8.9 / 9.15）。所有必需阶段完成后可导出。可选 format：md / html / both（默认 md），html 为自包含单文件，便于传阅。',
      inputSchema: {
        task_id: z.string().describe('任务 ID'),
        format: z
          .enum(['md', 'html', 'both'])
          .optional()
          .describe('导出格式（缺省 md）：md / html / both'),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const task = await getTask(root, args.task_id);
        if (!task) return fail('task_not_found', `任务不存在: ${args.task_id}`);

        const stages = (await getStages(root, args.task_id)) ?? [];
        const incomplete = stages.filter((s) => s.status !== 'completed' && s.status !== 'skipped');
        if (incomplete.length > 0) {
          return fail(
            'stages_incomplete',
            `存在未完成阶段，无法导出：${incomplete.map((s) => `${s.stage}(${s.status})`).join('、')}`,
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
        });
      } catch (e) {
        return fail('export_failed', (e as Error).message);
      }
    },
  );
}

export { FLOW_FILE_NAMES };
