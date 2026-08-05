import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isUserConfigured,
  readCurrentUser,
  userConfigPath,
  writeCurrentUser,
} from '../../src/core/store/user-store.js';

describe('user-store 个人配置', () => {
  let dir: string;
  let prevEnv: string | undefined;

  it('默认路径在用户主目录 .config/ai-delivery/user.json', () => {
    const prev = process.env.DELIVERY_USER_CONFIG;
    delete process.env.DELIVERY_USER_CONFIG;
    expect(userConfigPath()).toContain('.config');
    expect(userConfigPath()).toContain('ai-delivery');
    expect(userConfigPath()).toContain('user.json');
    if (prev !== undefined) process.env.DELIVERY_USER_CONFIG = prev;
  });

  it('未配置时返回 null / configured=false', async () => {
    dir = await mkdtemp(join(tmpdir(), 'delivery-user-'));
    prevEnv = process.env.DELIVERY_USER_CONFIG;
    process.env.DELIVERY_USER_CONFIG = join(dir, 'user.json');
    expect(await readCurrentUser()).toBeNull();
    expect(await isUserConfigured()).toBe(false);
  });

  it('写入后可读取，且 isUserConfigured 为 true', async () => {
    const written = await writeCurrentUser({ name: 'Yulong', email: 'yulong@example.com' });
    expect(written.name).toBe('Yulong');
    expect(written.email).toBe('yulong@example.com');
    expect(written.updated_at).toBeTruthy();

    const read = await readCurrentUser();
    expect(read?.name).toBe('Yulong');
    expect(read?.email).toBe('yulong@example.com');
    expect(await isUserConfigured()).toBe(true);
  });

  it('覆盖更新同名邮箱', async () => {
    await writeCurrentUser({ name: 'Yulong', email: 'yulong@example.com' });
    const updated = await writeCurrentUser({ name: 'Yulong 2', email: 'yulong@example.com' });
    expect(updated.name).toBe('Yulong 2');
    expect((await readCurrentUser())?.name).toBe('Yulong 2');
  });

  it('清理临时目录', async () => {
    if (prevEnv !== undefined) process.env.DELIVERY_USER_CONFIG = prevEnv;
    else delete process.env.DELIVERY_USER_CONFIG;
    if (dir) await rm(dir, { recursive: true, force: true });
  });
});