import nodemailer from 'nodemailer';
import type { EmailConfig } from './store/email-store.js';

/**
 * 邮件发送（基于 nodemailer）。
 * 仅负责发送，不处理业务逻辑；异常由调用方捕获。
 */

export interface SendEmailOptions {
  to: string[];
  subject: string;
  text: string;
}

export async function sendEmail(config: EmailConfig, opts: SendEmailOptions): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.pass ? { user: config.user, pass: config.pass } : undefined,
  });

  await transporter.sendMail({
    from: config.from,
    to: opts.to.join(', '),
    subject: opts.subject,
    text: opts.text,
  });
}