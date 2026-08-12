/**
 * Dashboard API 客户端：基于 makeit-admin-pro 的 $request（axios 封装）。
 * 框架请求层直接返回 res.data，后端裸 JSON 完全兼容，无需适配。
 * baseURL 在 main.ts 中通过 $request.setBaseUrl('/api') 配置。
 */
import { $request } from '@miitvip/admin-pro/es/utils/request';
import type {
  ArtifactResponse,
  ContentResponse,
  DocumentsResponse,
  SmtpRequestBody,
  TaskDetailResponse,
  TaskListResponse,
  TeamResponse,
  UpdateUserResponse,
  UserResponse,
} from './types';

export const api = {
  listTasks: (): Promise<TaskListResponse> => $request.get('/tasks') as Promise<TaskListResponse>,
  getTaskDetail: (taskId: string): Promise<TaskDetailResponse> =>
    $request.get(`/tasks/${encodeURIComponent(taskId)}`) as Promise<TaskDetailResponse>,
  getArtifact: (taskId: string, artifactId: string): Promise<ArtifactResponse> =>
    $request.get(`/tasks/${encodeURIComponent(taskId)}/artifacts/${encodeURIComponent(artifactId)}`) as Promise<ArtifactResponse>,
  getContext: (taskId: string): Promise<ContentResponse> =>
    $request.get(`/tasks/${encodeURIComponent(taskId)}/context`) as Promise<ContentResponse>,
  getDeliveryPackage: (taskId: string): Promise<ContentResponse> =>
    $request.get(`/tasks/${encodeURIComponent(taskId)}/delivery_package`) as Promise<ContentResponse>,
  listDocuments: (): Promise<DocumentsResponse> => $request.get('/documents') as Promise<DocumentsResponse>,
  getTeam: (): Promise<TeamResponse> => $request.get('/team') as Promise<TeamResponse>,
  getUser: (): Promise<UserResponse> => $request.get('/user') as Promise<UserResponse>,
  updateUser: (data: { name: string; email: string; smtp?: SmtpRequestBody | null }): Promise<UpdateUserResponse> =>
    $request.post('/user', data) as Promise<UpdateUserResponse>,
};

/** 下载类端点（导出 Markdown / 交付包）直接作为 <a href> 使用 */
export const exportUrl = {
  tasks: '/api/export/tasks',
  documents: '/api/export/documents',
  deliveryPackageMd: (taskId: string) => `/api/export/tasks/${encodeURIComponent(taskId)}/delivery_package.md`,
  deliveryPackageHtml: (taskId: string) => `/api/export/tasks/${encodeURIComponent(taskId)}/delivery_package.html`,
};
