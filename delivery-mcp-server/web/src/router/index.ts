import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '@/views/HomeView.vue';
import TaskListView from '@/views/TaskListView.vue';
import TaskDetailView from '@/views/TaskDetailView.vue';
import DocumentsView from '@/views/DocumentsView.vue';
import { t } from '@/utils/i18n';

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
    { path: '/', name: 'home', component: HomeView, meta: { title: t('menu.home') } },
    { path: '/tasks', name: 'tasks', component: TaskListView, meta: { title: t('menu.tasks') } },
    { path: '/task/:id', name: 'task-detail', component: TaskDetailView, props: true, meta: { title: t('detail.routeTitle') } },
    { path: '/tasks/:id', redirect: (to) => ({ path: `/task/${to.params.id}` }) },
    { path: '/documents', name: 'documents', component: DocumentsView, meta: { title: t('menu.documents') } },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: t('menu.settings') } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

export default router;
