# AI 交付任务系统 · 安装指南（install.md）

> **Language / 语言**: [中文](install.md) · [English](install.en.md)
>
> 本文件是**给 AI 看的安装说明书**。用户只需把本文件的链接（或内容）交给 AI，AI 即可按步骤自动完成安装、注册与首次配置。
>
> 仓库：`https://github.com/baiyulong/ai-multiple-agent-delivery-system.git`

---

## 一、这是什么

一个基于 **MCP** 的多角色 Agent 项目交付编排系统。把项目交付拆成**多角色接力工作流**（产品经理 → UI/UX → 领域架构 → 工程实现 → 程序员 → QA，数据工程师按需协作），通过**阶段门禁**保证每个交付物达标后才进入下一阶段。任务状态以纯文本文件保存在本地 `.delivery` 目录，无数据库。

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

> **安装模型（重要）**：工具本体**全局安装一份**到用户目录 `~/.config/ai-delivery/delivery-mcp-server/`，角色 Agent 全局安装到 `~/.config/opencode/agents/`，**跨项目共享，不重复安装**。项目内只注册：
>
> 1. `opencode.json` 的 `mcp.delivery`（**绝对路径** command + `DELIVERY_ROOT` 环境变量指向本项目 `.delivery`）
> 2. `.gitignore` 追加 `.delivery/`（任务数据根）
>
> 全局路径可用环境变量覆盖（一般无需）：`DELIVERY_INSTALL_ROOT`（工具本体根，默认 `~/.config/ai-delivery`）、`DELIVERY_AGENTS_DIR`（agent 目录，默认 `~/.config/opencode/agents`）。
>
> **推荐方式一：运行安装脚本 `install.js`（Windows/Linux 通用，自动完成全部步骤与安全合并），见下方【方式一】；也可按【方式二】手动逐步执行。**

### 方式一：一键安装脚本（推荐）

**从 GitHub Release 下载预构建包安装（推荐，体积小、版本固定、无需本地构建）**：

```bash
# 在目标项目根目录执行
node delivery-mcp-server/install.js --release
```

**或指定本地仓库路径（脚本未与仓库同目录时）**：

```bash
node delivery-mcp-server/install.js --repo /tmp/ai-delivery-system /path/to/project
```

> 也可以直接从仓库源码执行：`node /path/to/ai-delivery-system/delivery-mcp-server/install.js /path/to/project`。

脚本会自动：

0. **（--release 模式）** 查询 GitHub Releases 最新版本 → 下载预构建 `ai-delivery-*.zip`（含 dist + web-dist/{zh,en} + config + templates）→ 校验 zip 格式 → 解压到临时目录作为源码路径；无 Release 或下载失败时提示并退出
1. 校验目标目录（拒绝把仓库自身当作安装目标；非 git 项目可加 `--force`）
2. 确定安装语言（见下方"安装语言"）
3. 停止运行中的 dashboard 与 MCP server 进程（更新时避免文件锁定）
4. **安装工具本体到全局目录** `~/.config/ai-delivery/delivery-mcp-server/`（已存在时：`--release` / `--force-update` / **本地版本低于源码版本** 三种情况会删除旧版并拷贝新版，否则跳过）
5. **应用安装语言**：写入 `config/lang/active.json`，删除另一语言的内置资源（config/gates、config/architectures、templates、lang json、`web-dist/`）
6. **拷贝角色 Agent 到全局目录** `~/.config/opencode/agents/`（`delivery-*.md`，去掉语言后缀；源码安装只新增不覆盖已有，`--release` 更新模式覆盖）
7. **合并 `opencode.json`**：保留目标项目已有的全部字段，只写 `mcp.delivery` = `{ "type": "local", "command": ["node", "<全局>/delivery-mcp-server/dist/server.js"], "environment": { "DELIVERY_ROOT": "<项目>/.delivery" }, "enabled": true }`（已存在且路径一致则跳过，已存在旧路径则更新）
8. **追加 `.gitignore`**：`.delivery/`（幂等）。邮件配置属当前用户个人（`email.set` 写入用户主目录 `~/.config/ai-delivery/user.json`），不会写入项目
9. **安装依赖**：`--release` 预构建包只执行 `npm install --omit=dev`（**不构建**，dist 已就绪）；源码安装执行 `npm install` + `npm run build`（`VITE_LANG` 注入 web 构建，产出所选语言的 `web-dist/`）
10. 若项目内存在旧版按项目安装的 `delivery-mcp-server/`，打印**迁移提示**（任务数据 `.delivery` 原地保留，旧目录可手动删除）
11. 默认**不**自动启动看板（加 `--dashboard` 后台启动；避免被有超时的命令行误杀）
12. 打印后续配置指引（user.set / team.set / email.set）与本机全局路径信息

