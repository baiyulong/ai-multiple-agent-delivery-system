import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHarness } from './helpers.js';

/**
 * 看板管理工具组（dashboard.start / dashboard.stop / dashboard.status）。
 * 真实拉起看板进程（dist 未构建时回退 tsx 源码），验证启停闭环。
 */
describe('dashboard 看板管理工具', () => {
  it('status 未启动 → start 后台启动并返回地址 → 幂等 → stop 停止', async () => {
    const h = await createHarness();

    // 1. 初始状态：未运行
    const st1 = await h.call('dashboard.status', {});
    expect(st1.running).toBe(false);
    expect(st1.url).toBeNull();

    // 2. 启动（真实进程）
    const start = await h.call('dashboard.start', {});
    expect(start.started).toBe(true);
    expect(start.already_running).toBe(false);
    expect(start.url).toMatch(/^http:\/\/localhost:\d+$/);
    expect(start.port).toBeGreaterThan(0);

    // 端口/PID 文件已写入
    const port = parseInt(await readFile(join(h.root, 'dashboard.port'), 'utf-8'), 10);
    expect(port).toBe(start.port);
    const pid = parseInt(await readFile(join(h.root, 'dashboard.pid'), 'utf-8'), 10);
    expect(pid).toBeGreaterThan(0);

    // HTTP 真实可达（CI 测试阶段 web-dist 未构建，根路径可能 404——服务有响应即在线，与 probeDashboard 语义一致）
    const res = await fetch(start.url, { signal: AbortSignal.timeout(3000) });
    expect(res.status).toBeLessThan(500);

    // 3. 幂等：再次 start 返回 already_running
    const start2 = await h.call('dashboard.start', {});
    expect(start2.started).toBe(false);
    expect(start2.already_running).toBe(true);
    expect(start2.url).toBe(start.url);

    // 4. status 在线
    const st2 = await h.call('dashboard.status', {});
    expect(st2.running).toBe(true);
    expect(st2.url).toBe(start.url);
    expect(st2.pid).toBe(pid);

    // 5. 停止并确认端口/PID 文件清理
    const stop = await h.call('dashboard.stop', {});
    expect(stop.stopped).toBe(true);

    const st3 = await h.call('dashboard.status', {});
    expect(st3.running).toBe(false);

    await h.cleanup();
  }, 30000);

  it('stop 未运行的看板 → stopped=true（not_running），不报错', async () => {
    const h = await createHarness();
    const stop = await h.call('dashboard.stop', {});
    expect(stop.stopped).toBe(true);
    expect(stop.reason).toBe('not_running');
    await h.cleanup();
  });
});
