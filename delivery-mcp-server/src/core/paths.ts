import path from 'node:path';

/**
 * 路径沙箱（PRD 14.4）：一切读写必须位于 .delivery 根目录内。
 * 工具层不接受任意文件路径入参，路径全部由系统生成。
 */

export class PathSandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathSandboxError';
  }
}

/** 解析交付根目录：参数 > DELIVERY_ROOT 环境变量 > cwd/.delivery */
export function resolveDeliveryRoot(override?: string): string {
  const raw = override ?? process.env.DELIVERY_ROOT ?? path.join(process.cwd(), '.delivery');
  return path.resolve(raw);
}

/** 校验 target 位于 root 内（解析后前缀检查），返回规范化绝对路径 */
export function assertInside(root: string, target: string): string {
  const r = path.resolve(root);
  const t = path.resolve(target);
  const rel = path.relative(r, t);
  if (rel === '') return r;
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new PathSandboxError(`路径逃逸交付根目录: ${target}`);
  }
  return t;
}

/** 允许的段名：任务/阶段/交付物类型名，禁止路径分隔符与 .. 等危险字符 */
const SAFE_NAME_RE = /^[A-Za-z0-9_\-]+$/;

export function assertSafeName(name: string, what: string): void {
  if (!SAFE_NAME_RE.test(name)) {
    throw new PathSandboxError(`非法${what}名: ${name}`);
  }
}

/** 任务根目录 */
export function taskDir(root: string, taskId: string): string {
  assertSafeName(taskId, '任务 ID');
  return assertInside(root, path.join(root, 'tasks', taskId));
}

/** 任务内文件 */
export function taskFile(root: string, taskId: string, ...parts: string[]): string {
  return assertInside(root, path.join(taskDir(root, taskId), ...parts));
}

/** 交付物文件：tasks/{taskId}/artifacts/{stage}/{type}.md */
export function artifactFile(root: string, taskId: string, stage: string, artifactType: string): string {
  assertSafeName(stage, '阶段');
  assertSafeName(artifactType, '交付物类型');
  return taskFile(root, taskId, 'artifacts', stage, `${artifactType}.md`);
}

/** 交付物历史文件：artifacts/{stage}/history/{type}.v{n}.md */
export function artifactHistoryFile(
  root: string,
  taskId: string,
  stage: string,
  artifactType: string,
  version: number,
): string {
  assertSafeName(stage, '阶段');
  assertSafeName(artifactType, '交付物类型');
  return taskFile(root, taskId, 'artifacts', stage, 'history', `${artifactType}.v${version}.md`);
}

/** 阶段门禁文件：tasks/{taskId}/gates/{stage}.gate.json */
export function gateFile(root: string, taskId: string, stage: string): string {
  assertSafeName(stage, '阶段');
  return taskFile(root, taskId, 'gates', `${stage}.gate.json`);
}
