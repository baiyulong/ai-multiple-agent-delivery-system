/**
 * 内置邮件服务商 SMTP 预设。
 *
 * 让用户只需提供邮箱地址 + 授权码即可完成邮件配置：
 * - email.set 省略 host/port/secure/from 时，按 provider 或邮箱域名自动填充；
 * - 各服务商需开启 SMTP 服务并获取"授权码"（非登录密码）。
 */

export interface SmtpPreset {
  key: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  /** 使用该服务商需注意的限制/开启方式 */
  note?: string;
}

export const SMTP_PRESETS: Record<string, SmtpPreset> = {
  qq: {
    key: 'qq',
    name: 'QQ 邮箱',
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    note: '需在 QQ 邮箱网页端「设置 → 账户」开启 SMTP 服务并获取授权码。发送频率有限制。',
  },
  foxmail: {
    key: 'foxmail',
    name: 'Foxmail 邮箱',
    host: 'smtp.foxmail.com',
    port: 465,
    secure: true,
    note: '需开启 SMTP 服务并获取授权码。',
  },
  '163': {
    key: '163',
    name: '网易 163 邮箱',
    host: 'smtp.163.com',
    port: 465,
    secure: true,
    note: '需开启「IMAP/SMTP 服务」获取授权码。重要限制：只能发信给网易系邮箱（163/126/yeah.net），对外域（QQ/Gmail 等）默认被拒收。',
  },
  '126': {
    key: '126',
    name: '网易 126 邮箱',
    host: 'smtp.126.com',
    port: 465,
    secure: true,
    note: '需开启「IMAP/SMTP 服务」获取授权码。限制同 163：只能发信给网易系邮箱。',
  },
  yeah: {
    key: 'yeah',
    name: 'Yeah 邮箱',
    host: 'smtp.yeah.net',
    port: 465,
    secure: true,
    note: '需开启 SMTP 服务获取授权码。限制同 163：只能发信给网易系邮箱。',
  },
  gmail: {
    key: 'gmail',
    name: 'Gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    note: '需开启两步验证并生成「应用专用密码」（App Password），登录密码不可用。',
  },
  outlook: {
    key: 'outlook',
    name: 'Outlook / Hotmail',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    note: '使用 STARTTLS（587）。支持 outlook.com / hotmail.com / live.com / office365.com。',
  },
  icloud: {
    key: 'icloud',
    name: 'iCloud 邮箱',
    host: 'smtp.mail.me.com',
    port: 587,
    secure: false,
    note: '需开启 iCloud「App 专用密码」，且仅限 iCloud 用户间收发。',
  },
};

/** 邮箱域名 -> 预设 key（精确匹配 + 子域匹配） */
const DOMAIN_TO_PRESET: Array<[string, string]> = [
  ['qq.com', 'qq'],
  ['foxmail.com', 'foxmail'],
  ['163.com', '163'],
  ['126.com', '126'],
  ['yeah.net', 'yeah'],
  ['gmail.com', 'gmail'],
  ['outlook.com', 'outlook'],
  ['hotmail.com', 'outlook'],
  ['live.com', 'outlook'],
  ['office365.com', 'outlook'],
  ['icloud.com', 'icloud'],
  ['me.com', 'icloud'],
];

/** 按邮箱域名匹配内置预设，未匹配返回 null */
export function presetForEmail(email: string): SmtpPreset | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase();
  for (const [d, key] of DOMAIN_TO_PRESET) {
    if (domain === d || domain.endsWith(`.${d}`)) return SMTP_PRESETS[key] ?? null;
  }
  return null;
}

/** email.set 输入（host/port/secure/from 均可省略，由预设或域名推断） */
export interface EmailSetInput {
  provider?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  user: string;
  from?: string;
}

export interface ResolvedEmailConfig {
  provider?: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
}

export type EmailResolveResult =
  | { ok: true; config: ResolvedEmailConfig }
  | { ok: false; code: string; message: string; providers: string[] };

export const PRESET_KEYS = Object.keys(SMTP_PRESETS);

/**
 * 解析 email.set 入参为完整 SMTP 配置。
 * 优先级：显式 provider > 显式 host/port > 邮箱域名自动推断。
 */
export function resolveEmailConfig(input: EmailSetInput): EmailResolveResult {
  const user = input.user.trim();
  const from = input.from?.trim() || user;

  // ① 显式指定服务商
  if (input.provider) {
    const preset = SMTP_PRESETS[input.provider];
    if (!preset) {
      return {
        ok: false,
        code: 'provider_unknown',
        message: `未知邮件服务商: ${input.provider}。可选: ${PRESET_KEYS.join('、')}，或显式提供 host/port。`,
        providers: PRESET_KEYS,
      };
    }
    return {
      ok: true,
      config: {
        provider: preset.key,
        host: input.host || preset.host,
        port: input.port ?? preset.port,
        secure: input.secure ?? preset.secure,
        user,
        from,
      },
    };
  }

  // ② 显式提供 host（完全手动模式，port 必填）
  if (input.host) {
    if (input.port === undefined) {
      return {
        ok: false,
        code: 'port_required',
        message: '显式指定 host 时必须同时提供 port。',
        providers: PRESET_KEYS,
      };
    }
    return {
      ok: true,
      config: {
        host: input.host,
        port: input.port,
        secure: input.secure ?? input.port === 465,
        user,
        from,
      },
    };
  }

  // ③ 按邮箱域名自动推断
  const preset = presetForEmail(user);
  if (!preset) {
    return {
      ok: false,
      code: 'cannot_infer_provider',
      message: `无法从邮箱 ${user} 推断邮件服务商。请指定 provider（可选: ${PRESET_KEYS.join('、')}）或显式提供 host/port。`,
      providers: PRESET_KEYS,
    };
  }
  return {
    ok: true,
    config: {
      provider: preset.key,
      host: preset.host,
      port: preset.port,
      secure: preset.secure,
      user,
      from,
    },
  };
}
