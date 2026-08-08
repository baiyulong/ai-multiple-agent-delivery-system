# AI 交付任务系统 · 安装指南（install.md）

> 本文件是**给 AI 看的安装说明书**。用户只需把本文件的链接（或内容）交给 AI，AI 即可按步骤自动完成安装、注册与首次配置。
>
> 仓库：`https://github.com/baiyulong/ai-multiple-agent-delivery-system.git`

---

## 一、这是什么

一个基于 **MCP** 的多角色 Agent 项目交付编排系统。把项目交付拆成**七角色接力工作流**（产品经理 → UI/UX → 领域架构 → 工程实现 → QA → DevOps），通过**阶段门禁**保证每个交付物达标后才进入下一阶段。任务状态以纯文本文件保存在本地 `.delivery` 目录，无数据库。

适用于 **OpenCode** 等支持 MCP 的 AI 编程工具。

---

## 二、前提条件

| 项 | 要求 |
|---|---|
| Node.js | **≥ 22** |
| git | 已安装 |
| 目标工具 | OpenCode（或任意支持本地 MCP server 的 AI 工具） |

---

## 三、安装步骤（AI 执行）

> 目标：把 `delivery-mcp-server` 和 `.opencode/agent/` **安装到目标项目根目录**，这样 MCP 用相对路径引用、dashboard 从项目内启动即可读取项目自己的 `.delivery`。
>
> **推荐方式一：运行安装脚本 `install.js`（Windows/Linux 通用，自动完成全部步骤与安全合并），见下方【方式一】；也可按【方式二】手动逐步执行。**

### 方式一：一键安装脚本（推荐）

在**目标项目根目录**执行（需要 Node.js ≥ 22）：

```bash
# 从 GitHub Release 下载最新稳定版安装（推荐，体积小、版本固定）
node delivery-mcp-server/install.js --release

# 或指定本地仓库路径（脚本未与仓库同目录时）：
node delivery-mcp-server/install.js --repo /tmp/ai-delivery-system
```

脚本会自动：
1. **（--release 模式）** 从 GitHub Release 下载最新稳定版 tar.gz → 解压到临时目录 → 作为源码路径；若无 Release 则提示并退出
2. 校验目标目录（拒绝安装进本仓库自身、拒绝非 git 项目可加 `--force`）
3. 拷贝 `delivery-mcp-server/` 到目标项目（已存在则跳过并提示）
4. 拷贝 `.opencode/agent/` 角色配置到目标项目（**只新增 `delivery-*.md`，绝不覆盖目标项目已有 agent 文件**）
5. 合并 `opencode.json`：**保留目标项目已有的全部字段**（mcp/plugin/permission/agent 等），只新增 `mcp.delivery`，若已存在同名 mcp 则跳过
6. 追加 `.gitignore`：`delivery-mcp-server`（幂等）。注意 **`email.json` 不要排除**——它是团队共享的公共发件服务器配置，应随仓库提交，让所有成员复用同一个发件账号，无需各自配置授权码。
7. 在 `delivery-mcp-server` 内执行 `npm install` + `npm run build`
8. 可选 `--dashboard` 启动浏览器看板
9. 打印后续配置指引（user.set / team.set / email.set）
10. 自动清理临时文件

```bash
# 常用参数
node delivery-mcp-server/install.js                 # 安装到当前目录
node delivery-mcp-server/install.js /path/to/proj   # 安装到指定项目
node delivery-mcp-server/install.js --release       # 从 GitHub Release 下载最新稳定版
node delivery-mcp-server/install.js --repo ../clone # 指定本地仓库路径
node delivery-mcp-server/install.js --dashboard     # 安装后启动看板
node delivery-mcp-server/install.js --dry-run       # 只打印将要执行的操作，不改动文件
```

### 方式二：手动安装

#### 1. 获取源码（推荐从 Release 下载）

**方式 A：从 GitHub Release 下载（推荐，体积小、版本固定）**

