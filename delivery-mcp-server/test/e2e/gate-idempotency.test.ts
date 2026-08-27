import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHarness, validCrudSpecCard } from './helpers.js';

/**
 * gate.check 幂等（bug 修复）：MCP 超时后客户端重试不应产生重复副作用。
 * 修复前行为：每次调用都追加 history 记录 + 重发失败邮件。
 * 修复后行为：交付物内容未变（content_hash 相同）时复用上次结果，
 * 返回 deduped:true，不追加历史、不重发邮件；内容变更后才重新检查。
 */
describe('gate.check 幂等（内容哈希去重）', () => {
  it('同内容重复调用 → deduped:true 复用 gate_id，history 只有一条；内容变更后重新检查', async () => {
    const h = await createHarness();
    const created = await h.call('task.create', {
      title: '供应商分类维护',
      description: '维护供应商分类',
      created_by: 'u',
    });
    const taskId = created.task_id as string;

    const submit = await h.call('artifact.submit', {
      task_id: taskId,
      stage: 'product_requirement',
      role: 'product-manager',
      artifact_type: 'crud_spec_card',
      content: validCrudSpecCard(),
    });
    expect(submit.required_sections).toBeDefined();
    expect((submit.required_sections as string[]).length).toBeGreaterThan(0);
    const artifactId = submit.artifact_id as string;

    // 第一次检查：正常执行
    const g1 = await h.call('gate.check', { task_id: taskId, stage: 'product_requirement', artifact_id: artifactId });
    expect(g1.result).toBe('passed');
    expect(g1.deduped).toBeUndefined();

    // 第二次检查（内容未变）：复用结果，deduped:true
    const g2 = await h.call('gate.check', { task_id: taskId, stage: 'product_requirement', artifact_id: artifactId });
    expect(g2.deduped).toBe(true);
    expect(g2.gate_id).toBe(g1.gate_id);
    expect(g2.result).toBe('passed');
    expect(g2.email.reason).toBe('deduplicated');

    // history 只有一条（未追加重复记录）
    const gateFile = join(h.root, 'tasks', taskId, 'gates', 'product_requirement.gate.json');
    const raw = JSON.parse(await readFile(gateFile, 'utf-8')) as { history: unknown[]; checks: Record<string, { content_hash?: string }> };
    expect(raw.history).toHaveLength(1);
    expect(raw.checks[artifactId]?.content_hash).toBeDefined();

    // 修订内容后（v0.2，内容有变化）重新检查 → 新记录追加，history 变两条
    await h.call('artifact.update', {
      task_id: taskId,
      artifact_id: artifactId,
      content: `${validCrudSpecCard()}\n\n补充说明：内容已修订。\n`,
    });
    const g3 = await h.call('gate.check', { task_id: taskId, stage: 'product_requirement', artifact_id: artifactId });
    expect(g3.deduped).toBeUndefined();
    const raw2 = JSON.parse(await readFile(gateFile, 'utf-8')) as { history: unknown[] };
    expect(raw2.history).toHaveLength(2);

    await h.cleanup();
  });
});
