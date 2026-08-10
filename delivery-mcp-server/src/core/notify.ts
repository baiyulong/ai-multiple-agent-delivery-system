import { readEmailConfig } from './store/email-store.js';
import { findMemberByEmail, findMembersByRole } from './store/team-store.js';
import { sendEmail } from './mailer.js';

/**
 * 角色通知：向指定角色的所有成员发送邮件。
 * 绝不 throw —— 任何失败都返回结构化结果，由调用方附加到工具返回对象。
 */

export interface NotifyResult {
  sent: boolean;
  to: string[];
  reason?: string;
}

export async function notifyRole(
  root: string,
  role: string,
  subject: string,
  text: string,
  opts?: { assignee?: string }, // 指派成员 email，提供时只通知该成员
): Promise<NotifyResult> {
  try {
    const config = await readEmailConfig();
    if (!config) {
      return { sent: false, to: [], reason: 'email_not_configured' };
    }

    let to: string[];
    if (opts?.assignee) {
      const member = await findMemberByEmail(root, opts.assignee);
      if (!member) {
        return { sent: false, to: [], reason: 'assignee_not_found' };
      }
      to = [member.email];
    } else {
      const members = await findMembersByRole(root, role);
      to = members.map((m) => m.email);
    }
    if (to.length === 0) {
      return { sent: false, to: [], reason: 'no_recipients' };
    }

    await sendEmail(config, { to, subject, text });
    return { sent: true, to };
  } catch (e) {
    return { sent: false, to: [], reason: e instanceof Error ? e.message : String(e) };
  }
}