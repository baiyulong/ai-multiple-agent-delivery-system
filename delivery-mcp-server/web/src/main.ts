import { createApp } from 'vue';
import { createPinia } from 'pinia';
import MakeitAdminPro from '@miitvip/admin-pro';
import '@miitvip/admin-pro/dist/makeit-admin-pro.min.css';
import App from './App.vue';
import router from './router';
import { $request } from '@miitvip/admin-pro/es/utils/request';

// 配置 API 基础路径（框架请求层直接返回 res.data，后端裸 JSON 完全兼容）
$request.setBaseUrl('/api');

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(MakeitAdminPro);
app.mount('#app');
