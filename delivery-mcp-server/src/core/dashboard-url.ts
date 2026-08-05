/**
 * 看板地址生成：供工具返回 dashboard_url / view_hint 提示。
 * 端口优先级：DELIVERY_DASHBOARD_PORT > PORT > 8787。
 * 看板前端使用 hash 路由定位任务详情：/#/task/<taskId>。
 */

export function dashboardUrl(taskId?: string): string {
  const port = process.env.DELIVERY_DASHBOARD_PORT ?? process.env.PORT ?? 8787;
  const base = `http://localhost:${port}`;
  if (taskId) return `${base}/#/task/${taskId}`;
  return base;
}