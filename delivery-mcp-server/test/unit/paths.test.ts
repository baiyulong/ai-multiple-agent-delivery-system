import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { PathSandboxError, assertInside, resolveDeliveryRoot } from '../../src/core/paths.js';

describe('paths 沙箱', () => {
  const root = 'C:/delivery';

  it('允许根内路径', () => {
    expect(assertInside(root, join(root, 'tasks', 'TASK-1'))).toBe(join(root, 'tasks', 'TASK-1'));
  });

  it('拒绝 .. 逃逸', () => {
    expect(() => assertInside(root, join(root, '..', 'etc', 'passwd'))).toThrow(PathSandboxError);
  });

  it('拒绝根外绝对路径', () => {
    expect(() => assertInside(root, 'C:/Windows/system32')).toThrow(PathSandboxError);
  });

  it('resolveDeliveryRoot 默认 cwd/.delivery', () => {
    const prev = process.env.DELIVERY_ROOT;
    delete process.env.DELIVERY_ROOT;
    expect(resolveDeliveryRoot()).toBe(join(process.cwd(), '.delivery'));
    if (prev !== undefined) process.env.DELIVERY_ROOT = prev;
  });

  it('resolveDeliveryRoot 优先环境变量', () => {
    const prev = process.env.DELIVERY_ROOT;
    process.env.DELIVERY_ROOT = 'C:/custom/delivery';
    expect(resolveDeliveryRoot()).toBe(join('C:/custom/delivery'));
    if (prev !== undefined) process.env.DELIVERY_ROOT = prev;
    else delete process.env.DELIVERY_ROOT;
  });

  it('resolveDeliveryRoot 参数最高优先级', () => {
    const prev = process.env.DELIVERY_ROOT;
    process.env.DELIVERY_ROOT = 'C:/custom/delivery';
    expect(resolveDeliveryRoot('C:/arg')).toBe(join('C:/arg'));
    if (prev !== undefined) process.env.DELIVERY_ROOT = prev;
    else delete process.env.DELIVERY_ROOT;
  });
});