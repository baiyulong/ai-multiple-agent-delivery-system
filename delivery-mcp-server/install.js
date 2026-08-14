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
 *   node install.js --lang en            # 指定安装语言 zh/en（默认 zh；更新时自动沿用原语言）
 *   node install.js --dry-run            # 只打印将要执行的操作，不改动文件
 *   node install.js --force              # 目标目录不是 git 仓库时也继续
 *
 * 安全性：
 *   - 拒绝把本仓库自身当作安装目标
 *   - agent 文件只新增 delivery-*.md，绝不覆盖目标项目已有文件
 *   - opencode.json 只合并新增 mcp.delivery，保留目标项目全部字段
 *   - .gitignore 幂等追加（忽略工具本体 delivery-mcp-server；邮件配置属当前用户个人，存于用户主目录，不进项目仓库）
 */
import { cp, mkdir, readFile, realpath, writeFile, rm, readdir, readlink } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, sep } from 'node:path';
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
const FLAG_LANG = takeValue('--lang'); // 安装语言：zh | en（省略时交互询问或沿用已安装语言）——必须在 targetArg 之前解析，避免 en 被当作目标目录
const targetArg = args.find((a) => !a.startsWith('--'));
const targetDir = targetArg ?? process.cwd();
const FLAG_DRY = args.includes('--dry-run');
const FLAG_FORCE = args.includes('--force');
const FLAG_FORCE_UPDATE = args.includes('--force-update'); // 强制覆盖已安装文件（不比较版本）
const FLAG_RELEASE = args.includes('--release');
const FLAG_DASH = args.includes('--dashboard'); // 显式开启才后台启动看板（默认不自动启动）
const FLAG_STOP_DASH = args.includes('--stop-dashboard'); // 仅停止看板进程，不执行安装
const FLAG_SKIP_BUILD = args.includes('--skip-build'); // 跳过 npm run build（断点续跑：拷贝/依赖完成但构建中断后重跑）

const GITHUB_OWNER = 'baiyulong';
const GITHUB_REPO = 'ai-multiple-agent-delivery-system';
const VALID_LANGS = ['zh', 'en'];

// ---------- 语言选择 ----------
/** 解析安装语言：--lang 参数 > 已安装语言（.install-lang 或 active.json）> 交互询问 > 默认 zh */
async function resolveInstallLang() {
  if (FLAG_LANG) {
    if (VALID_LANGS.includes(FLAG_LANG)) return FLAG_LANG;
    warn(`无效的 --lang 值 "${FLAG_LANG}"（仅支持 zh/en），回退到 zh。`);
    return 'zh';
  }
  // 更新场景：沿用目标项目已安装的语言
  try {
    const stored = (await readFile(join(targetReal, '.install-lang'), 'utf-8')).trim();
    if (VALID_LANGS.includes(stored)) return stored;
  } catch {
    // 首次安装，无记忆文件
  }
  try {
    const active = await readJsonSafe(join(targetReal, 'delivery-mcp-server', 'config', 'lang', 'active.json'));
    if (active && VALID_LANGS.includes(active.lang)) return active.lang;
  } catch {
    // 无 active.json，继续
  }
  // 首次安装且非 dry-run：交互询问（非 TTY 或 dry-run 时用默认 zh）
  if (!FLAG_DRY && process.stdin.isTTY) {
    const { createInterface } = await import('node:readline/promises');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const ans = (await rl.question('安装语言 / Install language（zh / en，回车默认 zh）：')).trim().toLowerCase();
      if (VALID_LANGS.includes(ans)) return ans;
    } catch {
      // 输入中断，用默认
    } finally {
      rl.close();
    }
  }
  return 'zh';
}

/** 在已拷贝的 delivery-mcp-server 中写入 active.json，并删除另一语言的内置资源（单语言安装） */
async function applyLanguage(serverDir, lang) {
  const other = lang === 'zh' ? 'en' : 'zh';
  const activeFile = join(serverDir, 'config', 'lang', 'active.json');
  const removeTargets = [
    join(serverDir, 'config', 'gates', other),
    join(serverDir, 'config', 'architectures', other),
    join(serverDir, 'templates', other),
    join(serverDir, 'config', 'lang', `${other}.json`),
  ];
  if (FLAG_DRY) {
    log(`  - 将写入 ${activeFile}（{"lang": "${lang}"}）`);
    for (const t of removeTargets) log(`  - 将删除另一语言资源：${t}`);
    return;
  }
  await mkdir(dirname(activeFile), { recursive: true });
  await writeFile(activeFile, JSON.stringify({ lang }, null, 2) + '\n', 'utf-8');
  for (const t of removeTargets) {
    await rm(t, { recursive: true, force: true }).catch(() => {});
  }
  ok(`已写入安装语言 active.json（${lang}）并清理另一语言内置资源`);
}

