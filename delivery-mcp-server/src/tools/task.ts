import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { detectTaskType } from '../core/type-detector.js';
import { buildStagesFromFlow, loadFlowTemplate } from '../core/flow-engine.js';
import { exportDeliveryPackage } from '../core/exporter.js';
import { getQuestions, getStages, getTask } from '../core/store/task-store.js';
import { listArtifacts } from '../core/store/artifact-store.js';
import { readGateStageFile } from '../core/store/gate-store.js';
import { readContext } from '../core/store/task-store.js';
import { createTask } from '../core/store/task-store.js';
import { ok, fail, type ToolContext } from './common.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { MVP_TASK_TYPES, type TaskType } from '../core/types.js';
import { FLOW_FILE_NAMES } from '../core/flow-engine.js';
import { isTeamConfigured } from '../core/store/team-store.js';
import { isUserConfigured } from '../core/store/user-store.js';

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
          .enum(['crud', 'lightweight_ddd', 'full_ddd'])
          .optional()
          .describe('任务类型（缺省自动识别）：crud / lightweight_ddd / full_ddd'),
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
        const task = await createTask(root, {
          title: args.title,
          description: args.description,
          createdBy: args.created_by ?? 'unknown',
          taskType,
          stages: buildStagesFromFlow(flow),
        });
        return ok({
          task_id: task.task_id,
          status: task.status,
          current_stage: task.current_stage,
          task_path: `tasks/${task.task_id}`,
          task_type: task.task_type,
        });
      } catch (e) {
        return fail('create_failed', (e as Error).message);
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
        task_type: z.enum(['crud', 'lightweight_ddd', 'full_ddd']).describe('任务类型'),
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
      description: '导出完整交付包 delivery_package.md（PRD 7.10 / 8.9 / 9.15）。所有必需阶段完成后可导出。',
      inputSchema: { task_id: z.string().describe('任务 ID') },
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

        const result = await exportDeliveryPackage(root, args.task_id, {
          task,
          stages,
          artifacts,
          gateRecords,
          questions,
          contextMd,
        });
        return ok({ path: `tasks/${args.task_id}/${result.path}`, status: result.status });
      } catch (e) {
        return fail('export_failed', (e as Error).message);
      }
    },
  );
}

export { FLOW_FILE_NAMES };
