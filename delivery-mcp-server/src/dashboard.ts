/**
 * 任务看板 HTTP 服务（独立入口，不依赖 MCP server）
 *
 * 运行：npm run dashboard
 * 端口：环境变量 DELIVERY_DASHBOARD_PORT 或 PORT，默认 8787
 *       若该端口已被占用，自动改用随机空闲端口，并把实际端口写入
 *       <数据根>/dashboard.port，供 dashboardUrl() 生成正确地址
 * 数据根：resolveDeliveryRoot()（DELIVERY_ROOT 环境变量 > 当前目录 .delivery）
 *
 * 只读服务：任务列表 / 任务详情 / 交付物正文 / 共享上下文 / 交付包
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, readdir, stat, writeFile, rm } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { builtinArchitecturesDir } from './core/locate.js';
import { resolveDeliveryRoot } from './core/paths.js';
import { getQuestions, getStages, getTask, listTaskIds, readContext } from './core/store/task-store.js';
import { getArtifact, listArtifacts } from './core/store/artifact-store.js';
import { readGateStageFile } from './core/store/gate-store.js';
import { isTeamConfigured, readTeamConfig, TEAM_ROLE_LABELS } from './core/store/team-store.js';
import { readCurrentUser } from './core/store/user-store.js';

const CONFIGURED_PORT = Number(process.env.DELIVERY_DASHBOARD_PORT ?? process.env.PORT ?? 8787);

/**
 * 解析看板数据根目录（项目级 .delivery）：
 * 1. DELIVERY_ROOT 环境变量（显式指定，最高优先）
 * 2. 项目根目录：delivery-mcp-server 的父目录（install.md 约定 server 装在项目根下）
 * 3. 回退 cwd/.delivery
 *
 * 这样从 delivery-mcp-server 目录启动 dashboard 也能读到项目根目录的 .delivery。
 */
function resolveDashboardRoot(): string {
  if (process.env.DELIVERY_ROOT) return resolveDeliveryRoot();
  // dashboard.ts 位于 <项目根>/delivery-mcp-server/src/dashboard.ts
  const serverDir = dirname(import.meta.dirname); // <项目根>/delivery-mcp-server
  const projectRoot = dirname(serverDir); // <项目根>
  return join(projectRoot, '.delivery');
}

const root = resolveDashboardRoot();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendText(res: ServerResponse, status: number, text: string, type: string): void {
  res.writeHead(status, { 'Content-Type': type });
  res.end(text);
}

/** 聚合"公共文档"：跨任务收集架构师产出的业务统一语言·代码映射与技术架构文档 */
const PUBLIC_DOC_TYPES = new Set(['ubiquitous_language_code_map', 'technical_architecture']);

/** 公共文档条目（任务交付物与预设架构文档共用字段） */
interface PublicDocEntry {
  artifact_id: string | null;
  task_id: string | null;
  task_title: string | null;
  artifact_type: string;
  title: string | null;
  stage: string | null;
  role: string | null;
  status: string | null;
  version: number | null;
  updated_at: string;
  source?: string;
  task_type?: string;
  content?: string;
}

/** 预设架构文档 JSON 结构（config/architectures/*.json） */
interface PresetArchitecture {
  task_type?: string;
  name?: string;
  description?: string;
  layers?: Array<{
    name?: string;
    responsibility?: string;
    typical_files?: string[];
  }>;
  structure?: {
    backend?: string[];
    frontend?: string[];
  };
  code_requirements?: string[];
  source?: string;
}

/** 把预设架构 JSON 渲染成可读 markdown（字段缺失则跳过对应小节） */
function renderPresetMarkdown(preset: PresetArchitecture): string {
  const out: string[] = [];
  if (preset.name) out.push(`# ${preset.name}`, '');
  if (preset.description) out.push(`> ${preset.description}`, '');

  if (preset.layers && preset.layers.length > 0) {
    out.push('## 分层架构', '');
    for (const layer of preset.layers) {
      if (!layer.name) continue;
      out.push(`### ${layer.name}`);
      if (layer.responsibility) out.push(`- 职责：${layer.responsibility}`);
      if (layer.typical_files && layer.typical_files.length > 0) {
        out.push(`- 典型文件：${layer.typical_files.join('、')}`);
      }
      out.push('');
    }
  }

  if (preset.structure) {
    out.push('## 目录结构', '');
    if (preset.structure.backend && preset.structure.backend.length > 0) {
      out.push('### 后端');
      for (const item of preset.structure.backend) out.push(`- ${item}`);
      out.push('');
    }
    if (preset.structure.frontend && preset.structure.frontend.length > 0) {
      out.push('### 前端');
      for (const item of preset.structure.frontend) out.push(`- ${item}`);
      out.push('');
    }
  }

  if (preset.code_requirements && preset.code_requirements.length > 0) {
    out.push('## 代码要求', '');
    for (const item of preset.code_requirements) out.push(`- ${item}`);
    out.push('');
  }

  return out.join('\n').trim();
}

