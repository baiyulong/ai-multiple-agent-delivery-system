import { readCurrentUser, writeUserConfig, type SmtpConfig } from './user-store.js';
import { nowIso } from '../time.js';

/**
 * 邮件通知配置（当前用户个人级）：SMTP 服务器信息与发件人。
 * 存于个人配置文件 user.json 的 smtp 字段（~/.config/ai-delivery/user.json，
 * 可用环境变量 DELIVERY_USER_CONFIG 覆盖），与姓名/邮箱同文件、跨项目沿用。
 *
 * 不使用项目级/全局配置：发件服务器与认证信息（pass）只属于当前用户。
 * pass 仅用于发送，绝不通过工具返回。
 */

export interface EmailConfig extends SmtpConfig {}

export interface EmailConfigFile extends EmailConfig {
  updated_at: string;
}

/** 读取当前用户的邮件配置，未配置返回 null */
export async function readEmailConfig(): Promise<EmailConfigFile | null> {
  const user = await readCurrentUser();
  if (!user?.smtp) return null;
  return { ...user.smtp, updated_at: user.updated_at };
}

/** 写入当前用户的邮件配置（保留姓名/邮箱等已有字段） */
export async function writeEmailConfig(cfg: EmailConfig): Promise<EmailConfigFile> {
  const existing = await readCurrentUser();
  const user = await writeUserConfig({
    name: existing?.name ?? '',
    email: existing?.email ?? '',
    smtp: cfg,
    updated_at: nowIso(),
  });
  return { ...cfg, updated_at: user.updated_at };
}

/** 当前用户是否已配置邮件 */
export async function isEmailConfigured(): Promise<boolean> {
  const cfg = await readEmailConfig();
  return cfg !== null && Boolean(cfg.host && cfg.user && cfg.from);
}
