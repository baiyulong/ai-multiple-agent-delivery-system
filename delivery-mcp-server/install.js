#!/usr/bin/env node
/**
 * AI 交付任务系统 · 一键安装脚本（Windows / Linux / macOS 通用）
 *
 * 用法：
 *   # 从源码仓库安装（在仓库根目录执行）
 *   node delivery-mcp-server/install.js
 *   # 从源码仓库安装到指定项目
 *   node delivery-mcp-server/install.js /path/to/project
 *   # 从 GitHub Release 下载最新稳定版安装（推荐）
 *   node install.js --release
 *   # 已安装的项目更新到最新版
 *   cd delivery-mcp-server && node install.js --release
 *   node install.js --repo /path/to/source  # 指定本地源码路径
 *   node install.js --no-dashboard       # 安装后不启动浏览器看板（默认启动）
 *   node install.js --dry-run            # 只打印将要执行的操作，不改动文件
 *   node install.js --force              # 目标目录不是 git 仓库时也继续
 *
 * 安全性：
 *   - 拒绝把本仓库自身当作安装目标
 *   - agent 文件只新增 delivery-*.md，绝不覆盖目标项目已有文件
 *   - opencode.json 只合并新增 mcp.delivery，保留目标项目全部字段
  *   - .gitignore 幂等追加（忽略工具本体 delivery-mcp-server；email.json 是团队共享发件配置，随仓库提交）
 */
import { cp, mkdir, readFile, realpath, writeFile, rm } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(dirname(fileURLToPath(import.meta.url))); // 仓库根目录（脚本在 delivery-mcp-server/ 中，取其父目录）
const AGENT_PREFIX = 'delivery-';

// ---------- 参数解析 ----------
const args = process.argv.slice(2);
function takeValue(flag) {
  const i = args.indexOf(flag);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args.splice(i, 2)[1];
  return null;
}
let repoPath = takeValue('--repo') ?? SCRIPT_DIR;
const tempDirs = []; // 本次运行创建的临时目录，安装成功后统一清理
const targetArg = args.find((a) => !a.startsWith('--'));
const targetDir = targetArg ?? process.cwd();
const FLAG_DRY = args.includes('--dry-run');
const FLAG_FORCE = args.includes('--force');
const FLAG_FORCE_UPDATE = args.includes('--force-update'); // 强制覆盖已安装文件（不比较版本）
const FLAG_RELEASE = args.includes('--release');
const FLAG_DASH = args.includes('--dashboard'); // 显式开启才后台启动看板（默认不自动启动）
const FLAG_STOP_DASH = args.includes('--stop-dashboard'); // 仅停止看板进程，不执行安装

const GITHUB_OWNER = 'baiyulong';
const GITHUB_REPO = 'ai-multiple-agent-delivery-system';

// ---------- 工具 ----------
const log = (msg) => console.log(msg);
const ok = (msg) => console.log(`  ✓ ${msg}`);
const skip = (msg) => console.log(`  - ${msg}（已存在，跳过）`);
const warn = (msg) => console.log(`  ! ${msg}`);

function run(cmd, cwd) {
  // 命令为脚本内固定字符串，拼成完整命令交给 shell 执行（Windows/Linux 通用，避免 DEP0190 警告）
  return new Promise((resolve, reject) => {
    const child = spawn(`npm ${cmd}`, { cwd, stdio: 'inherit', shell: true });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`npm ${cmd} 退出码 ${code}`))));
  });
}

async function readJsonSafe(file) {
  try {
    return JSON.parse(await readFile(file, 'utf-8'));
  } catch {
    return null;
  }
}

