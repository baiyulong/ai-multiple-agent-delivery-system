#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { join } from 'node:path';
import { initDeliveryRoot } from './core/init.js';
import { resolveDeliveryRoot } from './core/paths.js';
import { readJsonSync } from './core/fsx-sync.js';
import { packageRoot } from './core/locate.js';
import { registerTaskTools } from './tools/task.js';
import { registerStageTools } from './tools/stage.js';
import { registerArtifactTools } from './tools/artifact.js';
import { registerGateTools } from './tools/gate.js';
import { registerContextTools } from './tools/context.js';
import { registerQuestionTools } from './tools/question.js';
import { registerTeamTools } from './tools/team.js';
import { registerUserTools } from './tools/user.js';
import { registerEmailTools } from './tools/email.js';
import { registerUpdateTools } from './tools/update.js';
import { startBackgroundUpdateCheck } from './core/updater.js';

const root = resolveDeliveryRoot();

/** 从 package.json 读取版本号（随发布自动同步，避免硬编码失步） */
const SERVER_VERSION = readJsonSync<{ version?: string }>(join(packageRoot(), 'package.json'))?.version ?? '0.0.0';

async function main(): Promise<void> {
  await initDeliveryRoot(root);
  startBackgroundUpdateCheck(root);

  const server = new McpServer({
    name: 'delivery-mcp-server',
    version: SERVER_VERSION,
  });

  const ctx = () => ({ root });

  registerTaskTools(server, ctx);
  registerStageTools(server, ctx);
  registerArtifactTools(server, ctx);
  registerGateTools(server, ctx);
  registerContextTools(server, ctx);
  registerQuestionTools(server, ctx);
  registerTeamTools(server, ctx);
  registerUserTools(server, ctx);
  registerEmailTools(server, ctx);
  registerUpdateTools(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(`[delivery-mcp-server] 启动失败: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
