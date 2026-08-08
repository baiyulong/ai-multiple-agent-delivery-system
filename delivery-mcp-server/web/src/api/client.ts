/**
 * Dashboard API 客户端：类型安全封装，覆盖 dashboard.ts 全部只读端点。
 * 服务端渲染的是静态文件 + JSON API，无鉴权，直接 fetch 即可。
 */
import type {
  ArtifactResponse,
  ContentResponse,
  DocumentsResponse,
  TaskDetailResponse,
  TaskListResponse,
  TeamResponse,
  UserResponse,
} from './types';

const API_BASE = '/api';

async function apiFetch<T>(path: string): Promise<T> {
  const resp = await fetch(API_BASE + path);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${text || resp.statusText}`);
  }
  return resp.json() as Promise<T>;
}

/** 下载类端点（导出 Markdown）直接作为 <a href> 使用 */
export const exportUrl = {
  tasks: `${API_BASE}/export/tasks`,
  documents: `${API_BASE}/export/documents`,
};

export const api = {
  listTasks: () => apiFetch<TaskListResponse>('/tasks'),
  getTaskDetail: (taskId: string) => apiFetch<TaskDetailResponse>(`/tasks/${encodeURIComponent(taskId)}`),
  getArtifact: (taskId: string, artifactId: string) =>
    apiFetch<ArtifactResponse>(`/tasks/${encodeURIComponent(taskId)}/artifacts/${encodeURIComponent(artifactId)}`),
  getContext: (taskId: string) => apiFetch<ContentResponse>(`/tasks/${encodeURIComponent(taskId)}/context`),
  getDeliveryPackage: (taskId: string) =>
    apiFetch<ContentResponse>(`/tasks/${encodeURIComponent(taskId)}/delivery_package`),
  listDocuments: () => apiFetch<DocumentsResponse>('/documents'),
  getTeam: () => apiFetch<TeamResponse>('/team'),
  getUser: () => apiFetch<UserResponse>('/user'),
};
