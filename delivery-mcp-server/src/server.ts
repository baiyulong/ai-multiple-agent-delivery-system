#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initDeliveryRoot } from './core/init.js';
import { resolveDeliveryRoot } from './core/paths.js';
import { registerTaskTools } from './tools/task.js';
import { registerStageTools } from './tools/stage.js';
import { registerArtifactTools } from './tools/artifact.js';
import { registerGateTools } from './tools/gate.js';
import { registerContextTools } from './tools/context.js';
import { registerQuestionTools } from './tools/question.js';

const root = resolveDeliveryRoot();

async function main(): Promise<void> {
  await initDeliveryRoot(root);

  const server = new McpServer({
    name: 'delivery-mcp-server',
    version: '0.1.0',
  });

  const ctx = () => ({ root });

  registerTaskTools(server, ctx);
  registerStageTools(server, ctx);
  registerArtifactTools(server, ctx);
  registerGateTools(server, ctx);
  registerContextTools(server, ctx);
  registerQuestionTools(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(`[delivery-mcp-server] 启动失败: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
