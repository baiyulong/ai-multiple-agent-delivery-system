import { readEmailConfig } from './store/email-store.js';
import { findMemberByEmail, findMembersByRole } from './store/team-store.js';
import { sendEmail } from './mailer.js';

/**
 * 角色通知：向指定角色的所有成员发送邮件。
 * 提供 opts.assignees 时只通知这些指派成员（一个角色可指派多人）；否则通知该角色全部成员。
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
  opts?: { assignees?: string[] }, // 指派成员邮箱列表，提供时只通知这些成员
): Promise<NotifyResult> {
  try {
    const config = await readEmailConfig();
    if (!config) {
      return { sent: false, to: [], reason: 'email_not_configured' };
    }

    const to: string[] = [];
    if (opts?.assignees && opts.assignees.length > 0) {
      for (const email of opts.assignees) {
        const member = await findMemberByEmail(root, email);
        if (member) to.push(member.email);
      }
      if (to.length === 0) {
        return { sent: false, to: [], reason: 'assignee_not_found' };
      }
    } else {
      const members = await findMembersByRole(root, role);
      for (const m of members) to.push(m.email);
    }
    const unique = [...new Set(to)];
    if (unique.length === 0) {
      return { sent: false, to: [], reason: 'no_recipients' };
    }

    await sendEmail(config, { to: unique, subject, text });
    return { sent: true, to: unique };
  } catch (e) {
    return { sent: false, to: [], reason: e instanceof Error ? e.message : String(e) };
  }
}