```bash
# 常用参数
node delivery-mcp-server/install.js                          # 安装到当前目录所在项目
node delivery-mcp-server/install.js /path/to/proj           # 安装到指定项目
node delivery-mcp-server/install.js --release               # 从 GitHub Release 下载最新稳定版（更新/安装）
node delivery-mcp-server/install.js --prerelease            # 安装最新 prerelease 版本（预发布测试用，见下方"安装 prerelease 版本"）
node delivery-mcp-server/install.js --repo ../clone /path/to/proj # 指定本地仓库路径
node delivery-mcp-server/install.js --force-update          # 强制覆盖已安装的工具本体（不比较版本）
node delivery-mcp-server/install.js --dashboard             # 安装后后台启动看板（detached，日志 <项目>/.delivery/dashboard.log）
node delivery-mcp-server/install.js --stop-dashboard        # 仅停止看板进程，不执行安装
node delivery-mcp-server/install.js --dry-run               # 只打印将要执行的操作，不改动文件
node delivery-mcp-server/install.js --force                 # 目标目录不是 git 仓库时也继续
```

#### 安装 prerelease 版本（预发布测试）

用户要求安装 **prerelease / 预发布 / 测试版**（如 `v0.2.26-rc.1`）时，加 `--prerelease`：

```bash
node delivery-mcp-server/install.js --prerelease            # 或与 --release 同用：--release --prerelease
```

- `--prerelease` 从 GitHub Releases 列表取**最新的 pre-release 版本**（`--release` 默认只取 latest 稳定版，永远看不到 prerelease）。
- 其余安装步骤与 `--release` 完全一致（预构建包、覆盖更新、只装运行期依赖）。
- 仓库无 prerelease 时会明确报错；此时告知用户先发布 prerelease（推 `v*` tag 且 tag 含 `-rc`/`-beta`/`-alpha`/`-test` 后缀会自动标记为 pre-release）。

**安装语言（双语）**：系统内置中文（`zh`）与英文（`en`）两个版本。安装脚本会按此顺序确定语言：`--lang` 参数 > 全局已安装语言（`<全局>/delivery-mcp-server/config/lang/active.json`）> 旧项目 `.install-lang`（兼容旧版）> 交互询问 > 默认 `zh`：

```bash
node delivery-mcp-server/install.js --lang en               # 安装英文版（web 界面 + 角色 Agent + 模板）
node delivery-mcp-server/install.js --lang zh               # 安装中文版（默认）
```

只安装所选语言（删除另一语言的内置资源与 web 产物），选择记录到**全局** `active.json`，后续更新自动沿用；`--lang` 优先。

### 方式二：手动安装

#### 1. 获取源码（推荐从 Release 下载）

**方式 A：从 GitHub Release 下载预构建包（推荐，体积小、版本固定）**

```bash
# 查询最新 Release 版本
curl -s https://api.github.com/repos/baiyulong/ai-multiple-agent-delivery-system/releases/latest | grep tag_name

# 下载预构建 zip 并解压（将 v0.2.x 替换为实际版本）
curl -L -o /tmp/ai-delivery.zip https://github.com/baiyulong/ai-multiple-agent-delivery-system/releases/download/v0.2.x/ai-delivery-v0.2.x.zip
unzip -q /tmp/ai-delivery.zip -d /tmp/ai-delivery-system
```