```bash
# 查询最新 Release 版本
curl -s https://api.github.com/repos/baiyulong/ai-multiple-agent-delivery-system/releases/latest | grep tag_name

# 下载并解压（将 v0.1.0 替换为实际版本）
curl -L -o /tmp/release.tar.gz https://github.com/baiyulong/ai-multiple-agent-delivery-system/archive/refs/tags/v0.1.0.tar.gz
mkdir -p /tmp/ai-delivery-system
tar -xzf /tmp/release.tar.gz -C /tmp/ai-delivery-system --strip-components=1
```

**方式 B：git clone（完整源码，含 git history）**

```bash
git clone https://github.com/baiyulong/ai-multiple-agent-delivery-system.git /tmp/ai-delivery-system
```

#### 2. 拷贝组件到目标项目根目录

在**目标项目根目录**执行，把 server 与角色 Agent 配置拷进来：

```bash
# 拷贝 MCP server（含源码/配置/模板/前端）
cp -r /tmp/ai-delivery-system/delivery-mcp-server ./delivery-mcp-server

# 拷贝多角色 Agent 配置（8 个 delivery-*.md 角色文件）
mkdir -p .opencode/agent
cp -n /tmp/ai-delivery-system/.opencode/agent/delivery-*.md ./.opencode/agent/
```

> **重要**：所有角色 Agent 文件都以 `delivery-` 前缀命名（`delivery-engineer.md`、`delivery-qa.md` 等），**只新增、不覆盖**目标项目已有的同名 agent（如 `engineer.md`）。`cp -n` 保证已存在的同名文件不被覆盖。

#### 3. 安装依赖并构建

> **注意**：以下命令必须在 `delivery-mcp-server/` 目录下执行，否则会报 ENOENT（找不到 package.json）。

```bash
cd delivery-mcp-server
npm install
npm run build        # 产出 dist/server.js（OpenCode 引用的就是它）
```

#### 4. 验证构建产物存在

```bash
# 应存在：delivery-mcp-server/dist/server.js
```

#### 5. 注册 MCP 到目标项目（必须合并，禁止覆盖）

在**目标项目根目录**的 `opencode.json` 中**合并**添加（若文件不存在则创建）。**务必保留目标项目已有的全部字段**（如已有 `mcp`、`plugin`、`permission`、`agent` 等）：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "...目标项目已有 mcp...": {},
    "delivery": {
      "type": "local",
      "command": ["node", "delivery-mcp-server/dist/server.js"],
      "enabled": true
    }
  }
}
```

> **禁止整体覆盖**：目标项目若已有 `opencode.json`，只允许新增 `mcp.delivery` 字段，其余字段原样保留；若已存在 `mcp.delivery` 则跳过，不要重复添加。
> 因为 server 已装在项目内，`command` 用**相对路径** `delivery-mcp-server/dist/server.js` 即可，OpenCode 会以项目根目录为 cwd 启动它。

#### 6. 清理临时克隆

```bash
rm -rf /tmp/ai-delivery-system
```

#### 7. 启动浏览器任务看板并提示用户

> **注意**：`npm run dashboard` 必须在 `delivery-mcp-server/` 目录下执行，否则会报 ENOENT。

安装完成后，**立即启动 dashboard**，并告知用户可以用浏览器打开查看：

```bash
cd delivery-mcp-server
npm run dashboard
# 输出: AI 交付任务看板已启动: http://localhost:8787
```

**必须向用户提示**：
- 看板地址：`http://localhost:8787`（端口被占用时查看启动日志的实际端口）
- 说明：所有任务的新建与状态变化都可以在这个页面看到；`task.create` / `stage.complete` 等工具返回中也附带 `dashboard_url` 和 `view_hint`，可直接用浏览器打开查看对应任务。

> dashboard 会自动读取**项目根目录**的 `.delivery`（即 delivery-mcp-server 的父目录），无需额外配置。若想指定其他数据目录，设置环境变量 `DELIVERY_ROOT`。

#### 8. 将 delivery 相关文件加入 .gitignore

