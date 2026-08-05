/** 时间工具：ISO8601 带本地时区偏移（PRD 示例 2026-08-04T21:11:00+08:00） */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 当前时间，本地时区偏移 ISO 字符串 */
export function nowIso(date: Date = new Date()): string {
  const tzOffset = -date.getTimezoneOffset();
  const sign = tzOffset >= 0 ? '+' : '-';
  const abs = Math.abs(tzOffset);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${offset}`
  );
}

/** 当日日期戳 YYYYMMDD（本地时区），用于 ID 生成 */
export function todayStamp(date: Date = new Date()): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}