**方式 B：git clone（完整源码，含 git history）**

```bash
git clone https://github.com/baiyulong/ai-multiple-agent-delivery-system.git /tmp/ai-delivery-system
```

#### 2. 安装工具本体到全局目录（跨项目共享）

> 若 `~/.config/ai-delivery/delivery-mcp-server/` 已存在（其他项目已安装），**跳过本步与第 3 步**，直接进入第 4 步注册。

```bash
mkdir -p ~/.config/ai-delivery
cp -r /tmp/ai-delivery-system/delivery-mcp-server ~/.config/ai-delivery/
```

> **Windows 用户注意**：`cp` 是 Unix 命令，PowerShell 默认没有。三选一：
> 1. 优先使用安装脚本：`node delivery-mcp-server/install.js`（跨平台，自动完成全部步骤）
> 2. 使用 PowerShell 等价命令：`Copy-Item -Recurse /tmp/ai-delivery-system/delivery-mcp-server $env:USERPROFILE\.config\ai-delivery\`
> 3. 使用 Git Bash / WSL 执行上述 Unix 命令

#### 3. 拷贝角色 Agent 到全局目录

```bash
# 8 个角色配置（中文版 *.zh.md / 英文版 *.en.md），去语言后缀后放入全局 agent 目录
mkdir -p ~/.config/opencode/agents
# 中文版：
cp /tmp/ai-delivery-system/.opencode/agent/delivery-*.zh.md ~/.config/opencode/agents/
# 英文版：
cp /tmp/ai-delivery-system/.opencode/agent/delivery-*.en.md ~/.config/opencode/agents/
# 去掉语言后缀（delivery-orchestrator.zh.md → delivery-orchestrator.md）
cd ~/.config/opencode/agents
for f in delivery-*.zh.md delivery-*.en.md; do mv "$f" "${f%.zh.md}.md"; mv "${f}" "${f%.en.md}.md"; done 2>/dev/null || true
```

> **重要**：所有角色 Agent 文件都以 `delivery-` 前缀命名（`delivery-engineer.md`、`delivery-qa.md` 等），**只新增、不覆盖**目标项目 `.opencode/agent/` 下已有的同名 agent（如 `engineer.md`）——注意 agent 目录有**项目级**（`.opencode/agent/`）与**全局级**（`~/.config/opencode/agents/`）两个，项目级优先于全局级。

#### 4. 安装依赖并构建（仅首次安装到全局目录时需要）

> **注意**：以下命令必须在全局的 `delivery-mcp-server/` 目录下执行，否则会报 ENOENT（找不到 package.json）。

```bash
cd ~/.config/ai-delivery/delivery-mcp-server
npm install
# 构建前选择 web 界面语言（zh 或 en）：
VITE_LANG=zh npm run build        # 中文版 web 界面
# 或：VITE_LANG=en npm run build  # 英文版 web 界面
# 产出 dist/server.js（OpenCode 引用的就是它）+ web-dist/{zh|en}/
```

> 若用 `--release` 预构建包，**跳过本步**（dist 与 web-dist 已内置，只执行 `npm install --omit=dev`）。

#### 5. 验证构建产物存在

```bash
# 应存在：~/.config/ai-delivery/delivery-mcp-server/dist/server.js
```

#### 6. 注册 MCP 到目标项目（必须合并，禁止覆盖）

在**目标项目根目录**的 `opencode.json` 中**合并**添加（若文件不存在则创建）。**务必保留目标项目已有的全部字段**（如已有 `mcp`、`plugin`、`permission`、`agent` 等）：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "...目标项目已有 mcp...": {},
    "delivery": {
      "type": "local",
      "command": ["node", "/home/USER/.config/ai-delivery/delivery-mcp-server/dist/server.js"],
      "environment": { "DELIVERY_ROOT": "/path/to/proj/.delivery" },
      "enabled": true
    }
  }
}
```

