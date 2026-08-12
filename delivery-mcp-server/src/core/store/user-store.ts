import { homedir } from 'node:os';
import { join } from 'node:path';
import { readJson, writeJsonAtomic } from '../fsx.js';
import { nowIso } from '../time.js';

/**
 * 个人配置（当前操作人）：姓名 + 邮箱 + 个人 SMTP 邮件配置。
 * 这是"我是谁"的身份配置，属于机器/个人级，跨项目沿用，
 * 与项目级团队名册（.delivery/config/team.json）分离。
 *
 * SMTP 服务器与认证信息（smtp.pass 授权码）属于当前用户个人，
 * 绝不写进项目仓库，仅存于本文件（个人主目录）。
 *
 * 存储：~/.config/ai-delivery/user.json（可用环境变量 DELIVERY_USER_CONFIG 覆盖，便于测试）
 */

/** 个人 SMTP 邮件配置：服务器 + 认证。pass 仅用于发送，绝不通过工具返回。 */
export interface SmtpConfig {
  /** 命中的内置服务商 key（可选，如 qq/163/gmail；手动配置时无） */
  provider?: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface CurrentUser {
  name: string;
  email: string;
  /** 个人 SMTP 邮件配置（可选，通过 email.set 写入） */
  smtp?: SmtpConfig;
  updated_at: string;
}

/** 个人配置文件路径：DELIVERY_USER_CONFIG > ~/.config/ai-delivery/user.json */
export function userConfigPath(): string {
  return process.env.DELIVERY_USER_CONFIG ?? join(homedir(), '.config', 'ai-delivery', 'user.json');
}

/** 读取当前人，未配置返回 null */
export async function readCurrentUser(): Promise<CurrentUser | null> {
  return readJson<CurrentUser>(userConfigPath());
}

/** 写入完整个人配置（覆盖更新；供内部及 email-store 使用） */
export async function writeUserConfig(user: CurrentUser): Promise<CurrentUser> {
  await writeJsonAtomic(userConfigPath(), user);
  return user;
}

/**
 * 更新姓名/邮箱（覆盖更新）。
 * smtpOverride 语义：undefined 保留已有 smtp；null 清空 smtp；
 * 传入 SmtpConfig 则覆盖为新值。
 * 保证现有调用方（如 tools/user.ts）不传第二参数时行为不变。
 */
export async function writeCurrentUser(
  user: Pick<CurrentUser, 'name' | 'email'>,
  smtpOverride?: SmtpConfig | null,
): Promise<CurrentUser> {
  const existing = await readCurrentUser();
  const full: CurrentUser = {
    name: user.name,
    email: user.email,
    smtp: smtpOverride === undefined ? existing?.smtp : smtpOverride ?? undefined,
    updated_at: nowIso(),
  };
  return writeUserConfig(full);
}

/** 是否已配置当前人 */
export async function isUserConfigured(): Promise<boolean> {
  const user = await readCurrentUser();
  return user !== null && !!user.name && !!user.email;
}
