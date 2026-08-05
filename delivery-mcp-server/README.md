# AI 交付任务系统 · delivery-mcp-server

一个基于 **MCP (Model Context Protocol)** 的本地交付任务管理系统，为 OpenCode 多角色 Agent 接力工作流提供任务编排、交付物门禁与阶段推进能力。数据以纯文本文件存储在本地 `.delivery` 目录，无需数据库。

## 能力概览

- **任务编排**：创建任务时自动识别类型（CRUD / 轻量 DDD / 完整 DDD），加载对应流程模板。
- **阶段门禁**：每个阶段交付物需通过结构/必填/空值/禁语/列表数量五类检查（PRD 8.6 / 11.1）。
- **上游依赖**：缺失上游交付物时阻塞阶段并指派对应 Agent（PRD 7.3 / 7.4 / 12.2）。
- **返工闭环**：门禁失败 → 修订交付物（保留历史版本）→ 重新门禁 → 通过后完成阶段（PRD 12.3）。
- **问题阻塞**：未解决问题可阻塞阶段，解决后自动解除（PRD 7.9 / 8.8）。
- **交付包导出**：全部阶段完成后导出 `delivery_package.md`（PRD 16.5）。
- **配置化**：流程模板与门禁规则均支持用户配置优先、内置回退（PRD 14.1）。

## 技术栈

- Node.js ≥ 22（ESM）
- `@modelcontextprotocol/sdk`（stdio 传输）
- `zod`（工具入参校验）
- `vitest`（测试）、`tsup`（构建）、`tsx`（开发运行）

## 快速开始

```bash
cd delivery-mcp-server
npm install
npm run example   # 跑通一个完整 CRUD 流程走查
npm test          # 32 个测试（单测 + E2E 验收）
npm run build     # 产出 dist/server.js
npm run dashboard # 启动浏览器任务看板 http://localhost:8787
```

## 浏览器任务看板

`npm run dashboard` 启动本地只读看板，可视化浏览任务：列表/详情/阶段进度/门禁结果/交付物/问题/共享上下文。端口由 `DELIVERY_DASHBOARD_PORT` 或 `PORT` 控制（默认 8787），数据根默认当前目录 `.delivery`。

## MCP 工具（16 个）

| 工具 | 说明 |
|---|---|
| `task.create` | 创建任务，自动识别类型并初始化流程 |
| `task.get` | 获取任务详情、阶段、交付物、门禁记录 |
| `task.detect_type` | 仅做类型识别（不创建任务） |
| `task.get_flow` | 查看任务流程模板 |
| `task.export_delivery_package` | 导出交付包 |
| `stage.get` | 阶段状态、就绪度、缺失上游、指派 Agent |
| `stage.complete` | 完成阶段（四项前置条件校验） |
| `artifact.submit` | 提交交付物（校验上游与类型） |
| `artifact.get` / `artifact.list` | 读取交付物 |
| `artifact.update` | 修订交付物（保留历史版本） |
| `gate.check` | 执行门禁检查并记录结果 |
| `context.get_shared` / `context.update` | 读写共享上下文 |
| `question.create` / `question.resolve` | 创建/解决阻塞问题 |
| `team.get` / `team.set` | 查看/配置项目团队（姓名/邮箱/角色，一人可多角色） |

> 首次使用：`task.create` 前必须先 `team.set` 配置至少一名成员，否则返回 `team_not_configured`。

## 在 OpenCode 中注册

在项目根目录 `opencode.json` 添加：

```json
{
  "mcp": {
    "delivery": {
      "type": "local",
      "command": ["node", "delivery-mcp-server/dist/server.js"],
      "enabled": true
    }
  }
}
```

> 先执行 `npm run build` 生成 `dist/server.js`。也可用 `--import tsx src/server.ts` 直接以源码运行。

## 存储结构（`.delivery`）

```
.delivery/
├── config/
│   ├── flows/            # 流程模板（crud / lightweight-ddd / full-ddd）
│   └── gates/            # 门禁规则（17 个交付物类型）
└── tasks/
    └── TASK-YYYYMMDD-NNN/
        ├── task.json             # 任务元数据
        ├── stages.json           # 阶段状态
        ├── context.md            # 共享上下文（17 节）
        ├── questions.json        # 问题清单
        ├── artifacts/
        │   ├── index.json
        │   └── {stage}/{type}.md # 交付物（含历史版本）
        ├── gates/{stage}.gate.json
        └── delivery_package.md   # 交付包（完成后生成）
```

## 环境变量

- `DELIVERY_ROOT`：指定 `.delivery` 根目录（默认取当前工作目录下的 `.delivery`）。

## 目录结构

```
src/
├── server.ts              # MCP 入口（stdio）
├── core/                  # 领域核心
│   ├── types.ts           # 类型定义
│   ├── flow-engine.ts     # 流程引擎
│   ├── type-detector.ts   # 任务类型识别
│   ├── gate-engine.ts     # 门禁引擎
│   ├── context-manager.ts # 共享上下文
│   ├── exporter.ts        # 交付包导出
│   └── store/             # 文件存储
├── tools/                 # 16 个 MCP 工具
config/                    # 流程模板 + 门禁规则
templates/                 # 上下文与交付物模板
test/                      # 单测 + E2E 验收
scripts/run-example.ts     # 示例走查
```

## 验收覆盖（PRD 第 16 章）

- 16.1 CRUD 全流程闭环
- 16.2 缺失上游阻塞 + 指派 Agent
- 16.3 门禁失败返回 `missing_sections`
- 16.4 阶段完成推进 `current_stage`
- 16.5 交付包导出
- 12.3 返工流程（修订 → 重新门禁）
- 7.9 / 8.8 问题阻塞与解除