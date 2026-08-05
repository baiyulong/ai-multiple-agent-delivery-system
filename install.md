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

### 1. 克隆仓库（临时）

```bash
git clone https://github.com/baiyulong/ai-multiple-agent-delivery-system.git /tmp/ai-delivery-system
```

### 2. 拷贝组件到目标项目根目录

在**目标项目根目录**执行，把 server 与角色 Agent 配置拷进来：

```bash
# 拷贝 MCP server（含源码/配置/模板/前端）
cp -r /tmp/ai-delivery-system/delivery-mcp-server ./delivery-mcp-server

# 拷贝多角色 Agent 配置（8 个角色）
cp -r /tmp/ai-delivery-system/.opencode/agent ./.opencode/agent
```

> 若目标项目已有 `.opencode/agent/`，请合并而非覆盖（只新增 delivery 相关角色文件）。

### 3. 安装依赖并构建

```bash
cd delivery-mcp-server
npm install
npm run build        # 产出 dist/server.js（OpenCode 引用的就是它）
```

### 4. 验证构建产物存在

```bash
# 应存在：delivery-mcp-server/dist/server.js
```

### 5. 注册 MCP 到目标项目

在**目标项目根目录**的 `opencode.json` 中添加（若文件不存在则创建）：

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

> 因为 server 已装在项目内，`command` 用**相对路径** `delivery-mcp-server/dist/server.js` 即可，OpenCode 会以项目根目录为 cwd 启动它。

### 6. 清理临时克隆

```bash
rm -rf /tmp/ai-delivery-system
```

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

> 角色 key 见下表。当前操作人的角色 = `user.set` 的邮箱在团队名册中匹配到的 roles。

| 角色 key | 中文名 |
|---|---|
| delivery-orchestrator | 交付编排总控 |
| domain-expert | 业务专家 |
| product-manager | 产品经理 |
| ux-designer | UI/UX 设计 |
| domain-architect | 领域架构师 |
| engineer | 工程实现 |
| qa | 质量测试 |
| devops | 平台与 DevOps |

### 3. 配置邮件通知（可选）

需要邮件通知时调用 `email.set`：

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

> 未配置邮件不影响主流程（best-effort，发送失败静默跳过）。

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

---

## 七、常见问题

**Q：OpenCode 里工具找不到？**
A：确认已 `npm run build` 生成 `dist/server.js`，且 `opencode.json` 的 `command` 路径正确，然后重启 OpenCode。

**Q：`task.create` 被拦截返回 `config_required`？**
A：未配置当前人或团队名册。按第四节执行 `user.set` 和 `team.set`。

**Q：任务数据存在哪里？**
A：目标项目根目录下的 `.delivery/tasks/`，纯文本文件，可追踪、可版本管理。

**Q：dashboard 读不到任务数据？**
A：确认 `delivery-mcp-server` 装在**项目根目录**下（install.md 第三步），dashboard 会自动读取项目根 `.delivery`。若 server 在别处，设置环境变量 `DELIVERY_ROOT` 指向项目根目录。

**Q：想换存储位置？**
A：设置环境变量 `DELIVERY_ROOT` 指向目标目录。

---

## 八、卸载

1. 从 `opencode.json` 移除 `delivery` MCP 配置。
2. 删除目标项目下的 `delivery-mcp-server/` 目录。
3. 删除目标项目下的 `.opencode/agent/`（若拷贝过）。
4. 可选：删除 `.delivery/` 目录（任务数据）。