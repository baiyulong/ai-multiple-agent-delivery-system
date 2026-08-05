import { homedir } from 'node:os';
import { join } from 'node:path';
import { readJson, writeJsonAtomic } from '../fsx.js';
import { nowIso } from '../time.js';

/**
 * 个人配置（当前操作人）：姓名 + 邮箱。
 * 这是"我是谁"的身份配置，属于机器/个人级，跨项目沿用，
 * 与项目级团队名册（.delivery/config/team.json）分离。
 *
 * 存储：~/.config/ai-delivery/user.json（可用环境变量 DELIVERY_USER_CONFIG 覆盖，便于测试）
 */

export interface CurrentUser {
  name: string;
  email: string;
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

/** 写入当前人（覆盖更新） */
export async function writeCurrentUser(user: Pick<CurrentUser, 'name' | 'email'>): Promise<CurrentUser> {
  const full: CurrentUser = { name: user.name, email: user.email, updated_at: nowIso() };
  await writeJsonAtomic(userConfigPath(), full);
  return full;
}

/** 是否已配置当前人 */
export async function isUserConfigured(): Promise<boolean> {
  const user = await readCurrentUser();
  return user !== null && !!user.name && !!user.email;
}
