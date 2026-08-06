# AGENTS.md

This file provides guidance to the AI agent when working with code in this repository.

## 项目形态
- 本仓库是基于 MCP 的多角色交付编排系统。全部代码在 `delivery-mcp-server/`，所有 npm 命令必须在该目录下执行；要求 Node ≥ 22。
- 任务状态是 `.delivery/` 下的纯文本文件，无数据库。存储根优先级：工具参数 `root` > 环境变量 `DELIVERY_ROOT` > 当前目录 `.delivery/`。
- 用户配置优先于内置：运行时读 `.delivery/config/`，`delivery-mcp-server/config/` 只是初始化模板，改内置不会生效于已初始化的项目。

## 构建与测试
```bash
cd delivery-mcp-server
npm run build      # tsup → dist/server.js；opencode.json 引用的就是该产物，src 改动后必须重建
npm test           # vitest run
npm run typecheck  # tsc --noEmit
```
- ESM + NodeNext：本地导入必须带 `.js` 后缀。
- E2E 测试用内存传输 + `mkdtemp` 临时目录，不依赖真实 `.delivery/`。涉及用户配置的测试须通过 `DELIVERY_USER_CONFIG` 指向 harness 内文件，避免并行写 user.json 竞态（Windows rename 锁）。

## 约定
- 提交信息用中文，`feat:` / `fix:` / `docs:` 前缀，说明动机。文档、注释、UI 文案沿用中文风格。
- `.opencode/agent/` 下 Agent 文件统一 `delivery-` 前缀（避免覆盖目标项目同名 agent）；`team.json` 里的角色 key（如 `product-manager`）与 Agent 文件名是两个概念。
- `email.json` 是团队共享的公共 SMTP 配置，应随仓库提交——不要加入 .gitignore；任何真实邮箱授权码不得提交（install.js 安装时会排除）。

## 非显而易见的约束
- 门禁是硬约束：门禁未通过，或任务内存在任何 open 阻塞问题（不限阶段），`stage.complete` 必须拒绝。
- `task.create` 强制前置：未配置团队（team.json）或当前操作人（user.json）时返回 `team_not_configured` 类拦截，不要绕过。
- `install.js` 是跨平台一键安装脚本，修改时保持三原则：合并 opencode.json / 只新增不覆盖 / 排除授权码。