> **禁止整体覆盖**：目标项目若已有 `opencode.json`，只允许新增 `mcp.delivery` 字段，其余字段原样保留；若已存在 `mcp.delivery` 则跳过，不要重复添加。
> **路径说明**：server 装在**全局目录**（不随项目走），所以 `command` 必须是**绝对路径**；同时用 `environment.DELIVERY_ROOT` 显式指定本项目数据根（新模型下 server 与项目无父子目录关系，必须显式注入）。Windows 下路径形如 `C:\Users\USER\.config\ai-delivery\delivery-mcp-server\dist\server.js`。

#### 7. 清理临时克隆

```bash
rm -rf /tmp/ai-delivery-system
```

#### 8. 启动浏览器任务看板并提示用户

> **注意**：dashboard 是长期运行的服务，**默认不随安装自动启动**（避免被有超时的命令行工具误杀）。安装完成后按需启动：
>
> - 后台启动（推荐，独立进程 + 日志 + 端口探测确认）：在项目根目录执行 `node ~/.config/ai-delivery/delivery-mcp-server/install.js --dashboard`（脚本自动注入 `DELIVERY_ROOT`）
> - 前台启动：`cd ~/.config/ai-delivery/delivery-mcp-server && npm run dashboard`（**必须先设置 `DELIVERY_ROOT` 指向项目数据根**，如 PowerShell：`$env:DELIVERY_ROOT="C:\path\to\proj\.delivery"`）
> - 停止：`node ~/.config/ai-delivery/delivery-mcp-server/install.js --stop-dashboard` 或 `cd ~/.config/ai-delivery/delivery-mcp-server && npm run dashboard:stop`

```bash
cd ~/.config/ai-delivery/delivery-mcp-server
$env:DELIVERY_ROOT = "C:\path\to\proj\.delivery"   # 必须设置（数据根）
npm run dashboard
# 输出: AI 交付任务看板已启动: http://localhost:8787
```

**必须向用户提示**：
- 看板地址：`http://localhost:8787`（端口被占用时查看 `<项目>/.delivery/dashboard.port` 或启动日志的实际端口）
- 说明：所有任务的新建与状态变化都可以在这个页面看到；`task.create` / `stage.complete` 等工具返回中也附带 `dashboard_url` 和 `view_hint`，可直接用浏览器打开查看对应任务。

> dashboard 读取数据根的顺序：`DELIVERY_ROOT` 环境变量 > 当前目录 `.delivery`。从全局目录启动时**必须**设置 `DELIVERY_ROOT`（install.js 的 `--dashboard` 会自动注入）。

#### 9. 将任务数据加入 .gitignore

在**目标项目根目录**执行（脚本已自动完成，手动安装需补）：

```bash
# .gitignore 不存在则创建；已存在则仅当无该条目时幂等追加
grep -qxF '.delivery/' .gitignore 2>/dev/null || echo '.delivery/' >> .gitignore
```

> 注意：`.delivery/` 是任务数据根（含团队配置与任务记录），新模型下**建议忽略**（属于工具运行数据，可随时重建；`.delivery/config/` 若想自定义流程/门禁模板，可另行提交到仓库）。**工具本体已不在项目内**，无需再忽略 `delivery-mcp-server`。
> **邮件配置（SMTP 服务器 + 授权码）属于当前用户个人**，`email.set` 写入用户主目录 `~/.config/ai-delivery/user.json`，不会出现在项目目录中，因此无需也不应提交到仓库。

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

> **重要约束**：团队名册的**全部成员 roles 并集必须覆盖全部 9 个角色**（见下表）。若缺角色，`team.set` 会返回 `roles_incomplete` 并列出缺失角色，需继续添加成员或为现有成员补角色，直到 9 个角色全部覆盖。
> 当前操作人的角色 = `user.set` 的邮箱在团队名册中匹配到的 roles。