/** 简单 semver 比较：按 '.' 分段数字比较。返回 >0 表示 a>b */
function compareVersions(a, b) {
  const pa = String(a).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** 读取目录下 package.json 的 version，失败返回 null */
async function readPackageVersion(dir) {
  try {
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf-8'));
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

async function gitIgnoreAdd(file, lines) {
  let content = '';
  if (existsSync(file)) content = await readFile(file, 'utf-8');
  const existing = new Set(content.split(/\r?\n/).filter(Boolean));
  const toAdd = lines.filter((l) => !existing.has(l));
  if (toAdd.length === 0) return false;
  if (FLAG_DRY) {
    log(`  - 将追加到 .gitignore：${toAdd.join('、')}`);
    return false;
  }
  const sep = content && !content.endsWith('\n') ? '\n' : '';
  await writeFile(file, content + sep + toAdd.join('\n') + '\n', 'utf-8');
  return true;
}

async function copyDirSafe(src, dest) {
  if (!FLAG_DRY) await mkdir(dest, { recursive: true });
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    // 跳过工具自身会重新生成的目录/构建产物
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === '.git') continue;
    const s = join(src, ent.name);
    const d = join(dest, ent.name);
    if (FLAG_DRY) {
      log(`  - 将拷贝 ${ent.name}${ent.isDirectory() ? '/' : ''}`);
      continue;
    }
    await cp(s, d, { recursive: true, force: false });
  }
}

// ---------- 停止目标项目中运行中的进程 ----------
async function stopTargetProcesses(targetDir) {
  log('\n[1/5] 停止目标项目中运行中的进程');

  // 读取 dashboard.port 获取端口
  let dashboardPort = '8787';
  try {
    const portFile = join(targetDir, '.delivery', 'dashboard.port');
    const portContent = await readFile(portFile, 'utf-8');
    dashboardPort = portContent.trim() || '8787';
  } catch {
    // 使用默认端口
  }

  let stopped = false;

  if (process.platform === 'win32') {
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn('netstat', ['-ano'], { shell: true });
        let output = '';
        child.stdout?.on('data', (d) => (output += d));
        child.on('exit', () => resolve(output));
        child.on('error', reject);
      });

      const lines = result.split('\n');
      for (const line of lines) {
        if (line.includes(`:${dashboardPort}`) && (line.includes('LISTENING') || line.includes('ESTABLISHED'))) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') {
            log(`  停止 dashboard 进程 (PID: ${pid}, 端口: ${dashboardPort})`);
            if (!FLAG_DRY) {
              spawn('taskkill', ['/F', '/PID', pid], { shell: true, stdio: 'ignore' });
              stopped = true;
            }
          }
        }
      }

      // 停止 MCP server 进程
      const result2 = await new Promise((resolve, reject) => {
        const child = spawn('wmic', ['process', 'where', 'commandline like "%delivery-mcp-server%"', 'get', 'processid'], { shell: true });
        let output = '';
        child.stdout?.on('data', (d) => (output += d));
        child.on('exit', () => resolve(output));
        child.on('error', reject);
      });

      const lines2 = result2.split('\n').slice(1);
      for (const line of lines2) {
        const pid = line.trim();
        if (pid && /^\d+$/.test(pid)) {
          log(`  停止 MCP server 进程 (PID: ${pid})`);
          if (!FLAG_DRY) {
            spawn('taskkill', ['/F', '/PID', pid], { shell: true, stdio: 'ignore' });
            stopped = true;
          }
        }
      }
    } catch {
      // 忽略错误
    }
  } else {
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn('sh', ['-c', `lsof -ti:${dashboardPort}`], { stdio: ['ignore', 'pipe', 'ignore'] });
        let output = '';
        child.stdout?.on('data', (d) => (output += d));
        child.on('exit', () => resolve(output));
        child.on('error', reject);
      });

      const pids = result.trim().split('\n').filter(Boolean);
      for (const pid of pids) {
        log(`  停止 dashboard 进程 (PID: ${pid}, 端口: ${dashboardPort})`);
        if (!FLAG_DRY) {
          spawn('kill', ['-9', pid], { stdio: 'ignore' });
          stopped = true;
        }
      }

      // 停止 MCP server 进程
      const result2 = await new Promise((resolve, reject) => {
        const child = spawn('sh', ['-c', 'ps aux | grep "delivery-mcp-server/dist/server.js" | grep -v grep | awk \'{print $2}\''], { stdio: ['ignore', 'pipe', 'ignore'] });
        let output = '';
        child.stdout?.on('data', (d) => (output += d));
        child.on('exit', () => resolve(output));
        child.on('error', reject);
      });

      const pids2 = result2.trim().split('\n').filter(Boolean);
      for (const pid of pids2) {
        log(`  停止 MCP server 进程 (PID: ${pid})`);
        if (!FLAG_DRY) {
          spawn('kill', ['-9', pid], { stdio: 'ignore' });
          stopped = true;
        }
      }
    } catch {
      // 忽略错误
    }
  }

  if (stopped) ok('进程已停止');
  else skip('未发现运行中的进程');
}

