import { createApp } from 'vue';
import { createPinia } from 'pinia';
import MakeitAdminPro from '@miitvip/admin-pro';
import '@miitvip/admin-pro/dist/makeit-admin-pro.min.css';
import './styles/base.css';
import App from './App.vue';
import router from './router';
import { $request } from '@miitvip/admin-pro/es/utils/request';
import { $g } from '@miitvip/admin-pro/es/utils/global';

// 站点标识（logo 图标 + 侧边栏站点名）与页脚版权
$g.site = '多Agent协作';
$g.logo = '/logo.svg';
$g.copyright!.laptop = '© Copyright 2026 ~ Now';
$g.copyright!.mobile = '© Copyright 2026 ~ Now';

// 配置 API 基础路径（框架请求层直接返回 res.data，后端裸 JSON 完全兼容）
$request.setBaseUrl('/api');

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(MakeitAdminPro);
// 等初始路由解析完成再挂载：框架 Historical(多 Tab) 在 onMounted 时按 route.name 收集，
// 若路由未 ready，初始页（/）的 tab 永远不会被收集（route.path 未变化，watch 不触发）。
router.isReady().then(() => app.mount('#app'));