| 角色 key | 中文名 | Agent 文件名 |
|---|---|---|
| delivery-orchestrator | 交付编排总控 | delivery-orchestrator.md |
| domain-expert | 业务专家 | delivery-domain-expert.md |
| product-manager | 产品经理 | delivery-product-manager.md |
| ux-designer | UI/UX 设计 | delivery-ux-designer.md |
| domain-architect | 领域架构师 | delivery-domain-architect.md |
| engineer | 工程实现（工程计划） | delivery-engineer.md |
| developer | 程序员（编码实施） | delivery-developer.md |
| data-engineer | 数据工程师（按需协作，无固定阶段） | delivery-data-engineer.md |
| qa | 质量测试 | delivery-qa.md |

> 所有角色 Agent 均以 `delivery-` 前缀命名，避免与目标项目已有的同名 agent（如 `engineer.md`）冲突。**角色 key（team.json 中的 roles 值）与 Agent 文件名是两个概念**：角色 key 不变，Agent 文件名带前缀。

> **角色负责人机制**：团队中**一个角色可由多名成员承担**（多人在 team.set 中登记同一角色即可），但**一个任务中每个角色只有一个负责人**。任务创建后每个阶段完成时，系统会返回下一阶段角色的候选成员，由用户选择后调用 `task.assign` 固化到任务上；之后可随时用 `task.assign` 单独修改某角色的负责人（覆盖式），修改前可用 `task.role_candidates` 查看候选。

### 3. 配置邮件通知（可选，当前用户个人级）

需要邮件通知时调用 `email.set`（需先 `user.set` 配置当前人）。**只需提供邮箱 + 授权码**，`host/port/secure` 会按邮箱域名自动填充（内置支持 QQ/163/126/yeah/Foxmail/Gmail/Outlook/iCloud）：

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
>
> **配置归属**：邮件服务器与认证信息是**当前操作人个人**配置，`email.set` 写入用户主目录 `~/.config/ai-delivery/user.json`（与 `user.set` 的姓名/邮箱同文件），跨项目沿用，**不会写入项目仓库**——发件账号由每位成员用自己的邮箱/授权码各自配置，不使用共享的全局发件配置。`user.set` 更新姓名/邮箱不会覆盖已配置的邮件。

---

## 五、验证安装

### 1. 确认 MCP 工具可用

在 OpenCode 中确认能看到以下工具组：`task.*`、`stage.*`、`artifact.*`、`gate.*`、`context.*`、`question.*`、`team.*`、`user.*`、`email.*`。

### 2. 跑通一个完整示例（可选）

```bash
cd ~/.config/ai-delivery/delivery-mcp-server
npm run example
```

### 3. 启动浏览器任务看板（可选）

```bash
# 在项目根目录执行（自动注入 DELIVERY_ROOT）：
node ~/.config/ai-delivery/delivery-mcp-server/install.js --dashboard
# 打开 http://localhost:8787
```

后台启动（独立进程 + 日志）：如上 `--dashboard`
停止看板：`node ~/.config/ai-delivery/delivery-mcp-server/install.js --stop-dashboard`

> dashboard 数据根：`DELIVERY_ROOT` 环境变量 > 当前目录 `.delivery`。从全局目录直接启动（`npm run dashboard`）时**必须**设置 `DELIVERY_ROOT` 指向项目数据根。

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

> **用户确认（强制）**：每个角色完成阶段时，`stage.complete` 必须由**用户本人**执行（必填 `confirmed_by`，填用户姓名/邮箱）。已配置 OpenCode 权限强制：编排 Agent 对 `delivery_stage.complete` 为 `deny`，其他调用为 `ask`（会弹窗征求用户批准）。因此即使门禁通过，AI 也无法自行推进阶段，必须由用户交互确认后才会发给下一角色。AI 只需汇报完成情况并引导用户调用 `stage.complete`。
> **看板提示**：`task.create` / `stage.complete` 返回中附带 `dashboard_url` 与 `view_hint`，AI 应据此提示用户"新任务已创建 / 阶段已推进，可在浏览器查看：<dashboard_url>"。