// ---------- 后台启动看板（detached，避免被前台命令超时误杀） ----------
async function startDashboardDetached(serverDir, projectRoot) {
  const logFile = join(projectRoot, '.delivery', 'dashboard.log');
  try {
    await mkdir(dirname(logFile), { recursive: true });
  } catch {
    // 忽略
  }
  const out = createWriteStream(logFile, { flags: 'a' });
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dashboard'], {
    cwd: serverDir,
    detached: true,
    stdio: ['ignore', out, out],
    shell: process.platform === 'win32',
  });
  child.unref();
  child.on('error', (e) => warn(`看板进程启动失败：${e.message}（日志：${logFile}）`));

  // 探测端口确认启动成功（dashboard 启动后写入 <root>/.delivery/dashboard.port）
  const port = await waitForDashboardPort(projectRoot, 10000);
  if (port) {
    ok(`看板已后台启动：http://localhost:${port}（日志：${logFile}）`);
  } else {
    warn(`看板进程已后台启动，但 10 秒内未检测到端口监听（日志：${logFile}）。可手动运行 cd delivery-mcp-server && npm run dashboard 排查。`);
  }
}

/** 轮询 <root>/.delivery/dashboard.port，端口就绪时返回，超时返回 null */
async function waitForDashboardPort(projectRoot, timeoutMs) {
  const portFile = join(projectRoot, '.delivery', 'dashboard.port');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const content = (await readFile(portFile, 'utf-8')).trim();
      const port = parseInt(content, 10);
      if (Number.isFinite(port) && port > 0) return port;
    } catch {
      // 文件尚未写入
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

// ---------- 停止看板进程（--stop-dashboard） ----------
async function stopDashboardProcess(targetDir) {
  let dashboardPort = '8787';
  try {
    const portContent = await readFile(join(targetDir, '.delivery', 'dashboard.port'), 'utf-8');
    dashboardPort = portContent.trim() || '8787';
  } catch {
    // 使用默认端口
  }

  let stopped = false;
  if (process.platform === 'win32') {
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn('netstat', ['-ano'], { shell: true });
        let output = '';
        child.stdout?.on('data', (d) => (output += d));
        child.on('exit', () => resolve(output));
        child.on('error', reject);
      });
      for (const line of result.split('\n')) {
        if (line.includes(`:${dashboardPort}`) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') {
            log(`  停止 dashboard 进程 (PID: ${pid}, 端口: ${dashboardPort})`);
            spawn('taskkill', ['/F', '/PID', pid], { shell: true, stdio: 'ignore' });
            stopped = true;
          }
        }
      }
    } catch {
      // 忽略错误
    }
  } else {
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn('sh', ['-c', `lsof -ti:${dashboardPort}`], { stdio: ['ignore', 'pipe', 'ignore'] });
        let output = '';
        child.stdout?.on('data', (d) => (output += d));
        child.on('exit', () => resolve(output));
        child.on('error', reject);
      });
      const pids = result.trim().split('\n').filter(Boolean);
      for (const pid of pids) {
        log(`  停止 dashboard 进程 (PID: ${pid}, 端口: ${dashboardPort})`);
        spawn('kill', ['-9', pid], { stdio: 'ignore' });
        stopped = true;
      }
    } catch {
      // 忽略错误
    }
  }

  if (stopped) ok('dashboard 已停止');
  else skip(`未发现端口 ${dashboardPort} 上运行中的 dashboard`);
}