/**
 * 加载预设架构文档：优先读项目数据根下的 <root>/config/architectures/*.json
 * （用户可覆盖），若目录不存在或为空则回退到内置目录 builtinArchitecturesDir()。
 */
async function loadPresetArchitectures(): Promise<
  Array<{ preset: PresetArchitecture; updatedAt: string }>
> {
  const userDir = join(root, 'config', 'architectures');
  let dir = userDir;
  let names: string[] = [];
  try {
    names = (await readdir(userDir)).filter((n) => n.endsWith('.json'));
  } catch {
    names = [];
  }
  if (names.length === 0) {
    dir = builtinArchitecturesDir();
    try {
      names = (await readdir(dir)).filter((n) => n.endsWith('.json'));
    } catch {
      names = [];
    }
  }

  const presets: Array<{ preset: PresetArchitecture; updatedAt: string }> = [];
  for (const name of names) {
    const file = join(dir, name);
    try {
      const [raw, info] = await Promise.all([readFile(file, 'utf-8'), stat(file)]);
      const preset = JSON.parse(raw) as PresetArchitecture;
      if (!preset.task_type) continue;
      presets.push({
        preset,
        updatedAt: info.mtime.toISOString(),
      });
    } catch {
      // 跳过无法读取或解析失败的预设文件
    }
  }
  return presets;
}

async function buildPublicDocuments() {
  const ids = await listTaskIds(root);
  const docs: PublicDocEntry[] = [];
  for (const id of ids) {
    const task = await getTask(root, id);
    if (!task) continue;
    const artifacts = (await listArtifacts(root, id)) ?? [];
    for (const a of artifacts) {
      if (!PUBLIC_DOC_TYPES.has(a.artifact_type)) continue;
      docs.push({
        artifact_id: a.artifact_id,
        task_id: a.task_id,
        task_title: task.title,
        artifact_type: a.artifact_type,
        title: a.title ?? null,
        stage: a.stage,
        role: a.role,
        status: a.status,
        version: a.version,
        updated_at: a.updated_at,
      });
    }
  }
  // 追加预设架构文档条目
  for (const { preset, updatedAt } of await loadPresetArchitectures()) {
    docs.push({
      artifact_id: `preset:${preset.task_type}`,
      task_id: null,
      task_title: null,
      artifact_type: 'technical_architecture',
      title: preset.name ?? null,
      stage: null,
      role: 'architect',
      status: null,
      version: null,
      updated_at: updatedAt,
      source: 'preset',
      task_type: preset.task_type,
      content: renderPresetMarkdown(preset),
    });
  }
  docs.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return { documents: docs };
}

/** 组装任务列表：每个任务带阶段进度统计，按创建时间倒序 */
async function buildTaskList() {
  const ids = await listTaskIds(root);
  const tasks = [];
  for (const id of ids) {
    const task = await getTask(root, id);
    if (!task) continue;
    const stages = (await getStages(root, id)) ?? [];
    const completed = stages.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
    tasks.push({
      task_id: task.task_id,
      title: task.title,
      task_type: task.task_type,
      status: task.status,
      current_stage: task.current_stage,
      created_at: task.created_at,
      updated_at: task.updated_at,
      completed_stages: completed,
      total_stages: stages.length,
    });
  }
  tasks.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return { tasks };
}

/** 组装任务详情：任务 + 阶段 + 交付物 + 未决问题 + 每阶段最新门禁结果 */
async function buildTaskDetail(taskId: string) {
  const task = await getTask(root, taskId);
  if (!task) return null;
  const [stages, artifacts, questions] = await Promise.all([
    getStages(root, taskId),
    listArtifacts(root, taskId),
    getQuestions(root, taskId),
  ]);

  const gateSummary: Record<string, unknown> = {};
  for (const stage of stages ?? []) {
    const file = await readGateStageFile(root, taskId, stage.stage);
    const entries = Object.values(file.checks);
    if (entries.length > 0) {
      const latest = entries.reduce((a, b) => (a.checked_at >= b.checked_at ? a : b));
      gateSummary[stage.stage] = {
        result: latest.result,
        score: latest.score,
        checked_at: latest.checked_at,
      };
    }
  }

  return {
    task,
    stages: stages ?? [],
    artifacts: artifacts ?? [],
    open_questions: (questions ?? []).filter((q) => q.status === 'open' || q.status === 'answered'),
    gate_summary: gateSummary,
  };
}

