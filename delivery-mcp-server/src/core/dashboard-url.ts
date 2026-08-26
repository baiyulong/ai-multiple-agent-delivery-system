/**
 * 看板地址生成：供工具返回 dashboard_url / view_hint 提示。
 * 端口优先级：
 *   1. 已持久化的实际端口（<数据根>/dashboard.port，dashboard 启动时写入，
 *      若配置端口被占用会回退随机端口并记录于此）
 *   2. 环境变量 DELIVERY_DASHBOARD_PORT > PORT
 *   3. 默认 8787
 * 看板前端使用 hash 路由定位任务详情：/#/task/<taskId>。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDeliveryRoot } from './paths.js';

/**
 * 与 dashboard.ts 的 resolveDashboardRoot 保持一致（用户目录安装模型）：
 * DELIVERY_ROOT 环境变量（install.js 注册 MCP 时注入 <项目>/.delivery）> cwd/.delivery。
 * server/dashboard 均装在用户目录，不再用"server 父目录=项目根"启发式。
 */
function resolveDashboardRoot(): string {
  return resolveDeliveryRoot();
}

/** 端口文件对应的看板进程是否存活（无 PID 文件的旧版看板视为存活，保守处理） */
function isPortFileLive(root: string): boolean {
  try {
    const pidRaw = readFileSync(join(root, 'dashboard.pid'), 'utf-8').trim();
    const pid = parseInt(pidRaw, 10);
    if (!Number.isFinite(pid) || pid <= 0) return true; // PID 文件异常，保守视为存活
    process.kill(pid, 0); // 信号 0：探测进程是否存在，不实际发送信号
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false; // 进程已不存在 → 端口文件为残留
    if (code === 'ENOENT') return true; // 无 PID 文件（旧版看板启动），保守视为存活
    return true; // EPERM 等：进程存在但无权限，视为存活
  }
}

function resolvePort(): string {
  const env = process.env.DELIVERY_DASHBOARD_PORT ?? process.env.PORT;
  if (env) return env;
  const root = resolveDashboardRoot();
  try {
    const raw = readFileSync(join(root, 'dashboard.port'), 'utf-8').trim();
    if (raw && isPortFileLive(root)) return raw;
    // 端口文件存在但进程已死（异常退出残留）→ 忽略，回退默认端口
  } catch {
    // 文件不存在或不可读，回退默认
  }
  return '8787';
}

export function dashboardUrl(taskId?: string): string {
  const base = `http://localhost:${resolvePort()}`;
  if (taskId) return `${base}/#/task/${taskId}`;
  return base;
}