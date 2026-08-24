#!/usr/bin/env node
/**
 * AI 交付任务系统 · 一键安装脚本（Windows / Linux / macOS 通用）
 *
 * 新安装模型（用户目录 + 发布期预构建）：
 * - 工具本体全局安装到 ~/.config/ai-delivery/delivery-mcp-server/（一份，跨项目共享）
 * - 角色 Agent 全局安装到 ~/.config/opencode/agents/（项目 .opencode/agent/ 同名可覆盖）
 * - 项目内只注册：opencode.json 的 mcp.delivery（绝对路径 + DELIVERY_ROOT 环境变量）
 *   与 .gitignore 追加 .delivery/（任务数据根）
 * - --release 下载 GitHub Release 预构建 zip（dist + web-dist/{zh,en} + config + templates），
 *   安装端只执行 npm install --omit=dev，不再构建
 *
 * 用法：
 *   node delivery-mcp-server/install.js                 # 从源码仓库安装到当前目录所在项目
 *   node delivery-mcp-server/install.js /path/to/project
 *   node install.js --release                            # 从 GitHub Release 预构建包安装/更新
 *   node install.js --prerelease                         # 安装最新 prerelease 版本（含 -rc/-beta 等预发布 tag）
 *   node install.js --repo /path/to/source               # 指定本地源码路径
 *   node install.js --prebuilt /path/to/extracted-zip    # 使用本地预构建包目录（跳过下载，测试用）
 *   node install.js --no-dashboard                       # 安装后不启动浏览器看板（默认不启动）
 *   node install.js --lang en                            # 指定安装语言 zh/en（默认 zh；更新时自动沿用原语言）
 *   node install.js --dry-run                            # 只打印将要执行的操作，不改动文件
 *   node install.js --force                              # 目标目录不是 git 仓库时也继续
 *
 * 安全性：
 *   - 拒绝把本仓库自身当作安装目标
 *   - agent 文件只新增 delivery-*.md，绝不覆盖目标项目已有文件
 *   - opencode.json 只合并 mcp.delivery，保留目标项目全部字段
 *   - .gitignore 幂等追加（忽略任务数据根 .delivery/；邮件配置属当前用户个人，存于用户主目录，不进项目仓库）
 *
 * 测试用覆盖（详见 README）：
 *   DELIVERY_INSTALL_ROOT  → 工具本体全局根（默认 ~/.config/ai-delivery）
 *   DELIVERY_AGENTS_DIR    → 全局 agent 目录（默认 ~/.config/opencode/agents）
 *   DELIVERY_GITHUB_OWNER / DELIVERY_GITHUB_REPO → 覆盖 Release 下载指向（指向 fork 仓库测完整下载链路）
 *   DELIVERY_RELEASE_DIR   → 等价于 --prebuilt（本地预构建包目录，跳过下载）
 */
import { cp, mkdir, readFile, realpath, writeFile, rm, readdir, readlink } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, sep } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(dirname(fileURLToPath(import.meta.url))); // 仓库根目录（脚本在 delivery-mcp-server/ 中，取其父目录）
const AGENT_PREFIX = 'delivery-';

// 全局安装目录（可用环境变量覆盖，便于测试）：
//   DELIVERY_INSTALL_ROOT  → 工具本体根（默认 ~/.config/ai-delivery）
//   DELIVERY_AGENTS_DIR    → 全局 agent 目录（默认 ~/.config/opencode/agents）
const GLOBAL_ROOT = process.env.DELIVERY_INSTALL_ROOT ?? join(homedir(), '.config', 'ai-delivery');
const GLOBAL_SERVER_DIR = join(GLOBAL_ROOT, 'delivery-mcp-server');
const GLOBAL_AGENTS_DIR = process.env.DELIVERY_AGENTS_DIR ?? join(homedir(), '.config', 'opencode', 'agents');

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
const FLAG_PREBUILT = takeValue('--prebuilt') ?? process.env.DELIVERY_RELEASE_DIR ?? null; // 本地预构建包目录（布局同 release zip 解压后），跳过下载走预构建安装路径——同样必须在 targetArg 之前解析
const targetArg = args.find((a) => !a.startsWith('--'));
const targetDir = targetArg ?? process.cwd();
const FLAG_DRY = args.includes('--dry-run');
const FLAG_FORCE = args.includes('--force');
const FLAG_FORCE_UPDATE = args.includes('--force-update'); // 强制覆盖已安装文件（不比较版本）
const FLAG_RELEASE = args.includes('--release');
const FLAG_PRERELEASE = args.includes('--prerelease'); // 安装最新 prerelease 版本（GitHub 上标记为 pre-release 的版本；隐含 release 下载模式，不影响 --release 默认取 latest 稳定版）
const FLAG_DASH = args.includes('--dashboard'); // 显式开启才后台启动看板（默认不自动启动）
const FLAG_STOP_DASH = args.includes('--stop-dashboard'); // 仅停止看板进程，不执行安装
const FLAG_SKIP_BUILD = args.includes('--skip-build'); // 跳过 npm run build（仅源码安装模式有意义；--release 预构建包无构建步骤）