---

## 六·附、更新

### 方式一：一键更新（推荐）

> **注意**：新模型下工具本体在**全局目录**，更新命令在**项目根目录**执行：

```bash
node ~/.config/ai-delivery/delivery-mcp-server/install.js --release
```

脚本会自动：查询并下载最新 Release 预构建 zip → 停止旧进程 → 覆盖全局工具本体 + 角色 Agent → `npm install --omit=dev`（预构建包无需构建）。**保留 `.delivery` 任务数据**与 `opencode.json` 中的自定义配置。加 `--lang zh|en` 可切换安装语言（否则沿用全局 `active.json` 记忆的语言）。

> **更新到 prerelease 版本**：用户要求装预发布/测试版时，把上述命令换成 `node ~/.config/ai-delivery/delivery-mcp-server/install.js --prerelease`（从 Releases 列表取最新 pre-release；普通 `--release` 只取 latest 稳定版）。注意本机全局安装的 install.js 需 ≥ v0.2.26 才支持该参数，旧版可先从仓库源码执行：`node /path/to/ai-multiple-agent-delivery-system/delivery-mcp-server/install.js --prerelease`。

> **版本对比自动更新**：已存在全局安装时，`--release` / `--force-update` / **本地版本低于源码版本** 三种情况会自动删除旧版并覆盖，其余情况跳过。
> **Windows 手动更新**（脚本不可用时）：
> ```powershell
> # 下载并解压最新 Release 预构建包后
> Copy-Item -Recurse -Force "$env:TEMP\ai-delivery-system\delivery-mcp-server" "$env:USERPROFILE\.config\ai-delivery\delivery-mcp-server"
> Copy-Item -Force "$env:TEMP\ai-delivery-system\.opencode\agent\delivery-*.en.md" "$env:USERPROFILE\.config\opencode\agents\"   # 或 *.zh.md
> cd "$env:USERPROFILE\.config\ai-delivery\delivery-mcp-server"; npm install --omit=dev
> ```

### 方式二：MCP 工具更新

- **每次启动自动检测**：OpenCode 启动拉起 MCP server 时，server 自动异步检测新版本（基于 GitHub Releases），检测到新版本会在启动日志打印提示；无网络时静默跳过，不影响启动。
- **手动更新**：用 `update.check` 查看版本状态（可选 `force` 强制重新检测），然后在项目根目录运行 `node ~/.config/ai-delivery/delivery-mcp-server/install.js --release` 完成更新。

更新后需**重启 OpenCode** 生效。可用环境变量 `DELIVERY_UPDATE_CHECK=0` 关闭自动检测。

---

## 七、常见问题

**Q：OpenCode 里工具找不到？**
A：确认全局 `~/.config/ai-delivery/delivery-mcp-server/dist/server.js` 已构建，且 `opencode.json` 的 `command` 用的是**绝对路径**，然后重启 OpenCode。

**Q：`task.create` 被拦截返回 `config_required`？**
A：未配置当前人或团队名册。按第四节执行 `user.set` 和 `team.set`。

**Q：`team.set` 返回 `roles_incomplete`？**
A：团队名册的成员 roles 并集未覆盖全部 9 个角色。按返回的 `missing_roles` 继续添加成员或为现有成员补角色，直到 9 个角色全部覆盖。

**Q：任务数据存在哪里？**
A：目标项目根目录下的 `.delivery/tasks/`，纯文本文件，可追踪、可版本管理。

**Q：dashboard 读不到任务数据？**
A：从全局目录启动 dashboard 时**必须**设置 `DELIVERY_ROOT` 指向项目数据根（`node ~/.config/ai-delivery/delivery-mcp-server/install.js --dashboard` 会自动注入，前台 `npm run dashboard` 需手动设置）。

