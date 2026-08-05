import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 定位包根目录（含 config/ 与 templates/ 资源）。
 * 兼容：tsx 开发（src/core 内）与 tsup 打包（dist/server.js）。
 */
let cachedRoot: string | null = null;

export function packageRoot(): string {
  if (cachedRoot) return cachedRoot;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const pj = join(dir, 'package.json');
    if (existsSync(pj)) {
      try {
        const pkg = JSON.parse(readFileSync(pj, 'utf8')) as { name?: string };
        if (pkg?.name === 'delivery-mcp-server') {
          cachedRoot = dir;
          return dir;
        }
      } catch {
        // 继续向上
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  cachedRoot = resolve(process.cwd());
  return cachedRoot;
}

export const builtinFlowsDir = (): string => join(packageRoot(), 'config', 'flows');
export const builtinGatesDir = (): string => join(packageRoot(), 'config', 'gates');
export const templatesDir = (): string => join(packageRoot(), 'templates');
export const contextTemplateFile = (): string => join(templatesDir(), 'context.md');