// ---------- 0. 从 GitHub Release 下载（可选） ----------
async function downloadFromRelease() {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
  log(`\n[0] 从 GitHub Release 下载最新稳定版`);
  log(`    仓库：${GITHUB_OWNER}/${GITHUB_REPO}`);

  let tag;
  try {
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'delivery-install' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) {
      warn('尚无 Release，请稍后重试或改用 git clone 源码安装。');
      return null;
    }
    if (!res.ok) throw new Error(`GitHub API 响应 ${res.status}`);
    const data = await res.json();
    if (!data || typeof data.tag_name !== 'string') throw new Error('Release 缺少 tag_name');
    tag = data.tag_name;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warn(`获取 Release 信息失败：${msg}。请检查网络或改用 --repo 指定本地路径。`);
    return null;
  }

  const archiveUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/archive/refs/tags/${tag}.tar.gz`;
  const tmpDir = join(tmpdir(), `delivery-install-${Date.now()}`);
  if (!FLAG_DRY) tempDirs.push(tmpDir);
  const archiveFile = join(tmpDir, 'release.tar.gz');

  if (!FLAG_DRY) await mkdir(tmpDir, { recursive: true });

  try {
    log(`    版本：${tag}`);
    log(`    下载：${archiveUrl}`);
    const res = await fetch(archiveUrl, {
      headers: { 'User-Agent': 'delivery-install' },
      signal: AbortSignal.timeout(60000),
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (FLAG_DRY) {
      log(`  - 将下载 ${buf.length} 字节到 ${archiveFile}`);
    } else {
      await writeFile(archiveFile, buf);
      ok(`已下载 ${buf.length} 字节`);
    }
  } catch (e) {
    warn(`下载失败：${e instanceof Error ? e.message : String(e)}`);
    return null;
  }

  // 解压
  const extractDir = join(tmpDir, 'extracted');
  if (FLAG_DRY) {
    log(`  - 将解压到 ${extractDir}`);
  } else {
    await mkdir(extractDir, { recursive: true });
    try {
      await new Promise((resolve, reject) => {
        const child = spawn('tar', ['-xzf', archiveFile, '-C', extractDir], { stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tar 退出码 ${code}`))));
      });
      ok('解压完成');
    } catch (e) {
      warn(`解压失败：${e instanceof Error ? e.message : String(e)}。请手动下载 Release 包并解压后用 --repo 指定路径。`);
      return null;
    }
  }

  // GitHub 解压后目录名可能是 {repo}-{tag}（tag 带 v，如 v0.2.11），也可能是
  // {repo}-{tag去掉v}（如 0.2.11）。不猜名字，直接扫描解压目录下
  // 含 delivery-mcp-server/package.json 的子目录，兼容任意命名格式。
  if (FLAG_DRY) {
    log(`  - 解压目录：${extractDir} 下含 delivery-mcp-server 的子目录`);
    return join(extractDir, `${GITHUB_REPO}-${tag.replace(/^v/i, '')}`);
  }
  const { readdir } = await import('node:fs/promises');
  let entries = [];
  try {
    entries = await readdir(extractDir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  const found = entries.find(
    (e) => e.isDirectory() && existsSync(join(extractDir, e.name, 'delivery-mcp-server', 'package.json')),
  );
  if (!found) {
    warn(`解压后未找到含 delivery-mcp-server 的目录（${extractDir}）。请手动下载 Release 包解压后用 --repo 指定路径。`);
    return null;
  }
  const extractedPath = join(extractDir, found.name);
  ok(`源码路径：${extractedPath}`);
  return extractedPath;
}

// ---------- 1. 校验目标目录 ----------
log('\nAI 交付任务系统安装');
log('====================');

if (FLAG_DRY) log('（dry-run 模式：仅预览，不改动任何文件）\n');

// --stop-dashboard：仅停止看板，不执行安装
if (FLAG_STOP_DASH) {
  await stopDashboardProcess(targetDir);
  process.exit(0);
}

// --dashboard 且当前项目已安装：原地后台启动看板，不重复安装
// （区分"首次安装"与"更新/看板管理"场景，允许在当前目录执行）
if (
  FLAG_DASH &&
  !FLAG_RELEASE &&
  repoPath === SCRIPT_DIR &&
  existsSync(join(targetDir, 'delivery-mcp-server', 'package.json'))
) {
  log('\n[看板] 当前项目已安装 delivery-mcp-server，直接后台启动看板');
  await startDashboardDetached(join(targetDir, 'delivery-mcp-server'), targetDir);
  process.exit(0);
}

// 从 GitHub Release 下载（可选）
if (FLAG_RELEASE) {
  const releasePath = await downloadFromRelease();
  if (releasePath) {
    repoPath = releasePath;
  } else if (!FLAG_DRY) {
    console.error('\nRelease 下载失败，无法继续安装。请检查网络或改用 --repo 指定本地路径。\n');
    process.exit(1);
  }
}

const [repoReal, targetReal] = await Promise.all([
  realpath(repoPath).catch(() => repoPath),
  realpath(targetDir).catch(() => targetDir),
]);
if (repoReal === targetReal) {
  console.error('\n错误：目标目录就是当前项目自身。');
  console.error('  若要从源码安装到其他项目，请指定目标目录：node delivery-mcp-server/install.js /path/to/project');
  console.error('  若要更新当前项目，请使用 --release：node delivery-mcp-server/install.js --release\n');
  process.exit(1);
}

const hasGit = existsSync(join(targetReal, '.git'));
if (!hasGit && !FLAG_FORCE) {
  console.error(`\n错误：${targetReal} 不是 git 仓库。交付系统建议在 git 项目中安装（.gitignore 保护敏感配置）。\n如确实要在非 git 目录使用，请加 --force。\n`);
  process.exit(1);
}

// ---------- 1.5 停止运行中的进程（更新时避免文件锁定） ----------
if (existsSync(join(targetReal, 'delivery-mcp-server'))) {
  await stopTargetProcesses(targetReal);
}

// ---------- 2. 拷贝 delivery-mcp-server ----------
log(`\n[1/6] 拷贝 delivery-mcp-server → ${targetReal}`);
const srcServer = join(repoReal, 'delivery-mcp-server');
const dstServer = join(targetReal, 'delivery-mcp-server');
if (existsSync(srcServer)) {
  if (existsSync(dstServer)) {
    // 判断是否需要覆盖更新：--release 更新、--force-update 强制覆盖、
    // 或本地版本低于源码版本（自动更新，解决"已存在则跳过"导致版本不更新）
    let shouldUpdate = FLAG_RELEASE || FLAG_FORCE_UPDATE;
    let versionNote = '';
    if (!shouldUpdate) {
      const localVer = await readPackageVersion(dstServer);
      const srcVer = await readPackageVersion(srcServer);
      if (localVer && srcVer && compareVersions(srcVer, localVer) > 0) {
        shouldUpdate = true;
        versionNote = `（本地 ${localVer} → ${srcVer}）`;
      }
    }
    if (shouldUpdate) {
      // 更新模式：直接删除旧版后拷贝新版本（进程已在 1.5 停止，避免文件锁定）
      if (!FLAG_DRY) {
        await rm(dstServer, { recursive: true, force: true });
      } else {
        log(`  - 将删除旧版 ${dstServer} 并拷贝新版`);
      }
      await copyDirSafe(srcServer, dstServer);
      ok('delivery-mcp-server 已更新' + versionNote);
    } else {
      skip('delivery-mcp-server');
      if (!existsSync(join(dstServer, 'package.json'))) {
        warn('目标目录的 delivery-mcp-server 不完整（缺少 package.json），建议删除后重装。');
      }
    }
  } else {
    await copyDirSafe(srcServer, dstServer);
    ok('delivery-mcp-server 已拷贝');
  }
} else {
  warn(`仓库路径下未找到 delivery-mcp-server（${srcServer}），请用 --repo 指定正确的仓库路径。`);
}

// ---------- 3. 拷贝 agent 配置（只新增 delivery-*） ----------
log(`\n[2/6] 拷贝角色 Agent 配置（仅 delivery-* 前缀${FLAG_RELEASE ? '，更新模式覆盖已有文件' : '，不覆盖已有文件'}）`);
const srcAgents = join(repoReal, '.opencode', 'agent');
const dstAgents = join(targetReal, '.opencode', 'agent');
if (existsSync(srcAgents)) {
  if (!FLAG_DRY) await mkdir(dstAgents, { recursive: true });
  const { readdir } = await import('node:fs/promises');
  let files = await readdir(srcAgents);
  files = files.filter((f) => f.endsWith('.md') && f.startsWith(AGENT_PREFIX));
  let copied = 0;
  for (const f of files) {
    const dst = join(dstAgents, f);
    if (existsSync(dst) && !FLAG_RELEASE) {
      skip(`agent/${f}`);
    } else if (FLAG_DRY) {
      log(`  - 将拷贝 agent/${f}${existsSync(dst) ? '（覆盖）' : ''}`);
    } else {
      await cp(join(srcAgents, f), dst, { force: true });
      copied++;
    }
  }
  if (FLAG_DRY) ok(`将拷贝 ${files.length} 个角色 Agent（delivery-*.md）`);
  else if (copied === 0) ok('已是最新（所有 delivery-*.md 均已存在）');
  else ok(`已拷贝 ${copied} 个角色 Agent（delivery-*.md）`);
} else {
  warn(`仓库路径下未找到 .opencode/agent（${srcAgents}）`);
}

// ---------- 4. 合并 opencode.json ----------
log(`\n[3/6] 注册 MCP 到 opencode.json（合并，保留已有配置）`);
const opencodeFile = join(targetReal, 'opencode.json');
const opencodeConfig = (await readJsonSafe(opencodeFile)) ?? {};
const hasDeliveryMcp = !!(opencodeConfig.mcp && opencodeConfig.mcp.delivery);
if (hasDeliveryMcp) {
  skip('opencode.json 中已存在 mcp.delivery');
} else {
  const delivery = {
    type: 'local',
    command: ['node', 'delivery-mcp-server/dist/server.js'],
    enabled: true,
  };
  if (FLAG_DRY) {
    log('  - 将写入 mcp.delivery = ' + JSON.stringify(delivery));
  } else {
    opencodeConfig.mcp = opencodeConfig.mcp ?? {};
    opencodeConfig.mcp.delivery = delivery;
    if (!opencodeConfig.$schema) opencodeConfig.$schema = 'https://opencode.ai/config.json';
    await writeFile(opencodeFile, JSON.stringify(opencodeConfig, null, 2) + '\n', 'utf-8');
    ok('mcp.delivery 已合并写入 opencode.json');
  }
}

// ---------- 5. .gitignore ----------
log(`\n[4/6] 追加 .gitignore（忽略工具本体 + 邮件授权码）`);
const gitignoreFile = join(targetReal, '.gitignore');
await gitIgnoreAdd(gitignoreFile, ['delivery-mcp-server']);
ok('.gitignore 已处理（若此前无条目）');

// ---------- 6. npm install + build ----------
log(`\n[5/6] 安装依赖并构建（npm install && npm run build）`);
if (!FLAG_DRY && existsSync(dstServer)) {
  try {
    await run('install', dstServer);
    await run('run build', dstServer);
    ok('构建完成：delivery-mcp-server/dist/server.js');
  } catch (e) {
    warn(`依赖安装/构建失败：${e.message}。可稍后在 ${dstServer} 手动执行 npm install && npm run build。`);
  }
} else if (FLAG_DRY) {
  log('  - 将执行 npm install && npm run build（delivery-mcp-server 目录）');
}

// ---------- 7. 可选启动看板 ----------
if (FLAG_DASH && !FLAG_DRY && existsSync(dstServer)) {
  log(`\n[6/6] 后台启动浏览器任务看板（--dashboard）`);
  await startDashboardDetached(dstServer, targetReal);
} else if (FLAG_DRY && FLAG_DASH) {
  log('  - 将后台启动看板（--dashboard）');
} else {
  log('\n[6/6] 完成');
}

// ---------- 清理临时文件（任何模式：安装成功后统一清理） ----------
if (!FLAG_DRY) {
  for (const dir of tempDirs) {
    try {
      await rm(dir, { recursive: true, force: true });
      ok(`已清理临时目录：${dir}`);
    } catch {
      // 清理失败不影响安装结果
    }
  }
}

// ---------- 后续指引 ----------
log(`
安装完成。接下来：
1. 重启 OpenCode（加载新 agent 与 MCP 配置，MCP server 会随之启动）
2. 配置当前人：   user.set  { "name": "你的姓名", "email": "your@email.com" }
3. 配置团队名册： team.set  { "name": "你的姓名", "email": "your@email.com", "roles": ["..."] }
   （全部成员 roles 并集需覆盖 8 个角色）
4. 可选配置邮件： email.set { "user": "your@qq.com", "pass": "SMTP 授权码" }  ← 只填邮箱+授权码即可
5. 选择 delivery-orchestrator Agent 开始交付任务

启动看板：
  node delivery-mcp-server/install.js --dashboard   # 后台启动（推荐）
  cd delivery-mcp-server && npm run dashboard        # 前台启动
  →  http://localhost:8787
停止看板：
  node delivery-mcp-server/install.js --stop-dashboard
  cd delivery-mcp-server && npm run dashboard:stop
`);

if (FLAG_DRY) {
  log('（dry-run 结束：以上为将要执行的操作，未改动任何文件）');
}
