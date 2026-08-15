import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/dashboard.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  shims: true,
  dts: false,
  sourcemap: false,
});
