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
import { t } from '../core/i18n.js';

/**
 * 交付物工具组（PRD 7.5 / 8.5 / 9.7-9.9）：
 * artifact.submit / artifact.get / artifact.list / artifact.update
 * submit 带上游校验（PRD 7.3 双保险），防止下游越权提交。
 */

export function registerArtifactTools(server: McpServer, ctx: () => ToolContext) {
  server.registerTool(
    'artifact.submit',
    {
      description: t('tool.artifact.submit.description'),
      inputSchema: {
        task_id: z.string().describe(t('tool.artifact.submit.task_id')),
        stage: z.string().describe(t('tool.artifact.submit.stage')),
        role: z.string().describe(t('tool.artifact.submit.role')),
        artifact_type: z.string().describe(t('tool.artifact.submit.artifact_type')),
        content: z.string().describe(t('tool.artifact.submit.content')),
        title: z.string().optional().describe(t('tool.artifact.submit.title')),
        summary: z.string().optional().describe(t('tool.artifact.submit.summary')),
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
          return fail('stage_not_found', t('error.stage_not_found', { stage: args.stage }), { available: stages.map((s) => s.stage) });
        }

        // 校验 artifact_type 属于该阶段必需类型
        const reqTypes = requiredTypes(stage);
        if (!reqTypes.includes(args.artifact_type)) {
          return fail('unexpected_artifact_type', t('tool.artifact.submit.unexpected_type', { type: args.artifact_type, stage: args.stage }), {
            required: reqTypes,
          });
        }

        // 上游检查（PRD 7.3 / 12.2）
        const flow = await loadFlowTemplate(root, task.task_type);
        const missing = flow ? await checkMissingUpstream(root, args.task_id, flow, args.stage) : [];
        if (missing.length > 0) {
          return fail(
            'upstream_missing',
            t('tool.artifact.submit.upstream_missing', { type: args.artifact_type }),
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
            t('tool.artifact.submit.artifact_exists', {
              stage: args.stage,
              type: args.artifact_type,
              id: existing.artifact_id,
              version: existing.version,
            }),
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
        return fail('submit_failed', t('tool.artifact.submit.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'artifact.get',
    {
      description: t('tool.artifact.get.description'),
      inputSchema: {
        task_id: z.string().describe(t('tool.artifact.get.task_id')),
        artifact_id: z.string().describe(t('tool.artifact.get.artifact_id')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const got = await getArtifact(root, args.task_id, args.artifact_id);
        if (!got) return fail('artifact_not_found', t('tool.artifact.get.not_found', { id: args.artifact_id }));
        return ok(got);
      } catch (e) {
        return fail('get_failed', t('tool.artifact.get.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'artifact.list',
    {
      description: t('tool.artifact.list.description'),
      inputSchema: {
        task_id: z.string().describe(t('tool.artifact.list.task_id')),
        stage: z.string().optional().describe(t('tool.artifact.list.stage')),
      },
    },
    async (args) => {
      try {
        const root = resolveDeliveryRoot(ctx().root);
        const artifacts = await listArtifacts(root, args.task_id, args.stage);
        return ok({ artifacts });
      } catch (e) {
        return fail('list_failed', t('tool.artifact.list.failed', { msg: (e as Error).message }));
      }
    },
  );

  server.registerTool(
    'artifact.update',
    {
      description: t('tool.artifact.update.description'),
      inputSchema: {
        task_id: z.string().describe(t('tool.artifact.update.task_id')),
        artifact_id: z.string().describe(t('tool.artifact.update.artifact_id')),
        content: z.string().describe(t('tool.artifact.update.content')),
        summary: z.string().optional().describe(t('tool.artifact.update.summary')),
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
        return fail('update_failed', t('tool.artifact.update.failed', { msg: (e as Error).message }));
      }
    },
  );
}
