import { spawn } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { copyFile, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureDir, exists, readJson, writeJsonAtomic } from './fsx.js';
import { packageRoot } from './locate.js';

/**
 * 版本检测 + 自动更新（更新核心）。
 *
 * - 版本源：GitHub Releases。仓库 baiyulong/ai-multiple-agent-delivery-system。
 * - 启动自动检测（后台静默，失败不阻塞）；更新需手动触发（update.apply）。
 * - 用户数据（<root>/tasks 等）绝不触碰；只替换 delivery-mcp-server 工具本体
 *   与 .opencode/agent/delivery-*.md 角色文件（工具所有，覆盖安全）。
 */

const GITHUB_OWNER = 'baiyulong';
const GITHUB_REPO = 'ai-multiple-agent-delivery-system';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const GITHUB_CLONE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git`;

/** 更新状态文件结构 */
export interface UpdateState {
  current_version: string;
  latest_version: string | null;
  latest_tag: string | null;
  update_available: boolean;
  checked_at: string | null;
  applied_at: string | null;
  notes?: string; // 'network_error' / 'no_releases' / 'not_found'
  error?: string;
}

/** 简单 semver 比较：按 '.' 分段数字比较（够用即可）。返回 >0 表示 a>b */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** 读取当前状态文件（<root>/update-check.json），不存在返回 null */
export async function readUpdateState(root: string): Promise<UpdateState | null> {
  return readJson<UpdateState>(join(root, 'update-check.json'));
}

/** 写入状态文件 */
export async function writeUpdateState(root: string, state: UpdateState): Promise<void> {
  await writeJsonAtomic(join(root, 'update-check.json'), state);
}

/** TTL 小时数：DELIVERY_UPDATE_CHECK_TTL_HOURS，默认 6 */
function ttlHours(): number {
  const v = Number(process.env.DELIVERY_UPDATE_CHECK_TTL_HOURS);
  if (Number.isFinite(v) && v > 0) return v;
  return 6;
}

/** 读本地当前版本：优先读 <root>/delivery-mcp-server/package.json，回退到运行包 */
async function readCurrentVersion(root: string): Promise<string> {
  const installed = await readJson<{ version?: string }>(join(root, 'delivery-mcp-server', 'package.json'));
  if (installed?.version) return installed.version;
  const running = await readJson<{ version?: string }>(join(packageRoot(), 'package.json'));
  return running?.version ?? '0.0.0';
}

/** 请求 GitHub latest release 的 tag。404（无 release）→ null；其他错误 throw */
async function fetchLatestTag(): Promise<string | null> {
  const res = await fetch(GITHUB_API_URL, {
    headers: { 'User-Agent': 'delivery-mcp-server' },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null; // 尚无 release
  if (!res.ok) throw new Error(`GitHub API 响应 ${res.status}`);
  const data = (await res.json()) as { tag_name?: string };
  if (typeof data.tag_name !== 'string' || data.tag_name.length === 0) {
    throw new Error('GitHub release 缺少 tag_name');
  }
  return data.tag_name;
}

/**
 * 检查更新（核心）：
 * - 读本地 package.json version 作为 current_version
 * - 读已有状态文件判断 TTL（checked_at 距今 < TTL 且无 force 则直接返回已有状态，不请求网络）
 * - 请求 GitHub latest release：成功→比较 semver；404→no_releases；网络/其他错误→network_error（静默，不 throw）
 * - 写入状态文件并返回
 */
export async function checkForUpdates(root: string, opts: { force?: boolean } = {}): Promise<UpdateState> {
  const current = await readCurrentVersion(root);
  const existing = await readUpdateState(root);
  const force = opts.force === true;

  // TTL：非强制且上次检测在 TTL 内 → 直接返回已有状态（不请求网络）
  if (!force && existing?.checked_at) {
    const checked = Date.parse(existing.checked_at);
    const elapsed = Number.isFinite(checked) ? (Date.now() - checked) / 3600000 : Number.POSITIVE_INFINITY;
    if (elapsed >= 0 && elapsed < ttlHours()) {
      return existing;
    }
  }

  // 请求 GitHub
  try {
    const tag = await fetchLatestTag();
    if (tag === null) {
      const state: UpdateState = {
        current_version: current,
        latest_version: null,
        latest_tag: null,
        update_available: false,
        checked_at: new Date().toISOString(),
        applied_at: existing?.applied_at ?? null,
        notes: 'no_releases',
      };
      await writeUpdateState(root, state);
      return state;
    }
    const latest = tag.replace(/^v/i, '');
    const state: UpdateState = {
      current_version: current,
      latest_version: latest,
      latest_tag: tag,
      update_available: compareVersions(latest, current) > 0,
      checked_at: new Date().toISOString(),
      applied_at: existing?.applied_at ?? null,
    };
    await writeUpdateState(root, state);
    return state;
  } catch (e) {
    // 网络/其他错误：保留旧状态字段，notes='network_error'，静默不 throw
    const state: UpdateState = {
      current_version: current,
      latest_version: existing?.latest_version ?? null,
      latest_tag: existing?.latest_tag ?? null,
      update_available: existing?.update_available ?? false,
      checked_at: existing?.checked_at ?? new Date().toISOString(),
      applied_at: existing?.applied_at ?? null,
      notes: 'network_error',
      error: e instanceof Error ? e.message : String(e),
    };
    try {
      await writeUpdateState(root, state);
    } catch {
      // 写入失败也静默
    }
    return state;
  }
}

function spawnCmd(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} 退出码 ${code}`));
    });
  });
}

async function runGit(args: string[], cwd: string): Promise<void> {
  await spawnCmd('git', args, cwd);
}

