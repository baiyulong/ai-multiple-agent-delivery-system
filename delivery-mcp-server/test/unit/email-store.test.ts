import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isEmailConfigured,
  readEmailConfig,
  writeEmailConfig,
} from '../../src/core/store/email-store.js';
import { readCurrentUser, writeCurrentUser } from '../../src/core/store/user-store.js';

describe('email-store 邮件配置（当前用户个人级）', () => {
  let dir: string;
  let prevEnv: string | undefined;

  it('未配置时返回 null / configured=false', async () => {
    dir = await mkdtemp(join(tmpdir(), 'delivery-email-'));
    prevEnv = process.env.DELIVERY_USER_CONFIG;
    process.env.DELIVERY_USER_CONFIG = join(dir, 'user.json');
    expect(await readEmailConfig()).toBeNull();
    expect(await isEmailConfigured()).toBe(false);
  });

  it('写入后可读取，isEmailConfigured 为 true', async () => {
    const written = await writeEmailConfig({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      user: 'noreply@example.com',
      pass: 'secret',
      from: 'noreply@example.com',
    });
    expect(written.updated_at).toBeTruthy();

    const read = await readEmailConfig();
    expect(read?.host).toBe('smtp.example.com');
    expect(read?.port).toBe(465);
    expect(read?.secure).toBe(true);
    expect(read?.pass).toBe('secret');
    expect(await isEmailConfigured()).toBe(true);
  });

  it('缺少关键字段时 isEmailConfigured 为 false', async () => {
    await writeEmailConfig({
      host: '',
      port: 25,
      secure: false,
      user: '',
      pass: '',
      from: '',
    });
    expect(await isEmailConfigured()).toBe(false);
  });

  it('写入邮件配置不覆盖已有的姓名/邮箱；user.set 更新姓名不丢邮件配置', async () => {
    await writeCurrentUser({ name: 'Yulong', email: 'yulong@example.com' });
    await writeEmailConfig({
      host: 'smtp.qq.com',
      port: 465,
      secure: true,
      user: 'yulong@qq.com',
      pass: 'auth-code',
      from: 'yulong@qq.com',
    });

    const user = await readCurrentUser();
    expect(user?.name).toBe('Yulong');
    expect(user?.email).toBe('yulong@example.com');
    expect(user?.smtp?.pass).toBe('auth-code');

    await writeCurrentUser({ name: 'Yulong 2', email: 'yulong@example.com' });
    expect((await readCurrentUser())?.smtp?.host).toBe('smtp.qq.com');
  });

  it('清理临时目录', async () => {
    if (prevEnv !== undefined) process.env.DELIVERY_USER_CONFIG = prevEnv;
    else delete process.env.DELIVERY_USER_CONFIG;
    if (dir) await rm(dir, { recursive: true, force: true });
  });
});
