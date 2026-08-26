import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { packageRoot } from './locate.js';

/**
 * 看板进程管理（供 dashboard.start / dashboard.stop / dashboard.status 工具调用）。
 *
 * 目的：AI（如 delivery-orchestrator）可以直接通过 MCP 工具启停看板，
 * 不再需要查找源码、猜测启动方式。
 *
 * 约定（与 dashboard.ts / install.js 一致）：
 * - 端口持久化于 <数据根>/dashboard.port（配置端口被占用时回退随机端口）
 * - PID 持久化于 <数据根>/dashboard.pid（本模块新增，用于精确停止）
 * - 日志追加至 <数据根>/dashboard.log
 *
 * 入口解析：
 * 1. 生产安装（--release 预构建包）：dist/dashboard.js，直接 node 运行
 * 2. 开发/测试环境（dist 未构建）：tsx 运行 src/dashboard.ts（CI 中测试先于构建执行）
 */

const PORT_FILE = 'dashboard.port';
const PID_FILE = 'dashboard.pid';
const LOG_FILE = 'dashboard.log';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readPortFile(root: string): number | null {
  try {
    const port = parseInt(readFileSync(join(root, PORT_FILE), 'utf-8').trim(), 10);
    return Number.isFinite(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

function readPidFile(root: string): number | null {
  try {
    const pid = parseInt(readFileSync(join(root, PID_FILE), 'utf-8').trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** 探测看板 HTTP 服务是否在线 */
async function probeDashboard(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return res.status < 500;
  } catch {
    return false;
  }
}

export interface DashboardStatus {
  running: boolean;
  url: string | null;
  port: number | null;
  pid: number | null;
  log_file: string;
}

/** 查询看板状态（端口 + HTTP 探测） */
export async function dashboardStatus(root: string): Promise<DashboardStatus> {
  const logFile = join(root, LOG_FILE);
  const port = readPortFile(root);
  if (port === null) {
    return { running: false, url: null, port: null, pid: null, log_file: logFile };
  }
  const running = await probeDashboard(port);
  return {
    running,
    url: running ? `http://localhost:${port}` : null,
    port,
    pid: readPidFile(root),
    log_file: logFile,
  };
}

export interface DashboardStartResult {
  started: boolean;
  already_running: boolean;
  url: string;
  port: number;
  log_file: string;
}

/** 后台启动看板（detached 独立进程，避免随 MCP server / 命令行超时退出） */
export async function startDashboard(root: string): Promise<DashboardStartResult> {
  // 幂等：已在运行则直接返回地址
  const current = await dashboardStatus(root);
  if (current.running && current.url) {
    return { started: false, already_running: true, url: current.url, port: current.port!, log_file: current.log_file };
  }

  // 清理残留的旧端口/PID 文件（上次进程异常退出未清理）
  await rm(join(root, PORT_FILE), { force: true });
  await rm(join(root, PID_FILE), { force: true });

  // 入口解析：dist 优先，开发/测试环境回退 tsx 源码
  const pkg = packageRoot();
  const distEntry = join(pkg, 'dist', 'dashboard.js');
  const srcEntry = join(pkg, 'src', 'dashboard.ts');
  const tsxCli = join(pkg, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  let args: string[];
  if (existsSync(distEntry)) {
    args = [distEntry];
  } else if (existsSync(srcEntry) && existsSync(tsxCli)) {
    args = [tsxCli, srcEntry];
  } else {
    throw new Error('看板入口未找到：dist/dashboard.js 不存在且源码 tsx 运行器不可用。请先在 delivery-mcp-server 目录执行 npm run build');
  }

  const logFile = join(root, LOG_FILE);
  await mkdir(dirname(logFile), { recursive: true });
  const out = createWriteStream(logFile, { flags: 'a' });
  const child = spawn(process.execPath, args, {
    cwd: pkg,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DELIVERY_ROOT: root },
    windowsHide: true,
  });
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
  child.unref();

  // 轮询端口文件确认启动成功（dashboard 监听后写入）
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const port = readPortFile(root);
    if (port !== null) {
      return { started: true, already_running: false, url: `http://localhost:${port}`, port, log_file: logFile };
    }
  }
  throw new Error(`看板进程已启动，但 10 秒内未监听端口（日志：${logFile}）`);
}

export interface DashboardStopResult {
  stopped: boolean;
  pid: number | null;
  port: number | null;
  reason?: string;
  hint?: string;
}

/** 停止看板进程（按 PID 精确终止），并清理端口/PID 文件 */
export async function stopDashboard(root: string): Promise<DashboardStopResult> {
  const pid = readPidFile(root);
  const port = readPortFile(root);

  if (pid === null) {
    // 无 PID 文件：可能是旧版本启动的看板。若端口仍在线，提示用 install.js 停止
    const running = port !== null && (await probeDashboard(port));
    await rm(join(root, PORT_FILE), { force: true });
    if (running) {
      return {
        stopped: false,
        pid: null,
        port,
        reason: 'no_pid_file',
        hint: '看板在运行但缺少 PID 记录（旧版本启动），请执行 node <全局安装目录>/delivery-mcp-server/install.js --stop-dashboard 停止',
      };
    }
    return { stopped: true, pid: null, port, reason: 'not_running' };
  }

  try {
    process.kill(pid);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'ESRCH') {
      throw new Error(`停止看板进程失败（PID ${pid}）：${(e as Error).message}`);
    }
    // ESRCH：进程已不存在，视为已停止
  }

  // 等待端口下线（Windows 强杀不走信号处理，文件由这里清理）
  if (port !== null) {
    for (let i = 0; i < 10; i++) {
      if (!(await probeDashboard(port))) break;
      await sleep(300);
    }
  }
  await rm(join(root, PORT_FILE), { force: true });
  await rm(join(root, PID_FILE), { force: true });
  return { stopped: true, pid, port };
}