async function runNpm(args: string[], cwd: string): Promise<void> {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  await spawnCmd(cmd, args, cwd);
}

/** 递归拷贝目录，可选跳过某些顶层子目录 */
async function copyDir(src: string, dest: string, opts: { skip?: Set<string> } = {}): Promise<void> {
  await ensureDir(dest);
  const entries = await readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    if (opts.skip?.has(ent.name)) continue;
    const s = join(src, ent.name);
    const d = join(dest, ent.name);
    if (ent.isDirectory()) {
      await copyDir(s, d, opts);
    } else {
      await copyFile(s, d);
    }
  }
}

/** 拷贝 .opencode/agent 下的 delivery-*.md 角色文件（覆盖） */
async function copyAgentFiles(srcDir: string, destDir: string): Promise<void> {
  let entries: Dirent[] = [];
  try {
    entries = await readdir(srcDir, { withFileTypes: true });
  } catch {
    return;
  }
  await ensureDir(destDir);
  for (const ent of entries) {
    if (ent.isFile() && /^delivery-.*\.md$/.test(ent.name)) {
      await copyFile(join(srcDir, ent.name), join(destDir, ent.name));
    }
  }
}

/**
 * 应用更新（手动触发）：
 * 1. 调 checkForUpdates(force=true)，若无新版本返回 { applied:false, reason:'up_to_date' }
 * 2. git clone 拉取最新 tag 到 os.tmpdir() 下唯一目录
 * 3. 校验 {tmp}/delivery-mcp-server/package.json 存在
 * 4. 备份现有 <root>/delivery-mcp-server → .bak-{ts}（rm+rename 兜底）
 * 5. 拷贝新 server（跳过 node_modules/.git/dist）
 * 6. 拷贝 .opencode/agent/delivery-*.md → <root>/.opencode/agent/
 * 7. 新目录执行 npm install && npm run build（Windows 用 npm.cmd）
 * 8. 成功：删除备份，写 applied_at
 * 9. 任一步失败：恢复备份、删除半成品、返回结构化失败
 * 10. 清理 tmpDir
 */
export async function applyUpdate(
  root: string,
): Promise<{ applied: boolean; reason: string; from?: string; to?: string; error?: string }> {
  let check: UpdateState;
  try {
    check = await checkForUpdates(root, { force: true });
  } catch (e) {
    return { applied: false, reason: 'check_failed', error: e instanceof Error ? e.message : String(e) };
  }

  if (!check.latest_tag) {
    return { applied: false, reason: check.notes === 'no_releases' ? 'no_releases' : 'up_to_date' };
  }
  if (check.latest_version && compareVersions(check.latest_version, check.current_version) <= 0) {
    return { applied: false, reason: 'up_to_date' };
  }

  const latestTag = check.latest_tag;
  const from = check.current_version;
  const to = check.latest_version ?? latestTag;

  const tmpDir = join(tmpdir(), `delivery-update-${Date.now()}`);
  const serverDir = join(root, 'delivery-mcp-server');
  let backupDir: string | null = null;

  try {
    // 2. clone
    await ensureDir(tmpDir);
    await runGit(['clone', '--depth', '1', '--branch', latestTag, GITHUB_CLONE_URL, tmpDir], tmpdir());

    // 3. 校验
    if (!(await exists(join(tmpDir, 'delivery-mcp-server', 'package.json')))) {
      throw new Error('克隆的仓库中未找到 delivery-mcp-server/package.json');
    }

    // 4. 备份（rm+rename 兜底）
    if (await exists(serverDir)) {
      backupDir = `${serverDir}.bak-${Date.now()}`;
      await rm(backupDir, { recursive: true, force: true });
      await rename(serverDir, backupDir);
    }

    // 5. 拷贝新 server（跳过 node_modules/.git/dist）
    const tmpServer = join(tmpDir, 'delivery-mcp-server');
    await copyDir(tmpServer, serverDir, { skip: new Set(['node_modules', '.git', 'dist']) });

    // 6. 拷贝角色文件
    await copyAgentFiles(join(tmpDir, '.opencode', 'agent'), join(root, '.opencode', 'agent'));

    // 7. 重新 install + build
    await runNpm(['install'], serverDir);
    await runNpm(['run', 'build'], serverDir);

    // 8. 成功：删除备份，写 applied_at
    if (backupDir) {
      await rm(backupDir, { recursive: true, force: true });
      backupDir = null;
    }
    const state = await checkForUpdates(root, { force: true });
    await writeUpdateState(root, { ...state, applied_at: new Date().toISOString() });

    return { applied: true, reason: 'ok', from, to };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 9. 失败恢复备份
    if (backupDir && (await exists(backupDir))) {
      await rm(serverDir, { recursive: true, force: true });
      await rename(backupDir, serverDir);
    }
    return { applied: false, reason: 'error', error: msg };
  } finally {
    // 10. 清理 tmpDir
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * 启动时触发（异步、静默）：
 * DELIVERY_UPDATE_CHECK !== '0' 时 fire-and-forget checkForUpdates(root)（内部已吞错）。
 * 检测到新版本时向 stderr 打印一行提示（opencode 打开时可见）。
 */
export function startBackgroundUpdateCheck(root: string): void {
  if (process.env.DELIVERY_UPDATE_CHECK === '0') return;
  checkForUpdates(root)
    .then((state) => {
      if (state.update_available && state.latest_version) {
        console.error(`[delivery] 发现新版本 ${state.latest_version}，可调用 update.apply 更新`);
      }
    })
    .catch(() => {
      // 静默，绝不崩溃
    });
}
