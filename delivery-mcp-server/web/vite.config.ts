import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 开发时代理到 dashboard HTTP 服务（npm run dashboard，默认 8787）
const dashboardPort = process.env.DELIVERY_DASHBOARD_PORT ?? process.env.PORT ?? '8787';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${dashboardPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    // 直接产出 dashboard 的静态目录（服务端 serveStatic 读取 public/）
    outDir: '../public',
    emptyOutDir: true,
  },
});
