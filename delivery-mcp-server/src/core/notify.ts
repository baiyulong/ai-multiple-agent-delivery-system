import { readEmailConfig } from './store/email-store.js';
import { findMemberByEmail, findMembersByRole, findMemberByName } from './store/team-store.js';
import { sendEmail } from './mailer.js';
import { dashboardUrl } from './dashboard-url.js';
import { t } from './i18n.js';

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

/**
 * 按"具体人"通知：支持三种标识方式，取第一个能解析到成员的结果。
 * 1) 邮箱精确匹配 2) 姓名匹配 3) 角色 key（回退 notifyRole）。
 * 用于解决问题后通知解决人（resolved_by 可能是邮箱/姓名/角色）。
 */
export async function notifyPerson(
  root: string,
  person: string,
  subject: string,
  text: string,
): Promise<NotifyResult> {
  const member = (await findMemberByEmail(root, person)) ?? (await findMemberByName(root, person));
  if (member) {
    try {
      const config = await readEmailConfig();
      if (!config) return { sent: false, to: [], reason: 'email_not_configured' };
      await sendEmail(config, { to: [member.email], subject, text });
      return { sent: true, to: [member.email] };
    } catch (e) {
      return { sent: false, to: [], reason: e instanceof Error ? e.message : String(e) };
    }
  }
  // 角色 key 回退
  return notifyRole(root, person, subject, text);
}

/** 邮件正文页脚：下一步如何操作（如何查看任务、启动看板、让 AI 查看） */
export function nextStepsFooter(taskId: string): string {
  const url = dashboardUrl(taskId);
  return [
    '',
    t('email.footer.next_steps'),
    t('email.footer.step1', { url }),
    t('email.footer.step2'),
    t('email.footer.step3', { id: taskId }),
  ].join('\n');
}