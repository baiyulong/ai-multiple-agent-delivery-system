import { join } from 'node:path';
import { readJson, writeJsonAtomic } from './fsx.js';
import { packageRoot } from './locate.js';

/**
 * 版本检测（更新检测）。
 *
 * - 版本源：GitHub Releases。仓库 baiyulong/ai-multiple-agent-delivery-system。
 * - 启动自动检测（后台静默，失败不阻塞）；仅提示，不做自动更新。
 * - 更新统一走 install.js --release（停进程 → 下载 → 删除旧版 → 拷贝 → 构建 → 启动）。
 *   不在 MCP 进程内执行，避免 Windows 文件锁与无法自停自身的问题。
 */

const GITHUB_OWNER = 'baiyulong';
const GITHUB_REPO = 'ai-multiple-agent-delivery-system';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

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

/** 读本地当前版本：全局安装目录的 package.json（新模型：工具本体装在 ~/.config/ai-delivery/，packageRoot 即全局安装目录） */
async function readCurrentVersion(root: string): Promise<string> {
  // 兼容旧模型：<root>/delivery-mcp-server/package.json（按项目安装）优先，回退到运行包
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
        console.error(`[delivery] 发现新版本 ${state.latest_version}，请运行 node ${join(packageRoot(), 'install.js')} --release 更新（在项目根目录执行）`);
      }
    })
    .catch(() => {
      // 静默，绝不崩溃
    });
}
