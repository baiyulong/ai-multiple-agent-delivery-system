/**
 * 示例：供应商分类维护 —— 完整 CRUD 流程走查
 *
 * 运行：npm run example
 * 作用：在临时目录初始化 .delivery 根，通过 MCP 工具面跑通
 *       create → submit → gate → complete 全流程，并打印交付包。
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { initDeliveryRoot } from '../src/core/init.js';
import { registerTaskTools } from '../src/tools/task.js';
import { registerStageTools } from '../src/tools/stage.js';
import { registerArtifactTools } from '../src/tools/artifact.js';
import { registerGateTools } from '../src/tools/gate.js';
import { registerContextTools } from '../src/tools/context.js';
import { registerQuestionTools } from '../src/tools/question.js';
import { validCrudSpecCard, validDddReview, validEngineeringPlan, validQaTestPlan, validUxInteractionCard } from '../test/e2e/helpers.js';

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'delivery-example-'));
  await initDeliveryRoot(root);

  const server = new McpServer({ name: 'delivery-example', version: '0.0.0' });
  const ctx = () => ({ root });
  registerTaskTools(server, ctx);
  registerStageTools(server, ctx);
  registerArtifactTools(server, ctx);
  registerGateTools(server, ctx);
  registerContextTools(server, ctx);
  registerQuestionTools(server, ctx);

  const client = new Client({ name: 'example-client', version: '0.0.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await client.callTool({ name, arguments: args });
    return JSON.parse((res.content as Array<{ type: string; text: string }>)[0]!.text);
  };

  const log = (s: string) => console.log(`\n=== ${s} ===`);

  log('1. 创建任务（自动识别类型）');
  const created = await call('task.create', {
    title: '供应商分类维护',
    description: '维护供应商分类，支持新增、编辑、停用和查询',
    created_by: 'Yulong',
  });
  console.log(JSON.stringify(created, null, 2));
  const taskId = created.task_id as string;

  const stages = [
    { stage: 'product_requirement', type: 'crud_spec_card', content: validCrudSpecCard(), label: '产品需求' },
    { stage: 'ux_design', type: 'ux_interaction_card', content: validUxInteractionCard(), label: 'UX 设计' },
    { stage: 'domain_review', type: 'ddd_applicability_review', content: validDddReview(), label: '领域评审' },
    { stage: 'engineering_design', type: 'engineering_plan', content: validEngineeringPlan(), label: '工程实现' },
    { stage: 'qa_validation', type: 'qa_test_plan', content: validQaTestPlan(), label: 'QA 验证' },
  ];

  for (const s of stages) {
    log(`2. ${s.label}阶段：提交交付物 ${s.type}`);
    const submit = await call('artifact.submit', {
      task_id: taskId,
      stage: s.stage,
      role: 'agent',
      artifact_type: s.type,
      content: s.content,
      title: `${s.label}交付物`,
    });
    console.log(`  提交 -> ${submit.artifact_id} (v${submit.version})`);

    log(`3. ${s.label}阶段：门禁检查`);
    const gate = await call('gate.check', { task_id: taskId, stage: s.stage, artifact_id: submit.artifact_id });
    console.log(`  门禁 -> ${gate.result} (score ${gate.score})`);

    log(`4. ${s.label}阶段：阶段完成`);
    const complete = await call('stage.complete', { task_id: taskId, stage: s.stage, completed_by: 'orchestrator' });
    console.log(`  完成 -> next_stage=${complete.next_stage} next_role=${complete.next_role}`);
  }

  log('5. 导出交付包');
  const exported = await call('task.export_delivery_package', { task_id: taskId });
  console.log(`  导出 -> ${exported.status}`);

  const pkg = (await (await import('../src/core/fsx.js')).readText(join(root, 'tasks', taskId, 'delivery_package.md'))) ?? '';
  console.log('\n----- delivery_package.md -----\n');
  console.log(pkg.slice(0, 1500));
  console.log('\n...（截断）');

  console.log(`\n.delivery 根目录: ${root}`);
  await client.close();
  await rm(root, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});