`delivery-mcp-server` 是从本仓库拷贝的**工具本体**（含 node_modules/dist），不属于目标项目的源码，应忽略。在**目标项目根目录**执行：

```bash
# .gitignore 不存在则创建；已存在则仅当无该条目时幂等追加
grep -qxF 'delivery-mcp-server' .gitignore 2>/dev/null || echo 'delivery-mcp-server' >> .gitignore
```

> 注意：`.delivery/`（任务数据）**不要**整目录忽略——它是目标项目的交付记录，建议纳入版本管理。
> **`email.json`（SMTP 发件配置）不要排除**——它是团队共享的**公共发件服务器**配置，应随仓库提交，让所有成员复用同一个发件账号，无需各自配置授权码。

---

## 四、首次使用配置（AI 执行）

系统要求项目先配置**当前操作人**与**团队名册**，否则 `task.create` 会被拦截（返回 `config_required`）。

### 1. 配置当前操作人（个人配置，跨项目沿用）

调用 MCP 工具 `user.set`：

```json
{
  "name": "用户姓名",
  "email": "user@example.com"
}
```

### 2. 配置团队名册（项目级，一人可多角色）

调用 MCP 工具 `team.set`：

```json
{
  "name": "用户姓名",
  "email": "user@example.com",
  "roles": ["product-manager", "engineer"]
}
```

> **重要约束**：团队名册的**全部成员 roles 并集必须覆盖全部 8 个角色**（见下表）。若缺角色，`team.set` 会返回 `roles_incomplete` 并列出缺失角色，需继续添加成员或为现有成员补角色，直到 8 个角色全部覆盖。
> 当前操作人的角色 = `user.set` 的邮箱在团队名册中匹配到的 roles。

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

> 所有角色 Agent 均以 `delivery-` 前缀命名，避免与目标项目已有的同名 agent（如 `engineer.md`）冲突。**角色 key（team.json 中的 roles 值）与 Agent 文件名是两个概念**：角色 key 不变，Agent 文件名带前缀。

### 3. 配置邮件通知（可选）

需要邮件通知时调用 `email.set`。**只需提供邮箱 + 授权码**，`host/port/secure` 会按邮箱域名自动填充（内置支持 QQ/163/126/yeah/Foxmail/Gmail/Outlook/iCloud）：

```json
{
  "user": "你的邮箱@qq.com",
  "pass": "SMTP 授权码"
}
```

也可显式指定服务商（`email.providers` 可列出全部内置服务商及注意事项）：

```json
{
  "provider": "qq",
  "user": "你的邮箱@qq.com",
  "pass": "SMTP 授权码"
}
```

若使用自定义 SMTP 服务器，显式提供 `host` + `port`：

```json
{
  "host": "smtp.example.com",
  "port": 465,
  "secure": true,
  "user": "noreply@example.com",
  "pass": "授权码",
  "from": "noreply@example.com"
}
```

> **授权码说明**：`pass` 是**服务商授权的 SMTP 授权码**，不是登录密码。需先在邮箱网页端开启「SMTP/IMAP 服务」并生成授权码（各服务商入口：QQ「设置→账户→开启服务」、163「设置→POP3/SMTP」、Gmail「Google 账户→两步验证→应用专用密码」）。未配置邮件不影响主流程（best-effort，发送失败静默跳过）。

---

## 五、验证安装

### 1. 确认 MCP 工具可用

在 OpenCode 中确认能看到以下工具组：`task.*`、`stage.*`、`artifact.*`、`gate.*`、`context.*`、`question.*`、`team.*`、`user.*`、`email.*`。

### 2. 跑通一个完整示例（可选）

```bash
cd delivery-mcp-server
npm run example
```

### 3. 启动浏览器任务看板（可选）

```bash
cd delivery-mcp-server
npm run dashboard
# 打开 http://localhost:8787
```

> dashboard 会自动读取**项目根目录**的 `.delivery`（即 delivery-mcp-server 的父目录），无需额外配置。若想指定其他数据目录，设置环境变量 `DELIVERY_ROOT`。