**Q：想换存储位置？**
A：设置环境变量 `DELIVERY_ROOT` 指向目标目录。

**Q：升级了版本但 OpenCode 还在用旧代码？**
A：更新后 MCP server 进程会被停止，需**重启 OpenCode** 才会以新代码启动。

**Q：企业代理环境下 `--release` / `--prerelease` 下载失败（fetch failed）？**
A：Node 内置 fetch 不读取 `https_proxy` 等代理环境变量，脚本已内置回退：fetch 网络层失败时自动改用系统 curl 下载（curl 原生遵循代理）。排查顺序：① 确认 `https_proxy` 指向可达代理（错误信息会区分"连接超时 / 连接被拒绝 / DNS 失败 / SSL 握手失败"，SSL 失败常见于代理证书不受信，可设 `CURL_CA_BUNDLE`）；② 超时可设 `DELIVERY_DOWNLOAD_TIMEOUT_MS`（毫秒，默认 300000）；③ 可用 `DELIVERY_DOWNLOAD_TOOL=fetch|curl|auto` 强制指定下载方式（默认 auto，fetch 优先失败回退 curl）；④ 仍失败可手动下载 Release zip 解压后用 `--prebuilt <目录>` 离线安装。

---

## 八、卸载

> **注意**：卸载命令在**项目根目录**执行。新模型下工具本体在全局目录，卸载分"项目解绑"与"全局清理"两层。

### 方式一：一键卸载（推荐）

```bash
# 在目标项目根目录执行（自动停止运行中的进程，移除项目注册）
node ~/.config/ai-delivery/delivery-mcp-server/uninstall.js

# 同时删除 .delivery/ 任务数据（默认保留）
node ~/.config/ai-delivery/delivery-mcp-server/uninstall.js --purge-data

# 同时删除全局安装 ~/.config/ai-delivery/delivery-mcp-server/（影响所有项目，默认保留）
node ~/.config/ai-delivery/delivery-mcp-server/uninstall.js --purge-server

# 同时删除全局角色 Agent ~/.config/opencode/agents/delivery-*.md（影响所有项目，默认保留）
node ~/.config/ai-delivery/delivery-mcp-server/uninstall.js --purge-agents

# 以上全部（数据 + 全局安装 + 全局 agent）
node ~/.config/ai-delivery/delivery-mcp-server/uninstall.js --purge-all

# 预览将要执行的操作
node ~/.config/ai-delivery/delivery-mcp-server/uninstall.js --dry-run
```

> 若项目内还保留旧版按项目安装的 `delivery-mcp-server/`，也可用 `node delivery-mcp-server/uninstall.js`（旧脚本）解绑当前项目。

脚本会自动：
1. 停止运行中的 dashboard（按 `.delivery/dashboard.port` 端口）与 MCP server 进程
2. 移除 `opencode.json` 中的 `mcp.delivery` 配置（mcp 对象为空时一并删除）
3. 移除 `.gitignore` 中的 `.delivery/` 条目
4. 保留 `.delivery/` 任务数据目录（默认不删；加 `--purge-data` 才删除）
5. 保留全局安装与全局 agent（默认不删，**影响所有项目**；加 `--purge-server` / `--purge-agents` 才删除）

### 方式二：手动卸载

1. 停止 dashboard（Ctrl+C 关闭看板窗口）和退出 OpenCode（释放 MCP server）
2. 从 `opencode.json` 移除 `mcp.delivery` 配置
3. 从 `.gitignore` 移除 `.delivery/` 条目
4. `.delivery/` 目录保留（任务数据，如确实要删除再手动删）
5. 全局清理（可选，**影响所有项目**）：删除 `~/.config/ai-delivery/delivery-mcp-server/` 与 `~/.config/opencode/agents/delivery-*.md`
