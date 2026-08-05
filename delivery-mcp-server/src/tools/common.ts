/** MCP 工具响应辅助：统一结构化 JSON 输出 */
export function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function fail(code: string, message: string, details?: unknown) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ ok: false, code, message, details }, null, 2),
      },
    ],
  };
}

/** 工具执行上下文 */
export interface ToolContext {
  root: string;
}
