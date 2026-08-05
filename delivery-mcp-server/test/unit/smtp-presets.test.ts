import { describe, expect, it } from 'vitest';
import {
  PRESET_KEYS,
  SMTP_PRESETS,
  presetForEmail,
  resolveEmailConfig,
} from '../../src/core/smtp-presets.js';

describe('smtp-presets 内置服务商预设', () => {
  it('预设表齐全：包含国内主流邮箱 + 国际邮箱', () => {
    expect(PRESET_KEYS).toEqual(
      expect.arrayContaining(['qq', 'foxmail', '163', '126', 'yeah', 'gmail', 'outlook', 'icloud']),
    );
  });

  it('QQ 预设配置正确（SSL 465）', () => {
    const p = SMTP_PRESETS['qq'];
    expect(p.host).toBe('smtp.qq.com');
    expect(p.port).toBe(465);
    expect(p.secure).toBe(true);
  });

  it('Outlook 预设使用 STARTTLS 587', () => {
    const p = SMTP_PRESETS['outlook'];
    expect(p.host).toBe('smtp.office365.com');
    expect(p.port).toBe(587);
    expect(p.secure).toBe(false);
  });

  it('presetForEmail 按域名命中预设', () => {
    expect(presetForEmail('foo@qq.com')?.key).toBe('qq');
    expect(presetForEmail('foo@foxmail.com')?.key).toBe('foxmail');
    expect(presetForEmail('foo@163.com')?.key).toBe('163');
    expect(presetForEmail('foo@126.com')?.key).toBe('126');
    expect(presetForEmail('foo@yeah.net')?.key).toBe('yeah');
    expect(presetForEmail('foo@gmail.com')?.key).toBe('gmail');
    expect(presetForEmail('foo@outlook.com')?.key).toBe('outlook');
    expect(presetForEmail('foo@hotmail.com')?.key).toBe('outlook');
    expect(presetForEmail('foo@icloud.com')?.key).toBe('icloud');
  });

  it('presetForEmail 未知域名返回 null', () => {
    expect(presetForEmail('foo@example.com')).toBeNull();
    expect(presetForEmail('no-at-sign')).toBeNull();
  });
});

describe('resolveEmailConfig 配置解析', () => {
  it('只给邮箱+授权码：按域名自动填充', () => {
    const r = resolveEmailConfig({ user: 'me@qq.com' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config).toMatchObject({
      provider: 'qq',
      host: 'smtp.qq.com',
      port: 465,
      secure: true,
      user: 'me@qq.com',
      from: 'me@qq.com',
    });
  });

  it('显式指定 provider：使用预设值', () => {
    const r = resolveEmailConfig({ user: 'x@example.com', provider: '163' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config).toMatchObject({ provider: '163', host: 'smtp.163.com', port: 465, secure: true });
  });

  it('provider 覆盖端口/加密：Outlook 用 587 STARTTLS', () => {
    const r = resolveEmailConfig({ user: 'a@hotmail.com', provider: 'outlook' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config).toMatchObject({ host: 'smtp.office365.com', port: 587, secure: false });
  });

  it('显式 host + port：手动模式，secure 默认按 465 推断', () => {
    const r = resolveEmailConfig({ user: 'x@example.com', host: 'smtp.custom.com', port: 465 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config).toMatchObject({ host: 'smtp.custom.com', port: 465, secure: true });
  });

  it('显式 host 缺 port：返回 port_required', () => {
    const r = resolveEmailConfig({ user: 'x@example.com', host: 'smtp.custom.com' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('port_required');
  });

  it('未知 provider：返回 provider_unknown 并列出可用项', () => {
    const r = resolveEmailConfig({ user: 'x@example.com', provider: 'not-real' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('provider_unknown');
    expect(r.providers).toContain('qq');
  });

  it('无法推断且未指定 provider/host：返回 cannot_infer_provider', () => {
    const r = resolveEmailConfig({ user: 'x@example.com' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('cannot_infer_provider');
    expect(r.providers).toContain('163');
  });

  it('from 缺省取 user，显式 from 生效', () => {
    const r1 = resolveEmailConfig({ user: 'me@qq.com' });
    expect(r1.ok && r1.config.from).toBe('me@qq.com');
    const r2 = resolveEmailConfig({ user: 'me@qq.com', from: 'noreply@qq.com' });
    expect(r2.ok && r2.config.from).toBe('noreply@qq.com');
  });
});