// ---------- 工具 ----------
const log = (msg) => console.log(msg);
const ok = (msg) => console.log(`  ✓ ${msg}`);
const skip = (msg) => console.log(`  - ${msg}（已存在，跳过）`);
const warn = (msg) => console.log(`  ! ${msg}`);

function run(cmd, cwd, env = {}) {
  // 命令为脚本内固定字符串，拼成完整命令交给 shell 执行（Windows/Linux 通用，避免 DEP0190 警告）
  return new Promise((resolve, reject) => {
    const child = spawn(`npm ${cmd}`, { cwd, stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
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
    // 跳过任意层级下的 node_modules（如 web/node_modules），避免把依赖目录拷贝进目标
    await cp(s, d, {
      recursive: true,
      force: false,
      filter: (p) => !p.split(sep).includes('node_modules'),
    });
  }
}

/** 跨平台：按端口查找监听进程 PID 列表（Linux 优先 /proc 零依赖解析，再兜底 ss/lsof/fuser） */
async function findPidsByPort(port) {
  const pids = new Set();

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
        if (line.includes(`:${port}`) && (line.includes('LISTENING') || line.includes('ESTABLISHED'))) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') pids.add(pid);
        }
      }
      return [...pids];
    } catch {
      return [];
    }
  }

  // Linux：优先直接解析 /proc/net/tcp + /proc/*/fd 的 socket inode 映射，不依赖 lsof
  if (process.platform === 'linux') {
    try {
      const hexPort = parseInt(port, 10).toString(16).toUpperCase();
      const wantedInodes = new Set();
      for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) {
        let text = '';
        try {
          text = await readFile(f, 'utf-8');
        } catch {
          continue;
        }
        for (const line of text.split('\n').slice(1)) {
          // 列: sl local_address rem_address st ... inode
          const cols = line.trim().split(/\s+/);
          if (cols.length < 10) continue;
          const local = cols[1]; // 形如 0100007F:2251 或 0000000000000000FFFF00000100007F:2251
          const st = cols[3]; // 0A = LISTEN
          if (st !== '0A') continue;
          const portPart = local.split(':').pop();
          if (portPart === hexPort) wantedInodes.add(cols[9]);
        }
      }
      if (wantedInodes.size > 0) {
        const procEntries = await readdir('/proc');
        for (const pid of procEntries) {
          if (!/^\d+$/.test(pid)) continue;
          try {
            const fdEntries = await readdir(`/proc/${pid}/fd`);
            for (const fd of fdEntries) {
              try {
                const link = await readlink(`/proc/${pid}/fd/${fd}`);
                const m = link.match(/^socket:\[(\d+)\]$/);
                if (m && wantedInodes.has(m[1])) {
                  pids.add(pid);
                  break;
                }
              } catch {
                // 忽略单 fd 读取失败
              }
            }
          } catch {
            // 忽略单进程 fd 目录读取失败（权限/已退出）
          }
        }
      }
    } catch {
      // 忽略 /proc 解析失败
    }
    if (pids.size > 0) return [...pids];
    // 兜底：ss / lsof / fuser
    for (const cmd of [`ss -tlnp 'sport = :${port}'`, `lsof -ti:${port}`, `fuser ${port}/tcp`]) {
      try {
        const result = await new Promise((resolve, reject) => {
          const child = spawn('sh', ['-c', cmd], { stdio: ['ignore', 'pipe', 'ignore'] });
          let output = '';
          child.stdout?.on('data', (d) => (output += d));
          child.on('exit', () => resolve(output));
          child.on('error', reject);
        });
        const found = result.trim().split('\n').filter(Boolean);
        if (found.length > 0) {
          found.forEach((p) => pids.add(String(p).trim()));
          return [...pids];
        }
      } catch {
        // 继续尝试下一个命令
      }
    }
    return [];
  }

  // macOS 等 Unix：lsof 通常可用
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', `lsof -ti:${port}`], { stdio: ['ignore', 'pipe', 'ignore'] });
      let output = '';
      child.stdout?.on('data', (d) => (output += d));
      child.on('exit', () => resolve(output));
      child.on('error', reject);
    });
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// ---------- 停止目标项目中运行中的进程 ----------
/** 执行命令并返回 stdout（shell:false，避免 DEP0190 弃用警告与参数展开问题） */
function runCapture(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: false, stdio: ['ignore', 'pipe', 'ignore'], ...opts });
    let output = '';
    child.stdout?.on('data', (d) => (output += d));
    child.on('exit', () => resolve(output));
    child.on('error', reject);
  });
}

