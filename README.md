# AI 交付任务系统（AI Delivery Task System）

基于 **MCP (Model Context Protocol)** 的多角色 Agent 项目交付编排系统。它把项目交付拆成**七角色接力工作流**（产品经理 → UI/UX → 领域架构 → 工程实现 → QA → DevOps），通过**阶段门禁**保证每个交付物达标后才进入下一阶段，所有任务状态以纯文本文件保存在本地 `.delivery` 目录，无数据库。

适用于 OpenCode 等支持 MCP 的 AI 编程工具。

---

## 目录

- [系统组成](#系统组成)
- [整体工作原理](#整体工作原理)
- [快速开始](#快速开始)
- [在新项目中使用](#在新项目中使用)
- [MCP 工具一览](#mcp-工具一览)
- [工作流示例](#工作流示例)
- [团队配置](#团队配置)
- [浏览器任务看板](#浏览器任务看板)
- [存储结构](#存储结构)
- [自定义流程与门禁](#自定义流程与门禁)
- [测试与验证](#测试与验证)
- [常见问题](#常见问题)

---

## 系统组成

| 组成 | 路径 | 说明 |
|---|---|---|
| **MCP Server** | `delivery-mcp-server/` | 16 个工具：任务/阶段/交付物/门禁/上下文/问题 |
| **流程模板** | `delivery-mcp-server/config/flows/` | crud（5 阶段）/ lightweight-ddd（6 阶段）/ full-ddd（7 阶段） |
| **门禁规则** | `delivery-mcp-server/config/gates/` | 17 个交付物类型的检查规则 |
| **交付物模板** | `delivery-mcp-server/templates/` | 共享上下文 + 17 个交付物模板 |
| **多角色 Agent** | `.opencode/agent/` | 8 个 OpenCode Agent（1 总控 + 7 角色） |
| **OpenCode 注册** | `opencode.json` | 将 MCP server 注册给 OpenCode |
| **设计文档** | `AI 任务管理系统 PRD.md`、`自定义多角色 Agent 设计稿.md`、`AI 交付任务系统实现计划.md` | 需求、角色设计、实现计划 |

## 整体工作原理

```
你描述新需求
     ↓
delivery-orchestrator（总控）创建任务，自动识别任务类型
     ↓
任务进入第一个阶段，总控指派对应角色 Agent
     ↓
角色 Agent 生成交付物 → artifact.submit 提交
     ↓
gate.check 门禁检查（缺章节/含禁语/验收标准不足 → 打回修订）
     ↓
stage.complete 完成阶段 → 自动推进到下一阶段
     ↓
… 依次经过全部阶段 …
     ↓
task.export_delivery_package 导出交付包
```

核心设计：
- **门禁是硬约束**：交付物不达标，阶段无法完成，必须修订重提。
- **上游依赖**：下游阶段在上游未完成时被阻塞，并自动指派对应角色补齐。
- **问题阻塞**：角色有疑问可创建问题阻塞阶段，解决后解除。
- **类型自适应**：简单 CRUD 用 5 阶段轻流程，复杂核心业务自动走完整 DDD 流程。

---

## 快速开始

### 方式一：让 AI 帮你安装（推荐）

把本仓库的 **install.md** 链接交给你的 AI 工具，AI 会按步骤自动完成克隆、构建、注册 MCP 与首次配置：

```
https://github.com/baiyulong/ai-multiple-agent-delivery-system/blob/main/install.md
```

> 在 OpenCode 中直接说："请根据这个链接安装 AI 交付任务系统：<install.md 链接>"，AI 会读取 install.md 并自动执行安装。

### 方式二：手动安装

要求：**Node.js ≥ 22**

```bash
# 1. 安装依赖
cd delivery-mcp-server
npm install

# 2. 构建（产出 dist/server.js，OpenCode 引用的就是它）
npm run build

# 3. 跑通一个完整示例（可选）
npm run example

# 4. 跑全部测试（可选）
npm test
```

---

## 在新项目中使用

### 1. 拷贝组件到新项目

把以下内容放到你的新项目根目录：

```
your-project/
├── .opencode/                 # 8 个 Agent 配置
├── delivery-mcp-server/       # MCP server（可 git submodule 引用）
└── opencode.json              # MCP 注册
```

### 2. 构建 server

```bash
cd delivery-mcp-server && npm install && npm run build
```

### 3. 确认 opencode.json

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

### 4. 在 OpenCode 中开始交付

打开 OpenCode，选择 **delivery-orchestrator**（交付编排总控）Agent，直接描述你的需求，例如：

> 帮我做一个"供应商准入管理"功能：供应商提交准入申请，采购部门审核，通过后进入供应商库。

总控 Agent 会依次：
1. `task.create` 创建任务（自动识别类型为 crud / lightweight_ddd / full_ddd / analysis）
2. 查看 `stage.get` 确定当前阶段与指派角色
3. 调用对应角色 Agent（`delivery-product-manager` / `delivery-ux-designer` / `delivery-domain-architect` / `delivery-engineer` / `delivery-qa` / `delivery-devops`）生成交付物
4. `artifact.submit` 提交 → `gate.check` 门禁 → `stage.complete` 推进
5. 全部完成后 `task.export_delivery_package` 导出交付包

### 查看任务进度

- 让总控调用 `task.get <task_id>` 查看阶段状态、交付物与待确认问题。
- 或直接打开 `.delivery/tasks/TASK-xxx/` 下的文件。
- 或启动**浏览器任务看板**（见下节），可视化浏览全部任务。

---

## 团队配置

系统要求项目先配置**参与人及其角色**（一人可担任多个角色），首次使用（创建任务）前必须配置。

### 通过 MCP 配置

```jsonc
// team.set：新增或更新成员（按邮箱匹配，roles 覆盖）
{
  "name": "Yulong",
  "email": "xiaoum@live.com",
  "roles": ["product-manager", "engineer"]   // 一人可多角色
}
```

- `team.get`：查看当前团队配置（含角色中文映射）。
- 未配置时 `task.create` 会返回 `team_not_configured`，提示先配置。
- 配置保存在 `.delivery/config/team.json`（项目级，gitignore 排除）。

### 角色列表

所有角色 Agent 文件均以 `delivery-` 前缀命名，避免与目标项目已有同名 agent 冲突。角色 key（team.json 中 roles 值）与 Agent 文件名是两个概念。

| 角色 key | 中文名 | Agent 文件名 |
|---|---|---|
| delivery-orchestrator | 交付编排总控 | delivery-orchestrator.md |
| domain-expert | 业务专家 | delivery-domain-expert.md |
| product-manager | 产品经理 | delivery-product-manager.md |
| ux-designer | UI/UX 设计 | delivery-ux-designer.md |
| domain-architect | 领域架构师 | delivery-domain-architect.md |
| engineer | 工程实现 | delivery-engineer.md |
| qa | 质量测试 | delivery-qa.md |
| devops | 平台与 DevOps | delivery-devops.md |

看板顶部会显示当前团队成员（姓名/邮箱/角色），未配置时显示提示条。

---

## 浏览器任务看板

无需登录的本地只读看板，用浏览器浏览任务情况：任务列表、阶段进度、门禁结果、交付物正文、待确认问题、共享上下文、公共文档。

```bash
cd delivery-mcp-server
npm run dashboard
# 输出: AI 交付任务看板已启动: http://localhost:8787
```

打开 `http://localhost:8787` 即可。

- **任务列表**：任务卡片（标题、类型、状态、阶段进度条），点击进入详情，8 秒自动刷新。
- **任务详情**：阶段步骤条、门禁结果徽章（passed/failed/warning）、交付物列表（点击展开 markdown 正文）、待确认问题、共享上下文、交付包（任务完成后可查看）。
- **公共文档**：首页标签导航"任务列表 / 公共文档"，跨任务聚合架构师的 `ubiquitous_language_code_map`（业务统一语言·代码映射）与 `technical_architecture`（技术架构文档），按类型分组、点击展开正文。

配置：

| 项 | 说明 |
|---|---|
| 端口 | 环境变量 `DELIVERY_DASHBOARD_PORT` 或 `PORT`，默认 `8787`；被占用时自动回退随机端口，实际端口写入 `<数据根>/dashboard.port` |
| 数据根 | 环境变量 `DELIVERY_ROOT`，默认当前目录 `.delivery` |

> 看板是独立入口，与 MCP server（`npm run dev`）互不影响，可同时运行。

---

## MCP 工具一览

> 每次启动自动检测新版本，更新需主动触发（`update.check` 查看、`update.apply` 更新）。

| 工具 | 说明 |
|---|---|
| `task.create` | 创建任务，自动识别类型并初始化流程；可指定 assignees（各角色负责人）、skip_stages（跳过不需要的阶段） |
| `task.assign` | 为任务指定/改派某角色负责人（role -> 成员邮箱） |
| `task.get` | 获取任务详情（任务/阶段/交付物/待确认问题） |
| `task.detect_type` | 仅做类型识别 |
| `task.get_flow` | 查看任务类型对应的流程模板 |
| `task.export_delivery_package` | 导出交付包（需全部阶段完成） |
| `stage.get` | 阶段状态、就绪度、缺失上游、指派 Agent、阻塞问题 |
| `stage.complete` | 完成阶段（四项前置校验：交付物存在 / 已门禁通过 / 无阻塞问题） |
| `artifact.submit` | 提交交付物（校验上游阶段与类型） |
| `artifact.get` / `artifact.list` | 读取交付物 |
| `artifact.update` | 修订交付物（保留历史版本） |
| `gate.check` | 执行门禁检查并记录结果 |
| `context.get_shared` / `context.update` | 读写共享上下文 |
| `question.create` / `question.resolve` | 创建/解决阻塞问题 |
| `update.check` | 检查系统新版本，可选 force 强制重新检测 |
| `update.apply` | 从 GitHub Releases 手动更新工具本体，需 confirm:true |

---

## 工作流示例

### 完整交付（核心业务）

```
crud_spec_card → ux_interaction_card → ddd_applicability_review + ubiquitous_language_code_map + technical_architecture → engineering_plan → qa_test_plan
```

| 阶段 | 角色 Agent | 必需交付物 | 门禁规则 |
|---|---|---|---|
| product_requirement | product-manager | crud_spec_card / product_requirement_card | 14 章节必填、含删除规则、验收标准 ≥3 条 |
| ux_design | ux-designer | ux_interaction_card | 17 章节、状态与按钮矩阵 |
| domain_review | domain-architect | ddd_applicability_review + ubiquitous_language_code_map + technical_architecture | DDD 适用性判断 + 术语-代码映射 + 技术架构章节 |
| engineering_design | engineer | engineering_plan | 12 章节、API/数据模型/测试建议 |
| qa_validation | qa | qa_test_plan | 测试策略、功能用例 ≥3 条 |

### 简单 CRUD

`product_requirement → ux_design → domain_review(轻量审核) → engineering_design → qa_validation`，不强行套 DDD。

---

## 存储结构

```
.delivery/
├── config/                    # 初始化时从内置模板复制（用户可改）
│   ├── flows/                 # 流程模板
│   ├── gates/                 # 门禁规则
│   └── architectures/         # 预设架构模板（全新项目用）
└── tasks/
    └── TASK-YYYYMMDD-NNN/
        ├── task.json          # 任务元数据
        ├── stages.json        # 阶段状态
        ├── context.md         # 共享上下文（17 节）
        ├── questions.json     # 问题清单
        ├── artifacts/
        │   ├── index.json
        │   └── {stage}/{type}.md   # 交付物（含历史版本 v{n}）
        ├── gates/{stage}.gate.json # 门禁记录
        └── delivery_package.md     # 交付包（完成后导出）
```

- 任务 ID 按日递增：`TASK-20260805-001`
- 存储根目录优先级：工具传入 `root` > 环境变量 `DELIVERY_ROOT` > 当前工作目录 `.delivery`

---

## 自定义流程与门禁

所有流程与门禁规则都是 JSON 配置，**用户配置优先于内置**：

- **修改流程**：编辑 `.delivery/config/flows/<type>-flow.json` 或 `delivery-mcp-server/config/flows/`，可增删阶段、调整角色、设置 `allow_skip`、指定上游依赖。
- **修改门禁**：编辑 `.delivery/config/gates/<artifact_type>.json`，规则支持四类检查：
  - `required_sections`：必需章节（缺一章扣 15 分）
  - `non_empty_sections`：内容不可为空
  - `forbidden_patterns`：禁止写法（如"按权限控制"等模糊表述）
  - `min_list_items`：列表项下限（如验收标准 ≥3 条）

门禁结果：`missing > 0` → failed；`issues > 0` → failed；`score < 60` → warning；否则 passed。

---

## 测试与验证

```bash
cd delivery-mcp-server
npm test          # 32 个测试（26 单测 + 6 E2E）
npm run typecheck # TypeScript 类型检查
npm run build     # 构建
```

E2E 验收覆盖 PRD 第 16 章五个场景：CRUD 全流程闭环、缺失上游阻塞、门禁失败、阶段推进、交付包导出，以及返工流程与问题阻塞。

---

## 常见问题

**Q：任务数据存在哪里？**
A：项目下的 `.delivery/tasks/`，纯文本文件，可追踪、可版本管理。

**Q：门禁没过怎么办？**
A：用 `artifact.update` 修订交付物（保留历史版本），重新 `gate.check`，通过后再 `stage.complete`。

**Q：一个阶段能不能并行多个角色？**
A：阶段按 `required_artifact_types` 支持多交付物；并行多个角色可各自提交后分别门禁，全部达标后完成阶段。

**Q：想换存储位置？**
A：设置环境变量 `DELIVERY_ROOT` 指向目标目录。

**Q：OpenCode 里工具找不到？**
A：确认已 `npm run build` 生成 `dist/server.js`，且 `opencode.json` 路径正确，重启 OpenCode。
