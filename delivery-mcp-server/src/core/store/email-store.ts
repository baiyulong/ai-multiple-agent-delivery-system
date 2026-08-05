import { join } from 'node:path';
import { assertInside } from '../paths.js';
import { readJson, writeJsonAtomic } from '../fsx.js';
import { nowIso } from '../time.js';

/**
 * 邮件通知配置（项目级）：SMTP 服务器信息与发件人。
 * 配置文件：config/email.json
 *
 * pass 仅用于发送，绝不通过工具返回。
 */

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  /** 命中的内置服务商 key（可选，如 qq/163/gmail；手动配置时无） */
  provider?: string;
}

export interface EmailConfigFile extends EmailConfig {
  updated_at: string;
}

function emailConfigFile(root: string): string {
  return assertInside(root, join(root, 'config', 'email.json'));
}

/** 读取邮件配置，未配置返回 null */
export async function readEmailConfig(root: string): Promise<EmailConfig | null> {
  const cfg = await readJson<EmailConfigFile>(emailConfigFile(root));
  if (!cfg) return null;
  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    user: cfg.user,
    pass: cfg.pass,
    from: cfg.from,
  };
}

/** 写入邮件配置 */
export async function writeEmailConfig(root: string, cfg: EmailConfig): Promise<EmailConfigFile> {
  const file: EmailConfigFile = { ...cfg, updated_at: nowIso() };
  await writeJsonAtomic(emailConfigFile(root), file);
  return file;
}

/** 是否已配置邮件 */
export async function isEmailConfigured(root: string): Promise<boolean> {
  const cfg = await readEmailConfig(root);
  return cfg !== null && Boolean(cfg.host && cfg.user && cfg.from);
}