/**
 * Windows：按命令行关键字查找进程 PID（PowerShell Get-CimInstance，避免 wmic 的
 * `%` 通配符被 cmd 环境变量展开为空、以及 wmic 在新版 Windows 废弃的问题）。
 */
async function findPidsByCommandLineWin(keyword) {
  try {
    // 命令行含引号时按普通字符匹配，关键字为脚本内固定串，无注入风险
    const script = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${keyword}*' } | Select-Object -ExpandProperty ProcessId`;
    const out = await runCapture('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s));
  } catch {
    return [];
  }
}

/** Windows：按端口查找占用进程 PID（netstat 输出去重，避免同一 PID 重复 kill） */
async function findPidsByPortWin(port) {
  try {
    const out = await runCapture('netstat', ['-ano']);
    const pids = new Set();
    for (const line of out.split('\n')) {
      if (line.includes(`:${port}`) && (line.includes('LISTENING') || line.includes('ESTABLISHED'))) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') pids.add(pid);
      }
    }
    return [...pids];
  } catch {
    return [];
  }
}

/** 按 PID 杀进程（Windows taskkill / 其他 kill -9） */
function killPid(pid) {
  if (FLAG_DRY) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/F', '/PID', pid], { shell: false, stdio: 'ignore' });
  } else {
    spawn('kill', ['-9', pid], { stdio: 'ignore' });
  }
}

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
      // 停止 dashboard 进程（按端口，PID 去重）
      const dashPids = await findPidsByPortWin(dashboardPort);
      for (const pid of dashPids) {
        log(`  停止 dashboard 进程 (PID: ${pid}, 端口: ${dashboardPort})`);
        killPid(pid);
        stopped = true;
      }

      // 停止 MCP server 进程（按命令行关键字，PowerShell 精确匹配避免误杀安装脚本）
      const mcpPids = await findPidsByCommandLineWin('delivery-mcp-server/dist/server.js');
      for (const pid of mcpPids) {
        log(`  停止 MCP server 进程 (PID: ${pid})`);
        killPid(pid);
        stopped = true;
      }
    } catch {
      // 忽略错误
    }
  } else {
    try {
      const dashboardPids = await findPidsByPort(dashboardPort);
      for (const pid of dashboardPids) {
        log(`  停止 dashboard 进程 (PID: ${pid}, 端口: ${dashboardPort})`);
        killPid(pid);
        stopped = true;
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
        killPid(pid);
        stopped = true;
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
  // 注意：stdio 数组不能直接传流对象（未打开前 fd 为空会抛 ERR_INVALID_ARG_VALUE），
  // 改用 'pipe' 并在子进程输出上手动 pipe 到日志文件。
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dashboard'], {
    cwd: serverDir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
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
      const dashPids = await findPidsByPortWin(dashboardPort);
      for (const pid of dashPids) {
        log(`  停止 dashboard 进程 (PID: ${pid}, 端口: ${dashboardPort})`);
        killPid(pid);
        stopped = true;
      }
    } catch {
      // 忽略错误
    }
  } else {
    try {
      const dashboardPids = await findPidsByPort(dashboardPort);
      for (const pid of dashboardPids) {
        log(`  停止 dashboard 进程 (PID: ${pid}, 端口: ${dashboardPort})`);
        killPid(pid);
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
    // gzip 魔数校验：防止拿到 HTML 错误页 / 被 PowerShell curl 别名损坏的文件
    if (buf.length < 2 || buf[0] !== 0x1f || buf[1] !== 0x8b) {
      const preview = buf.length > 120 ? buf.subarray(0, 120).toString('utf-8') : buf.toString('utf-8');
      throw new Error(`下载内容不是有效的 gzip（前 2 字节 0x${buf.length ? buf[0].toString(16) : '?'} 0x${buf.length > 1 ? buf[1].toString(16) : '?'}）。内容预览：${preview.slice(0, 80)}`);
    }
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

// ---------- 1.4 确定安装语言 ----------
const installLang = await resolveInstallLang();
log(`\n安装语言 / Language：${installLang === 'zh' ? '中文 (zh)' : 'English (en)'}`);

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

// ---------- 2.5 应用安装语言（单语言安装） ----------
log(`\n[语言] 应用安装语言：${installLang}`);
if (FLAG_DRY) {
  log(`  - 将在 ${dstServer} 写入 config/lang/active.json（{"lang": "${installLang}"}）`);
  log(`  - 将删除另一语言内置资源：config/gates/${installLang === 'zh' ? 'en' : 'zh'}/、config/architectures/${installLang === 'zh' ? 'en' : 'zh'}/、templates/${installLang === 'zh' ? 'en' : 'zh'}/、config/lang/${installLang === 'zh' ? 'en' : 'zh'}.json`);
  log(`  - 将写入语言记忆文件 ${join(targetReal, '.install-lang')}`);
} else if (existsSync(dstServer)) {
  await applyLanguage(dstServer, installLang);
  await writeFile(join(targetReal, '.install-lang'), installLang + '\n', 'utf-8').catch(() => {});
} else {
  warn(`未找到 ${dstServer}，跳过语言配置。`);
}

// ---------- 3. 拷贝 agent 配置（只新增 delivery-*） ----------
log(`\n[2/6] 拷贝角色 Agent 配置（delivery-*.${installLang}.md → delivery-*.md${FLAG_RELEASE ? '，更新模式覆盖已有文件' : '，不覆盖已有文件'}）`);
const srcAgents = join(repoReal, '.opencode', 'agent');
const dstAgents = join(targetReal, '.opencode', 'agent');
if (existsSync(srcAgents)) {
  if (!FLAG_DRY) await mkdir(dstAgents, { recursive: true });
  const { readdir } = await import('node:fs/promises');
  let files = await readdir(srcAgents);
  files = files.filter((f) => f.endsWith('.md') && f.startsWith(AGENT_PREFIX) && f.includes(`.${installLang}.md`));
  let copied = 0;
  for (const f of files) {
    // 去掉语言后缀：delivery-orchestrator.zh.md → delivery-orchestrator.md
    const dstName = f.replace(`.${installLang}.md`, '.md');
    const dst = join(dstAgents, dstName);
    if (existsSync(dst) && !FLAG_RELEASE) {
      skip(`agent/${dstName}`);
    } else if (FLAG_DRY) {
      log(`  - 将拷贝 agent/${dstName}${existsSync(dst) ? '（覆盖）' : ''}`);
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
log(`\n[4/6] 追加 .gitignore（忽略工具本体 delivery-mcp-server 与安装语言记忆文件）`);
const gitignoreFile = join(targetReal, '.gitignore');
await gitIgnoreAdd(gitignoreFile, ['delivery-mcp-server', '.install-lang']);
ok('.gitignore 已处理（若此前无条目）');

// ---------- 6. npm install + build ----------
log(`\n[5/6] 安装依赖并构建（npm install && npm run build）`);
if (!FLAG_DRY && existsSync(dstServer)) {
  try {
    log('  - npm install（依赖安装通常需 1–3 分钟，请勿中断）...');
    await run('install', dstServer);
    if (FLAG_SKIP_BUILD) {
      log('  - 已跳过构建（--skip-build）。请稍后手动执行 npm run build，或再次运行 install.js 完成构建。');
    } else {
      log('  - npm run build（首次构建可能需 1–2 分钟，请勿中断）...');
      // VITE_LANG 注入 web 构建：构建期单语言（web 端 import.meta.env.VITE_LANG）
      await run('run build', dstServer, { VITE_LANG: installLang });
      ok('构建完成：delivery-mcp-server/dist/server.js');
    }
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
${FLAG_RELEASE ? '0. 本次为 --release 更新：旧 MCP server 进程已停止，新版本需重启 OpenCode 后才会以新代码启动（不会自动重启，请务必重启 OpenCode）\n' : ''}1. 重启 OpenCode（加载新 agent 与 MCP 配置，MCP server 会随之启动）
2. 配置当前人：   user.set  { "name": "你的姓名", "email": "your@email.com" }
3. 配置团队名册： team.set  { "name": "你的姓名", "email": "your@email.com", "roles": ["..."] }
   （全部成员 roles 并集需覆盖 8 个角色）
4. 可选配置个人邮件： email.set { "user": "your@qq.com", "pass": "SMTP 授权码" }  ← 只填邮箱+授权码即可
   （个人级，存于用户主目录，跨项目沿用，不进项目仓库）
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
