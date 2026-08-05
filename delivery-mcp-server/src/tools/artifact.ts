import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  checkMissingUpstream,
  loadFlowTemplate,
  requiredTypes,
} from '../core/flow-engine.js';
import {
  findArtifactByType,
  getArtifact,
  listArtifacts,
  setArtifactStatus,
  submitArtifact,
  updateArtifact,
} from '../core/store/artifact-store.js';
import { getStages, getTask } from '../core/store/task-store.js';
import { setStageArtifactId, setStageStatus } from '../core/store/stage-store.js';
import { resolveDeliveryRoot } from '../core/paths.js';
import { fail, ok, type ToolContext } from './common.js';

/**
 * 交付物工具组（PRD 7.5 / 8.5 / 9.7-9.9）：
 * artifact.submit / artifact.get / artifact.list / artifact.update
 * submit 带上游校验（PRD 7.3 双保险），防止下游越权提交。
 */

export function registerArtifactTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'artifact.submit',
    {
      description:
        '提交交付物：保存 Markdown 文件并创建 metadata（PRD 7.5 / 9.7）。提交前校验上游阶段已完成（PRD 7.3 双保险）。',
      inputSchema: {
        task_id: z.string().describe('任务 ID'),
        stage: z.string().describe('所属阶段'),
        role: z.string().describe('角色 Agent'),
        artifact_type: z.string().describe('交付物类型（如 crud_spec_card）'),
        content: z.string().describe('交付物 Markdown 内容'),
        title: z.string().optional().describe('交付物标题'),
        summary: z.string().optional().describe('交付物摘要'),
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
          return fail('stage_not_found', `阶段不存在: ${args.stage}`, { available: stages.map((s) => s.stage) });
        }

        // 校验 artifact_type 属于该阶段必需类型
        const reqTypes = requiredTypes(stage);
        if (!reqTypes.includes(args.artifact_type)) {
          return fail('unexpected_artifact_type', `交付物类型 ${args.artifact_type} 不属于阶段 ${args.stage}`, {
            required: reqTypes,
          });
        }

        // 上游检查（PRD 7.3 / 12.2）
        const flow = await loadFlowTemplate(root, task.task_type);
        const missing = flow ? await checkMissingUpstream(root, args.task_id, flow, args.stage) : [];
        if (missing.length > 0) {
          return fail(
            'upstream_missing',
            `上游交付物缺失，不能提交 ${args.artifact_type}`,
            {
              status: 'blocked',
              missing_upstream: missing,
              assigned_agent: missing[0]?.assigned_agent ?? null,
              suggested_action: 'call_agent_to_complete_upstream',
            },
          );
        }

        // 同类型已存在则要求走 update
        const existing = await findArtifactByType(root, args.task_id, args.stage, args.artifact_type);
        if (existing) {
          return fail(
            'artifact_exists',
            `阶段 ${args.stage} 已存在 ${args.artifact_type}（${existing.artifact_id} v${existing.version}），请使用 artifact.update 修订`,
            { artifact_id: existing.artifact_id, version: existing.version },
          );
        }

        const meta = await submitArtifact(root, {
          taskId: args.task_id,
          stage: args.stage,
          role: args.role,
          artifactType: args.artifact_type,
          content: args.content,
          title: args.title,
          summary: args.summary,
        });

        // 联动阶段状态与 artifact_id
        await setStageStatus(root, args.task_id, args.stage, 'submitted', stages);
        await setStageArtifactId(root, args.task_id, args.stage, meta.artifact_id, stages);

        return ok({
          artifact_id: meta.artifact_id,
          status: meta.status,
          version: meta.version,
          path: meta.path,
        });
      } catch (e) {
        return fail('submit_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'artifact.get',
    {
      description: '读取交付物内容与 metadata（PRD 9.8）。',
      inputSchema: {
        task_id: z.string().describe('任务 ID'),
        artifact_id: z.string().describe('交付物 ID'),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const got = await getArtifact(root, args.task_id, args.artifact_id);
        if (!got) return fail('artifact_not_found', `交付物不存在: ${args.artifact_id}`);
        return ok(got);
      } catch (e) {
        return fail('get_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'artifact.list',
    {
      description: '列出任务交付物（PRD 9.9），可选按阶段过滤。',
      inputSchema: {
        task_id: z.string().describe('任务 ID'),
        stage: z.string().optional().describe('阶段过滤'),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const artifacts = await listArtifacts(root, args.task_id, args.stage);
        return ok({ artifacts });
      } catch (e) {
        return fail('list_failed', (e as Error).message);
      }
    },
  );

  server.registerTool(
    'artifact.update',
    {
      description: '修订交付物：保留历史版本（PRD 14.4 / 12.3 返工流程），版本 +1，状态回到 submitted。',
      inputSchema: {
        task_id: z.string().describe('任务 ID'),
        artifact_id: z.string().describe('交付物 ID'),
        content: z.string().describe('修订后的 Markdown 内容'),
        summary: z.string().optional().describe('修订摘要'),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const meta = await updateArtifact(root, args.task_id, args.artifact_id, args.content, {
          summary: args.summary,
        });
        // 阶段回到 submitted，等待重新 gate.check
        const stages = (await getStages(root, args.task_id)) ?? [];
        await setStageStatus(root, args.task_id, meta.stage, 'submitted', stages);
        return ok({
          artifact_id: meta.artifact_id,
          version: meta.version,
          status: meta.status,
          path: meta.path,
        });
      } catch (e) {
        return fail('update_failed', (e as Error).message);
      }
    },
  );
}