/** 静态资源服务（public/ 目录） */
async function serveStatic(reqPath: string, res: ServerResponse): Promise<boolean> {
  const filePath = reqPath === '/' ? '/index.html' : reqPath;
  const normalized = normalize(filePath).replace(/^([\\/])+/, '');
  if (normalized.includes('..') || normalized.startsWith('.')) return false;
  const full = join(import.meta.dirname, '..', 'public', normalized);
  try {
    const info = await stat(full);
    if (!info.isFile()) return false;
    const data = await readFile(full);
    res.writeHead(200, { 'Content-Type': MIME[extname(full)] ?? 'application/octet-stream' });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function parseUrlPath(req: IncomingMessage): string {
  const raw = req.url ?? '/';
  const idx = raw.indexOf('?');
  return decodeURIComponent(idx >= 0 ? raw.slice(0, idx) : raw);
}

const server = createServer(async (req, res) => {
  try {
    const path = parseUrlPath(req);
    if (req.method !== 'GET') {
      return sendJson(res, 405, { error: 'method not allowed' });
    }

    // JSON API
    if (path === '/api/tasks') {
      return sendJson(res, 200, await buildTaskList());
    }
    if (path === '/api/documents') {
      return sendJson(res, 200, await buildPublicDocuments());
    }
    if (path === '/api/team') {
      const configured = await isTeamConfigured(root);
      const config = await readTeamConfig(root);
      return sendJson(res, 200, {
        configured,
        members: config?.members ?? [],
        role_labels: TEAM_ROLE_LABELS,
        updated_at: config?.updated_at ?? null,
      });
    }
    if (path === '/api/user') {
      const [user, teamConfig] = await Promise.all([readCurrentUser(), readTeamConfig(root)]);
      const member = user
        ? (teamConfig?.members ?? []).find(
            (m) => m.email.toLowerCase() === user.email.toLowerCase(),
          ) ?? null
        : null;
      return sendJson(res, 200, {
        configured: !!user,
        user: user ? { name: user.name, email: user.email } : null,
        roles: member?.roles ?? [],
        role_labels: TEAM_ROLE_LABELS,
        in_team: !!member,
        updated_at: user?.updated_at ?? null,
      });
    }
    const detailMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (detailMatch) {
      const detail = await buildTaskDetail(detailMatch[1]);
      if (!detail) return sendJson(res, 404, { error: 'task not found' });
      return sendJson(res, 200, detail);
    }
    const artifactMatch = path.match(/^\/api\/tasks\/([^/]+)\/artifacts\/([^/]+)$/);
    if (artifactMatch) {
      const art = await getArtifact(root, artifactMatch[1], artifactMatch[2]);
      if (!art) return sendJson(res, 404, { error: 'artifact not found' });
      return sendJson(res, 200, art);
    }
    const contextMatch = path.match(/^\/api\/tasks\/([^/]+)\/context$/);
    if (contextMatch) {
      const content = (await readContext(root, contextMatch[1])) ?? '';
      return sendJson(res, 200, { content });
    }
    const pkgMatch = path.match(/^\/api\/tasks\/([^/]+)\/delivery_package$/);
    if (pkgMatch) {
      const full = join(root, 'tasks', pkgMatch[1], 'delivery_package.md');
      try {
        const content = await readFile(full, 'utf-8');
        return sendJson(res, 200, { content });
      } catch {
        return sendJson(res, 404, { error: 'delivery package not exported yet' });
      }
    }

    // 静态资源
    if (path.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });
    if (await serveStatic(path, res)) return;
    return sendText(res, 404, 'Not Found', 'text/plain; charset=utf-8');
  } catch (e) {
    return sendJson(res, 500, { error: (e as Error).message });
  }
});

/**
 * 启动监听：优先用配置端口；若被占用（EADDRINUSE）则回退到随机空闲端口（port 0）。
 * 返回实际绑定的端口号。
 */
function listenWithFallback(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && port !== 0) {
        server.removeListener('error', onError);
        resolve(listenWithFallback(0));
      } else {
        reject(err);
      }
    };
    server.once('error', onError);
    server.listen(port, () => {
      server.removeListener('error', onError);
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : port);
    });
  });
}

const PORT_FILE = join(root, 'dashboard.port');

listenWithFallback(CONFIGURED_PORT)
  .then(async (port) => {
    // 持久化实际端口，供 dashboardUrl() 生成正确地址
    await writeFile(PORT_FILE, String(port), 'utf-8');
    console.log(`AI 交付任务看板已启动: http://localhost:${port}`);
    console.log(`数据根目录: ${root}`);
    if (port !== CONFIGURED_PORT) {
      console.log(`端口 ${CONFIGURED_PORT} 已被占用，已自动改用随机端口 ${port}`);
    }
  })
  .catch((err) => {
    console.error(`看板启动失败: ${(err as Error).message}`);
    process.exit(1);
  });

// 退出时清理端口文件，避免残留误导 dashboardUrl()
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    rm(PORT_FILE, { force: true }).finally(() => process.exit(0));
  });
}
