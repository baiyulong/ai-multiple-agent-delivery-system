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
  // SMTP 超时上限（可经 DELIVERY_SMTP_TIMEOUT_MS 调整）：
  // nodemailer 默认连接超时 60s+，SMTP 挂起会阻塞 gate.check/stage.complete 等工具响应，
  // 导致客户端 MCP 超时但服务端最终执行成功（超时≠失败）。限制为短超时 + 快速失败。
  const timeoutMs = Number(process.env.DELIVERY_SMTP_TIMEOUT_MS ?? 15_000) || 15_000;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.pass ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  });

  await transporter.sendMail({
    from: config.from,
    to: opts.to.join(', '),
    subject: opts.subject,
    text: opts.text,
  });
}