// 预构建安装模式（--release/--prerelease 下载 或 --prebuilt 本地目录）：保留 dist/web-dist、只装运行期依赖、agent 覆盖更新
const IS_PREBUILT_INSTALL = FLAG_RELEASE || FLAG_PRERELEASE || !!FLAG_PREBUILT;

// Release 下载指向（可用环境变量覆盖，测试时指向 fork 仓库，避免发布正式 Release）
const GITHUB_OWNER = process.env.DELIVERY_GITHUB_OWNER ?? 'baiyulong';
const GITHUB_REPO = process.env.DELIVERY_GITHUB_REPO ?? 'ai-multiple-agent-delivery-system';
const VALID_LANGS = ['zh', 'en'];

// ---------- 语言选择 ----------
/** 解析安装语言：--lang 参数 > 全局已安装语言（active.json）> 旧项目 .install-lang（兼容）> 交互询问 > 默认 zh */
async function resolveInstallLang() {
  if (FLAG_LANG) {
    if (VALID_LANGS.includes(FLAG_LANG)) return FLAG_LANG;
    warn(`无效的 --lang 值 "${FLAG_LANG}"（仅支持 zh/en），回退到 zh。`);
    return 'zh';
  }
  // 全局已安装语言（新模型）
  try {
    const active = await readJsonSafe(join(GLOBAL_SERVER_DIR, 'config', 'lang', 'active.json'));
    if (active && VALID_LANGS.includes(active.lang)) return active.lang;
  } catch {
    // 首次安装，无记忆
  }
  // 旧模型兼容：目标项目 .install-lang
  try {
    const stored = (await readFile(join(targetReal, '.install-lang'), 'utf-8')).trim();
    if (VALID_LANGS.includes(stored)) return stored;
  } catch {
    // 无记忆文件
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

/** 在全局 delivery-mcp-server 中写入 active.json，并删除另一语言的内置资源与 web 产物（单语言安装） */
async function applyLanguage(serverDir, lang) {
  const other = lang === 'zh' ? 'en' : 'zh';
  const activeFile = join(serverDir, 'config', 'lang', 'active.json');
  const removeTargets = [
    join(serverDir, 'config', 'gates', other),
    join(serverDir, 'config', 'architectures', other),
    join(serverDir, 'templates', other),
    join(serverDir, 'config', 'lang', `${other}.json`),
    join(serverDir, 'web-dist', other), // 预构建 web 产物只保留所选语言
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

/**
 * 拷贝目录（跳过 node_modules/.git）。
 * keepDist=true 用于 --release 预构建包：保留 dist/ 与 web-dist/（已是构建产物）；
 * 源码安装时 keepDist=false 跳过 dist/（需重新构建，web-dist 源码里本来就没有）。
 */
async function copyDirSafe(src, dest, { keepDist = false } = {}) {
  if (!FLAG_DRY) await mkdir(dest, { recursive: true });
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    if (!keepDist && ent.name === 'dist') continue;
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
 * 关键字匹配 `delivery-mcp-server` 与 `server.js` 双条件，兼容相对/绝对/正反斜杠路径。
 */
async function findPidsByCommandLineWin() {
  try {
    const script = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*delivery-mcp-server*' -and $_.CommandLine -like '*server.js*' } | Select-Object -ExpandProperty ProcessId`;
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

/** 停止运行中的 MCP server（全局安装）与目标项目 dashboard 进程 */
async function stopTargetProcesses(targetDir) {
  log('\n[1/5] 停止运行中的进程');

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
      const mcpPids = await findPidsByCommandLineWin();
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

      // 停止 MCP server 进程（命令行含 delivery-mcp-server 与 server.js）
      const result2 = await new Promise((resolve, reject) => {
        const child = spawn('sh', ['-c', 'ps aux | grep "delivery-mcp-server" | grep "server.js" | grep -v grep | awk \'{print $2}\''], { stdio: ['ignore', 'pipe', 'ignore'] });
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
  // 注入 DELIVERY_ROOT：dashboard 从全局目录启动，必须显式指定项目数据根（新模型无"server 父目录=项目根"启发式）
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dashboard'], {
    cwd: serverDir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: { ...process.env, DELIVERY_ROOT: join(projectRoot, '.delivery') },
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
    warn(`看板进程已后台启动，但 10 秒内未检测到端口监听（日志：${logFile}）。可手动运行 node ${join(GLOBAL_SERVER_DIR, 'dist', 'dashboard.js')} 排查。`);
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

// ---------- 0. 从 GitHub Release 下载预构建 zip（可选） ----------
/** 解压 zip（Windows 用 PowerShell Expand-Archive；Unix 用 unzip，兜底 python3） */
async function extractZip(zipFile, destDir) {
  await mkdir(destDir, { recursive: true });
  if (process.platform === 'win32') {
    const script = `Expand-Archive -LiteralPath '${zipFile.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
    const res = await runCapture('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]).catch(() => '');
    if (existsSync(join(destDir, 'delivery-mcp-server')) || (await readdir(destDir).catch(() => [])).length > 0) return true;
    return false;
  }
  try {
    await new Promise((resolve, reject) => {
      const child = spawn('unzip', ['-q', '-o', zipFile, '-d', destDir], { stdio: 'inherit' });
      child.on('error', reject);
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`unzip 退出码 ${code}`))));
    });
    return true;
  } catch {
    try {
      await new Promise((resolve, reject) => {
        const child = spawn('python3', ['-m', 'zipfile', '-e', zipFile, destDir], { stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`python3 zipfile 退出码 ${code}`))));
      });
      return true;
    } catch {
      return false;
    }
  }
}

async function downloadFromRelease() {
  // --prerelease 走列表接口（含 pre-release 版本，按时间倒序）；默认走 latest 接口（GitHub 的 latest 永不含 prerelease）
  const apiUrl = FLAG_PRERELEASE
    ? `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`
    : `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
  log(`\n[0] 从 GitHub Release 下载最新${FLAG_PRERELEASE ? ' prerelease' : '稳定版'}（预构建包）`);
  log(`    仓库：${GITHUB_OWNER}/${GITHUB_REPO}`);

  let tag;
  let assetUrl;
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
    let data = await res.json();
    if (Array.isArray(data)) {
      // prerelease 模式：列表按创建时间倒序，取第一个标记为 pre-release 的版本
      const rel = data.find((r) => r && r.prerelease === true);
      if (!rel) throw new Error('Releases 列表中没有 prerelease 版本（发布时需在 GitHub 上勾选 pre-release，或用含 -rc/-beta/-alpha/-test 后缀的 tag）');
      data = rel;
    }
    if (!data || typeof data.tag_name !== 'string') throw new Error('Release 缺少 tag_name');
    tag = data.tag_name;
    // 查找预构建 zip asset（workflow 上传，如 ai-delivery-v0.2.26.zip）
    const asset = (data.assets ?? []).find((a) => typeof a.browser_download_url === 'string' && a.browser_download_url.endsWith('.zip'));
    if (!asset) throw new Error(`Release ${tag} 缺少预构建 zip asset（.github/workflows/release.yml 是否已跑通？）`);
    assetUrl = asset.browser_download_url;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warn(`获取 Release 信息失败：${msg}。请检查网络或改用 --repo 指定本地路径。`);
    return null;
  }

  const tmpDir = join(tmpdir(), `delivery-install-${Date.now()}`);
  if (!FLAG_DRY) tempDirs.push(tmpDir);
  const archiveFile = join(tmpDir, 'release.zip');

  if (!FLAG_DRY) await mkdir(tmpDir, { recursive: true });

  try {
    log(`    版本：${tag}`);
    log(`    下载：${assetUrl}`);
    const res = await fetch(assetUrl, {
      headers: { 'User-Agent': 'delivery-install' },
      signal: AbortSignal.timeout(60000),
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // zip 魔数校验：防止拿到 HTML 错误页 / 被 PowerShell curl 别名损坏的文件
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
      const preview = buf.length > 120 ? buf.subarray(0, 120).toString('utf-8') : buf.toString('utf-8');
      throw new Error(`下载内容不是有效的 zip（前 4 字节 0x${buf.length ? buf[0].toString(16) : '?'} 0x${buf.length > 1 ? buf[1].toString(16) : '?'} 0x${buf.length > 2 ? buf[2].toString(16) : '?'} 0x${buf.length > 3 ? buf[3].toString(16) : '?'}）。内容预览：${preview.slice(0, 80)}`);
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
    try {
      const extracted = await extractZip(archiveFile, extractDir);
      if (!extracted) throw new Error('zip 解压失败（无有效内容）');
      ok('解压完成');
    } catch (e) {
      warn(`解压失败：${e instanceof Error ? e.message : String(e)}。请手动下载 Release 包并解压后用 --repo 指定路径。`);
      return null;
    }
  }

  // 预构建 zip 内含 delivery-mcp-server/ 与 .opencode/agent/（与仓库布局一致）
  if (FLAG_DRY) {
    log(`  - 解压目录：${extractDir}（含 delivery-mcp-server 与 .opencode/agent）`);
    return extractDir;
  }
  if (!existsSync(join(extractDir, 'delivery-mcp-server', 'package.json'))) {
    warn(`解压后未找到 delivery-mcp-server/package.json（${extractDir}）。请手动下载 Release 包解压后用 --repo 指定路径。`);
    return null;
  }
  ok(`源码路径：${extractDir}`);
  return extractDir;
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

// --dashboard 且全局已安装：原地后台启动看板，不重复安装
// （区分"首次安装"与"更新/看板管理"场景，允许在当前目录执行；--prebuilt 属安装场景，排除）
if (FLAG_DASH && !FLAG_RELEASE && !FLAG_PRERELEASE && !FLAG_PREBUILT && repoPath === SCRIPT_DIR && existsSync(join(GLOBAL_SERVER_DIR, 'package.json'))) {
  log('\n[看板] 全局已安装 delivery-mcp-server，直接后台启动看板');
  await startDashboardDetached(GLOBAL_SERVER_DIR, targetDir);
  process.exit(0);
}

// --prebuilt：使用本地预构建包目录（布局与 release zip 解压后一致），跳过下载（测试用）
if (FLAG_PREBUILT) {
  const prebuiltReal = await realpath(FLAG_PREBUILT).catch(() => FLAG_PREBUILT);
  if (!existsSync(join(prebuiltReal, 'delivery-mcp-server', 'package.json'))) {
    console.error(`\n错误：--prebuilt 目录 ${prebuiltReal} 下未找到 delivery-mcp-server/package.json。`);
    console.error('  目录布局应与 release zip 解压后一致（delivery-mcp-server/ + .opencode/agent/）。\n');
    process.exit(1);
  }
  log(`\n[0] 使用本地预构建包：${prebuiltReal}（跳过 Release 下载）`);
  repoPath = prebuiltReal;
} else if (FLAG_RELEASE || FLAG_PRERELEASE) {
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
if (existsSync(GLOBAL_SERVER_DIR)) {
  await stopTargetProcesses(targetReal);
}

// ---------- 2. 拷贝 delivery-mcp-server 到全局目录 ----------
log(`\n[1/6] 安装 delivery-mcp-server → ${GLOBAL_SERVER_DIR}`);
const srcServer = join(repoReal, 'delivery-mcp-server');
const dstServer = GLOBAL_SERVER_DIR;
// 预构建包（--release / --prebuilt）保留 dist/web-dist；源码安装跳过 dist（重新构建）
const keepDist = IS_PREBUILT_INSTALL;
if (existsSync(srcServer)) {
  if (existsSync(dstServer)) {
    // 判断是否需要覆盖更新：预构建模式更新、--force-update 强制覆盖、
    // 或本地版本低于源码版本（自动更新，解决"已存在则跳过"导致版本不更新）
    let shouldUpdate = IS_PREBUILT_INSTALL || FLAG_FORCE_UPDATE;
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
      await copyDirSafe(srcServer, dstServer, { keepDist });
      ok('delivery-mcp-server 已更新' + versionNote);
    } else {
      skip('delivery-mcp-server（全局目录）');
      if (!existsSync(join(dstServer, 'package.json'))) {
        warn('全局目录的 delivery-mcp-server 不完整（缺少 package.json），建议 --force-update 重装。');
      }
    }
  } else {
    await copyDirSafe(srcServer, dstServer, { keepDist });
    ok('delivery-mcp-server 已安装到全局目录');
  }
} else {
  warn(`仓库路径下未找到 delivery-mcp-server（${srcServer}），请用 --repo 指定正确的仓库路径。`);
}

// ---------- 2.5 应用安装语言（单语言安装，写入全局目录） ----------
log(`\n[语言] 应用安装语言：${installLang}`);
if (FLAG_DRY) {
  log(`  - 将在 ${dstServer} 写入 config/lang/active.json（{"lang": "${installLang}"}）`);
  log(`  - 将删除另一语言内置资源：config/gates/${installLang === 'zh' ? 'en' : 'zh'}/、config/architectures/${installLang === 'zh' ? 'en' : 'zh'}/、templates/${installLang === 'zh' ? 'en' : 'zh'}/、config/lang/${installLang === 'zh' ? 'en' : 'zh'}.json、web-dist/${installLang === 'zh' ? 'en' : 'zh'}/`);
} else if (existsSync(dstServer)) {
  await applyLanguage(dstServer, installLang);
} else {
  warn(`未找到 ${dstServer}，跳过语言配置。`);
}

// ---------- 3. 拷贝 agent 配置到全局 agents 目录（只新增 delivery-*） ----------
log(`\n[2/6] 拷贝角色 Agent 配置 → ${GLOBAL_AGENTS_DIR}（delivery-*.${installLang}.md → delivery-*.md${IS_PREBUILT_INSTALL ? '，更新模式覆盖已有文件' : '，不覆盖已有文件'}）`);
const srcAgents = join(repoReal, '.opencode', 'agent');
if (existsSync(srcAgents)) {
  if (!FLAG_DRY) await mkdir(GLOBAL_AGENTS_DIR, { recursive: true });
  const { readdir } = await import('node:fs/promises');
  let files = await readdir(srcAgents);
  files = files.filter((f) => f.endsWith('.md') && f.startsWith(AGENT_PREFIX) && f.includes(`.${installLang}.md`));
  let copied = 0;
  for (const f of files) {
    // 去掉语言后缀：delivery-orchestrator.zh.md → delivery-orchestrator.md
    const dstName = f.replace(`.${installLang}.md`, '.md');
    const dst = join(GLOBAL_AGENTS_DIR, dstName);
    if (existsSync(dst) && !IS_PREBUILT_INSTALL) {
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

// ---------- 4. 合并 opencode.json（注册 MCP：绝对路径 + DELIVERY_ROOT） ----------
log(`\n[3/6] 注册 MCP 到 opencode.json（绝对路径 + DELIVERY_ROOT 环境变量）`);
const opencodeFile = join(targetReal, 'opencode.json');
const opencodeConfig = (await readJsonSafe(opencodeFile)) ?? {};
const serverEntry = join(dstServer, 'dist', 'server.js');
const delivery = {
  type: 'local',
  command: ['node', serverEntry],
  environment: { DELIVERY_ROOT: join(targetReal, '.delivery') },
  enabled: true,
};
const existingDelivery = opencodeConfig.mcp && opencodeConfig.mcp.delivery;
if (existingDelivery && Array.isArray(existingDelivery.command) && existingDelivery.command[1] === serverEntry) {
  skip('opencode.json 中 mcp.delivery 已指向全局安装（路径一致）');
} else {
  if (existingDelivery) {
    log(`  - 更新已有 mcp.delivery（旧命令 ${JSON.stringify(existingDelivery.command)} → 全局路径）`);
  }
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

// ---------- 5. .gitignore（忽略任务数据根 .delivery/） ----------
log(`\n[4/6] 追加 .gitignore（忽略任务数据根 .delivery/）`);
const gitignoreFile = join(targetReal, '.gitignore');
await gitIgnoreAdd(gitignoreFile, ['.delivery/']);
ok('.gitignore 已处理（若此前无条目）');

// ---------- 6. 依赖安装 ----------
if (IS_PREBUILT_INSTALL) {
  // 预构建包：只装运行期依赖（--omit=dev），不构建
  log(`\n[5/6] 安装运行期依赖（预构建包，npm install --omit=dev）`);
  if (!FLAG_DRY && existsSync(dstServer)) {
    try {
      log('  - npm install --omit=dev（通常 10–30 秒，请勿中断）...');
      await run('install --omit=dev', dstServer);
      ok('运行期依赖安装完成（预构建 dist 已就绪，无需构建）');
    } catch (e) {
      warn(`依赖安装失败：${e.message}。可稍后在 ${dstServer} 手动执行 npm install --omit=dev。`);
    }
  } else if (FLAG_DRY) {
    log('  - 将执行 npm install --omit=dev（delivery-mcp-server 目录）');
  }
} else {
  // 源码安装：npm install + build
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
}

// ---------- 7. 旧模型迁移提示 ----------
if (existsSync(join(targetReal, 'delivery-mcp-server'))) {
  warn(`
检测到项目内存在旧版按项目安装的 delivery-mcp-server/（新模型已改为全局安装到 ${GLOBAL_SERVER_DIR}）。
任务数据 ${join(targetReal, '.delivery')} 会原地保留，不受影响。
可手动删除项目内旧目录以清理：
  rm -rf ${join(targetReal, 'delivery-mcp-server')}
  （旧 opencode.json 中的 mcp.delivery 已在本步骤更新为全局绝对路径）`);
}

// ---------- 8. 可选启动看板 ----------
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
${IS_PREBUILT_INSTALL ? '0. 本次为预构建包更新（--release / --prebuilt）：旧 MCP server 进程已停止，新版本需重启 OpenCode 后才会以新代码启动（不会自动重启，请务必重启 OpenCode）\n' : ''}1. 重启 OpenCode（加载新 agent 与 MCP 配置，MCP server 会随之启动）
2. 配置当前人：   user.set  { "name": "你的姓名", "email": "your@email.com" }
3. 配置团队名册： team.set  { "name": "你的姓名", "email": "your@email.com", "roles": ["..."] }
   （全部成员 roles 并集需覆盖 8 个角色）
4. 可选配置个人邮件： email.set { "user": "your@qq.com", "pass": "SMTP 授权码" }  ← 只填邮箱+授权码即可
   （个人级，存于用户主目录，跨项目沿用，不进项目仓库）
5. 选择 delivery-orchestrator Agent 开始交付任务

本机信息：
  全局安装目录：${GLOBAL_SERVER_DIR}
  全局 agent 目录：${GLOBAL_AGENTS_DIR}
  项目数据根：${join(targetReal, '.delivery')}

启动看板：
  node ${join(GLOBAL_SERVER_DIR, 'install.js')} --dashboard   # 后台启动（推荐，需在项目根目录执行）
  node ${join(GLOBAL_SERVER_DIR, 'dist', 'dashboard.js')}     # 前台启动（先设置 DELIVERY_ROOT=<项目>/.delivery）
  →  http://localhost:8787
停止看板：
  node ${join(GLOBAL_SERVER_DIR, 'install.js')} --stop-dashboard
  或 cd ${GLOBAL_SERVER_DIR} && npm run dashboard:stop

更新到新版本：
  node ${join(GLOBAL_SERVER_DIR, 'install.js')} --release     # 在项目根目录执行
`);

if (FLAG_DRY) {
  log('（dry-run 结束：以上为将要执行的操作，未改动任何文件）');
}
