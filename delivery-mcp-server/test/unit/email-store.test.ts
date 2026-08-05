import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isEmailConfigured,
  readEmailConfig,
  writeEmailConfig,
} from '../../src/core/store/email-store.js';

describe('email-store 邮件配置', () => {
  let dir: string;
  let prevEnv: string | undefined;

  it('未配置时返回 null / configured=false', async () => {
    dir = await mkdtemp(join(tmpdir(), 'delivery-email-'));
    prevEnv = process.env.DELIVERY_ROOT;
    process.env.DELIVERY_ROOT = dir;
    expect(await readEmailConfig(dir)).toBeNull();
    expect(await isEmailConfigured(dir)).toBe(false);
  });

  it('写入后可读取，isEmailConfigured 为 true', async () => {
    const written = await writeEmailConfig(dir, {
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      user: 'noreply@example.com',
      pass: 'secret',
      from: 'noreply@example.com',
    });
    expect(written.updated_at).toBeTruthy();

    const read = await readEmailConfig(dir);
    expect(read?.host).toBe('smtp.example.com');
    expect(read?.port).toBe(465);
    expect(read?.secure).toBe(true);
    expect(read?.pass).toBe('secret');
    expect(await isEmailConfigured(dir)).toBe(true);
  });

  it('缺少关键字段时 isEmailConfigured 为 false', async () => {
    await writeEmailConfig(dir, {
      host: '',
      port: 25,
      secure: false,
      user: '',
      pass: '',
      from: '',
    });
    expect(await isEmailConfigured(dir)).toBe(false);
  });

  it('清理临时目录', async () => {
    if (prevEnv !== undefined) process.env.DELIVERY_ROOT = prevEnv;
    else delete process.env.DELIVERY_ROOT;
    if (dir) await rm(dir, { recursive: true, force: true });
  });
});