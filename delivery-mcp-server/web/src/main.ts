import { createApp } from 'vue';
import { createPinia } from 'pinia';
import MakeitAdminPro from '@miitvip/admin-pro';
import '@miitvip/admin-pro/dist/makeit-admin-pro.min.css';
import './styles/base.css';
import App from './App.vue';
import router from './router';
import { $request } from '@miitvip/admin-pro/es/utils/request';
import { $g } from '@miitvip/admin-pro/es/utils/global';
import { t, lang } from '@/utils/i18n';

// 站点标识（logo 图标 + 侧边栏站点名）与页脚版权
$g.site = t('app.siteTitle');
document.documentElement.lang = lang;
document.title = t('home.title');
$g.logo = '/logo.svg';
$g.copyright!.laptop = '© Copyright 2026 ~ Now';
$g.copyright!.mobile = '© Copyright 2026 ~ Now';

// 关闭框架 Historical（多标签）路由恢复：该组件会把访问过的路由以 route.name 为 key
// 持久化到 localStorage（mi-historical-routing），task-detail 被记住后会覆盖/跳转到
// 已删除的任务详情（如 #/task/TASK-20260811-001），导致打开 dashboard 反复跳到不存在的任务。
// 此处关闭功能并清理残留存储，保持纯 hash 路由导航（/、/tasks、/task/:id、/documents）。
$g.showHistoricalRouting = false;
try {
  localStorage.removeItem('mi-historical-routing');
} catch {
  // 忽略清理失败
}

// 配置 API 基础路径（框架请求层直接返回 res.data，后端裸 JSON 完全兼容）
$request.setBaseUrl('/api');

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(MakeitAdminPro);
// 等初始路由解析完成再挂载：框架 Historical(多 Tab) 在 onMounted 时按 route.name 收集，
// 若路由未 ready，初始页（/）的 tab 永远不会被收集（route.path 未变化，watch 不触发）。
router.isReady().then(() => app.mount('#app'));
