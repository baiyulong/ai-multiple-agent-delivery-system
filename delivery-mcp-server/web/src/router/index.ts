import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '@/views/HomeView.vue';
import TaskListView from '@/views/TaskListView.vue';
import TaskDetailView from '@/views/TaskDetailView.vue';
import DocumentsView from '@/views/DocumentsView.vue';

/**
 * hash 路由（与 dashboard.ts 静态服务配合，无需 history fallback）。
 * 规范路径为 /task/:id —— MCP 工具返回的 dashboard_url 即此格式
 * （src/core/dashboard-url.ts 生成 #/task/<taskId>）。
 * 旧版 vanilla 前端使用的 /tasks/:id 做重定向兼容。
 * meta.title 用于框架 Tab 栏标题（与菜单标题保持一致）。
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: 'Home' } },
    { path: '/tasks', name: 'tasks', component: TaskListView, meta: { title: '任务列表' } },
    { path: '/task/:id', name: 'task-detail', component: TaskDetailView, props: true, meta: { title: '任务详情' } },
    { path: '/tasks/:id', redirect: (to) => ({ path: `/task/${to.params.id}` }) },
    { path: '/documents', name: 'documents', component: DocumentsView, meta: { title: '公共文档' } },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: '个人设置' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

export default router;
