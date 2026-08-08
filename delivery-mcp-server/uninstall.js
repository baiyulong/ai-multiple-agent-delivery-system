#!/usr/bin/env node
/**
 * AI 交付任务系统 · 安全卸载脚本
 *
 * 用法：
 *   node uninstall.js                      # 卸载当前项目中的 delivery 系统
 *   node uninstall.js --keep-data          # 保留 .delivery 任务数据
 *   node uninstall.js --dry-run            # 只打印将要执行的操作，不改动文件
 *
 * 功能：
 *   1. 停止运行中的 dashboard 与 MCP server 进程
 *   2. 移除 delivery-mcp-server/ 目录
 *   3. 移除 .opencode/agent/delivery-*.md 角色配置
 *   4. 移除 opencode.json 中的 mcp.delivery 配置
 *   5. 可选移除 .delivery/ 任务数据目录
 */

import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(SCRIPT_DIR);
const AGENT_PREFIX = 'delivery-';

// ---------- 参数解析 ----------
const args = process.argv.slice(2);
const FLAG_DRY = args.includes('--dry-run');
const FLAG_KEEP_DATA = args.includes('--keep-data');

// ---------- 工具 ----------
const log = (msg) => console.log(msg);
const ok = (msg) => console.log(`  ✓ ${msg}`);
const skip = (msg) => console.log(`  - ${msg}`);
const warn = (msg) => console.log(`  ! ${msg}`);

async function readJsonSafe(file) {
  try {
    return JSON.parse(await readFile(file, 'utf-8'));
  } catch {
    return null;
  }
}

// ---------- 1. 停止运行中的进程 ----------
async function stopProcesses() {
  log('\n[1/5] 停止运行中的进程');

  // 读取 dashboard.port 获取端口
  const portFile = join(PROJECT_ROOT, '.delivery', 'dashboard.port');
  let dashboardPort = '8787';
  try {
    const portContent = await readFile(portFile, 'utf-8');
    dashboardPort = portContent.trim() || '8787';
  } catch {
    // 使用默认端口
  }

  // 查找并停止占用端口的进程
  if (process.platform === 'win32') {
    // Windows: 使用 netstat + taskkill
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
            }
          }
        }
      }
    } catch {
      // 忽略错误
    }
  } else {
    // Linux/macOS: 使用 lsof + kill
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
        }
      }
    } catch {
      // 忽略错误
    }
  }

  // 停止 MCP server 进程（通过查找 node 进程命令行包含 delivery-mcp-server/dist/server.js）
  if (process.platform === 'win32') {
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn('wmic', ['process', 'where', 'commandline like "%delivery-mcp-server%"', 'get', 'processid'], { shell: true });
        let output = '';
        child.stdout?.on('data', (d) => (output += d));
        child.on('exit', () => resolve(output));
        child.on('error', reject);
      });

      const lines = result.split('\n').slice(1); // 跳过标题行
      for (const line of lines) {
        const pid = line.trim();
        if (pid && /^\d+$/.test(pid)) {
          log(`  停止 MCP server 进程 (PID: ${pid})`);
          if (!FLAG_DRY) {
            spawn('taskkill', ['/F', '/PID', pid], { shell: true, stdio: 'ignore' });
          }
        }
      }
    } catch {
      // 忽略错误
    }
  } else {
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn('sh', ['-c', 'ps aux | grep "delivery-mcp-server/dist/server.js" | grep -v grep | awk \'{print $2}\''], { stdio: ['ignore', 'pipe', 'ignore'] });
        let output = '';
        child.stdout?.on('data', (d) => (output += d));
        child.on('exit', () => resolve(output));
        child.on('error', reject);
      });

      const pids = result.trim().split('\n').filter(Boolean);
      for (const pid of pids) {
        log(`  停止 MCP server 进程 (PID: ${pid})`);
        if (!FLAG_DRY) {
          spawn('kill', ['-9', pid], { stdio: 'ignore' });
        }
      }
    } catch {
      // 忽略错误
    }
  }

  ok('进程已停止');
}

// ---------- 2. 移除 delivery-mcp-server ----------
async function removeServer() {
  log('\n[2/5] 移除 delivery-mcp-server/');
  const serverDir = join(PROJECT_ROOT, 'delivery-mcp-server');
  if (!existsSync(serverDir)) {
    skip('delivery-mcp-server/ 不存在');
    return;
  }
  if (FLAG_DRY) {
    log('  - 将删除 delivery-mcp-server/');
  } else {
    await rm(serverDir, { recursive: true, force: true });
    ok('delivery-mcp-server/ 已删除');
  }
}

// ---------- 3. 移除角色 Agent 配置 ----------
async function removeAgents() {
  log('\n[3/5] 移除角色 Agent 配置（仅 delivery-* 前缀）');
  const agentsDir = join(PROJECT_ROOT, '.opencode', 'agent');
  if (!existsSync(agentsDir)) {
    skip('.opencode/agent/ 不存在');
    return;
  }

  const { readdir } = await import('node:fs/promises');
  let files = await readdir(agentsDir);
  files = files.filter((f) => f.endsWith('.md') && f.startsWith(AGENT_PREFIX));

  if (files.length === 0) {
    skip('未找到 delivery-*.md 文件');
    return;
  }

  for (const f of files) {
    if (FLAG_DRY) {
      log(`  - 将删除 .opencode/agent/${f}`);
    } else {
      await rm(join(agentsDir, f));
    }
  }
  ok(`已删除 ${files.length} 个角色 Agent 文件`);
}

// ---------- 4. 移除 opencode.json 中的 mcp.delivery ----------
async function removeMcpConfig() {
  log('\n[4/5] 移除 opencode.json 中的 mcp.delivery 配置');
  const opencodeFile = join(PROJECT_ROOT, 'opencode.json');
  const config = await readJsonSafe(opencodeFile);
  if (!config || !config.mcp?.delivery) {
    skip('opencode.json 中无 mcp.delivery 配置');
    return;
  }

  if (FLAG_DRY) {
    log('  - 将移除 mcp.delivery 配置');
  } else {
    delete config.mcp.delivery;
    // 如果 mcp 对象为空，删除它
    if (Object.keys(config.mcp).length === 0) {
      delete config.mcp;
    }
    await writeFile(opencodeFile, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    ok('mcp.delivery 已从 opencode.json 移除');
  }
}

// ---------- 5. 可选移除任务数据 ----------
async function removeData() {
  log('\n[5/5] 任务数据');
  const dataDir = join(PROJECT_ROOT, '.delivery');
  if (!existsSync(dataDir)) {
    skip('.delivery/ 不存在');
    return;
  }

  if (FLAG_KEEP_DATA) {
    skip('.delivery/ 已保留（--keep-data）');
    return;
  }

  if (FLAG_DRY) {
    log('  - 将删除 .delivery/ 目录');
  } else {
    await rm(dataDir, { recursive: true, force: true });
    ok('.delivery/ 已删除');
  }
}

// ---------- 主流程 ----------
log('AI 交付任务系统卸载');
log('====================');

if (FLAG_DRY) log('（dry-run 模式：仅预览，不改动任何文件）\n');

await stopProcesses();
await removeServer();
await removeAgents();
await removeMcpConfig();
await removeData();

log(`
卸载完成。
  若需重新安装，请运行：node delivery-mcp-server/install.js --release
  若保留了任务数据（--keep-data），重新安装后数据会自动恢复。
`);
