/**
 * 任务看板 HTTP 服务（独立入口，不依赖 MCP server）
 *
 * 运行：npm run dashboard
 * 端口：环境变量 DELIVERY_DASHBOARD_PORT 或 PORT，默认 8787
 * 数据根：resolveDeliveryRoot()（DELIVERY_ROOT 环境变量 > 当前目录 .delivery）
 *
 * 只读服务：任务列表 / 任务详情 / 交付物正文 / 共享上下文 / 交付包
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { resolveDeliveryRoot } from './core/paths.js';
import { getQuestions, getStages, getTask, listTaskIds, readContext } from './core/store/task-store.js';
import { getArtifact, listArtifacts } from './core/store/artifact-store.js';
import { readGateStageFile } from './core/store/gate-store.js';
import { isTeamConfigured, readTeamConfig, TEAM_ROLE_LABELS } from './core/store/team-store.js';

const PORT = Number(process.env.DELIVERY_DASHBOARD_PORT ?? process.env.PORT ?? 8787);
const root = resolveDeliveryRoot();

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

server.listen(PORT, () => {
  console.log(`AI 交付任务看板已启动: http://localhost:${PORT}`);
  console.log(`数据根目录: ${root}`);
});