---

## 六、开始使用

在 OpenCode 中选择 **delivery-orchestrator**（交付编排总控）Agent，直接描述需求，例如：

> 帮我做一个"供应商准入管理"功能：供应商提交准入申请，采购部门审核，通过后进入供应商库。

总控 Agent 会依次：
1. `task.create` 创建任务（自动识别类型）
2. `stage.get` 确定当前阶段与指派角色
3. 调用对应角色 Agent 生成交付物
4. `artifact.submit` 提交 → `gate.check` 门禁 → `stage.complete` 推进
5. 全部完成后 `task.export_delivery_package` 导出交付包

> **用户确认**：每个角色完成阶段时，`stage.complete` 必须由**用户确认**（必填 `confirmed_by`，填用户姓名/邮箱）。AI 在完成阶段前应先向用户确认，得到确认后再调用 `stage.complete`。
> **看板提示**：`task.create` / `stage.complete` 返回中附带 `dashboard_url` 与 `view_hint`，AI 应据此提示用户"新任务已创建 / 阶段已推进，可在浏览器查看：<dashboard_url>"。

---

## 六·附、更新

### 方式一：一键更新（推荐）

已安装的项目可以直接用安装脚本更新到最新版：

```bash
# 在目标项目根目录执行
node delivery-mcp-server/install.js --release
```

脚本会自动下载最新 Release → 覆盖 `delivery-mcp-server/` 工具本体 + `delivery-*.md` 角色配置 → 重新构建。**保留 `.delivery` 任务数据**与 `opencode.json` 中的自定义配置。

### 方式二：MCP 工具更新

- **每次启动自动检测**：OpenCode 启动拉起 MCP server 时，server 自动异步检测新版本（基于 GitHub Releases），检测到新版本会在启动日志打印提示；无网络时静默跳过，不影响启动。
- **手动更新**：用 `update.check` 查看版本状态（可选 `force` 强制重新检测）；用 `update.apply`（需 `confirm: true`）手动拉取并更新工具本体。

更新后需**重启 OpenCode** 生效。可用环境变量 `DELIVERY_UPDATE_CHECK=0` 关闭自动检测。

---

## 七、常见问题

**Q：OpenCode 里工具找不到？**
A：确认已 `npm run build` 生成 `dist/server.js`，且 `opencode.json` 的 `command` 路径正确，然后重启 OpenCode。

**Q：`task.create` 被拦截返回 `config_required`？**
A：未配置当前人或团队名册。按第四节执行 `user.set` 和 `team.set`。

**Q：`team.set` 返回 `roles_incomplete`？**
A：团队名册的成员 roles 并集未覆盖全部 8 个角色。按返回的 `missing_roles` 继续添加成员或为现有成员补角色，直到 8 个角色全部覆盖。

**Q：任务数据存在哪里？**
A：目标项目根目录下的 `.delivery/tasks/`，纯文本文件，可追踪、可版本管理。

**Q：dashboard 读不到任务数据？**
A：确认 `delivery-mcp-server` 装在**项目根目录**下（install.md 第三步），dashboard 会自动读取项目根 `.delivery`。若 server 在别处，设置环境变量 `DELIVERY_ROOT` 指向项目根目录。

**Q：想换存储位置？**
A：设置环境变量 `DELIVERY_ROOT` 指向目标目录。

---

## 八、卸载

1. 从 `opencode.json` 移除 `delivery` MCP 配置（只删 `mcp.delivery` 字段，保留其他配置）。
2. 删除目标项目下的 `delivery-mcp-server/` 目录。
3. 删除目标项目下的 `.opencode/agent/delivery-*.md`（**只删 delivery 前缀文件，不要删整个 agent 目录**，避免误删目标项目已有 agent）。
4. 可选：删除 `.delivery/` 目录（任务数据）。
5. 可选：从目标项目 `.gitignore` 移除 `delivery-mcp-server` 条目。