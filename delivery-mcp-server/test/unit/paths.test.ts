import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { PathSandboxError, assertInside, resolveDeliveryRoot } from '../../src/core/paths.js';

describe('paths 沙箱', () => {
  // path.resolve 保证 Windows/Linux 均为合法绝对路径（Windows 落当前盘符根）
  const root = path.resolve('/delivery');

  it('允许根内路径', () => {
    expect(assertInside(root, path.join(root, 'tasks', 'TASK-1'))).toBe(path.join(root, 'tasks', 'TASK-1'));
  });

  it('拒绝 .. 逃逸', () => {
    expect(() => assertInside(root, path.join(root, '..', 'etc', 'passwd'))).toThrow(PathSandboxError);
  });

  it('拒绝根外绝对路径', () => {
    expect(() => assertInside(root, path.resolve('/Windows/system32'))).toThrow(PathSandboxError);
  });

  it('resolveDeliveryRoot 默认 cwd/.delivery', () => {
    const prev = process.env.DELIVERY_ROOT;
    delete process.env.DELIVERY_ROOT;
    expect(resolveDeliveryRoot()).toBe(path.join(process.cwd(), '.delivery'));
    if (prev !== undefined) process.env.DELIVERY_ROOT = prev;
  });

  it('resolveDeliveryRoot 优先环境变量', () => {
    const prev = process.env.DELIVERY_ROOT;
    const custom = path.resolve('/custom/delivery');
    process.env.DELIVERY_ROOT = custom;
    expect(resolveDeliveryRoot()).toBe(custom);
    if (prev !== undefined) process.env.DELIVERY_ROOT = prev;
    else delete process.env.DELIVERY_ROOT;
  });

  it('resolveDeliveryRoot 参数最高优先级', () => {
    const prev = process.env.DELIVERY_ROOT;
    process.env.DELIVERY_ROOT = path.resolve('/custom/delivery');
    const arg = path.resolve('/arg');
    expect(resolveDeliveryRoot(arg)).toBe(arg);
    if (prev !== undefined) process.env.DELIVERY_ROOT = prev;
    else delete process.env.DELIVERY_ROOT;
  });
});
