# AI Delivery Task System（delivery-mcp-server）实现计划

> 版本：v1.0
> 日期：2026-08-04
> 依据：《AI 任务管理系统 PRD.md》v1.0 + 《自定义多角色 Agent 设计稿.md》v1.0
> 状态：待实施

---

## 1. 总览

### 1.1 目标

实现 PRD 定义的 V0.1 MVP：一个基于本地 `.delivery` 文件系统的 **AI 交付任务状态中心 + MCP Server**，让 OpenCode 中的 Orchestrator + 七角色 Agent 能按「检查上游 → 缺失回退 → 生成交付物 → 提交校验 → 门禁通过 → 阶段完成」的机制有序接力。

### 1.2 范围（P0 + P1）

**包含：**

```text
1. 本地 .delivery 存储（task/stages/artifacts/gates/questions/context）
2. 三种流程模板：crud / lightweight_ddd / full_ddd
3. 15 个 MCP 工具（PRD 第 9 章全集 + 任务类型识别）
4. Markdown 交付物提交、读取、列表、更新（保留历史版本）
5. 结构检查 + 必填项/空值检查门禁（覆盖 6 种 artifact_type）
6. 阶段状态机与完成前置条件（交付物 validated + gate passed + 无阻塞问题）
7. 缺失上游检测与回退补齐信息（blocked + missing + assigned_agent）
8. 共享上下文读取与按章节更新
9. 待确认问题创建/解决与阶段阻塞联动
10. delivery_package.md 导出
11. OpenCode 中 Orchestrator + 七角色 Agent 配置与 MCP 注册
12. examples 示例任务（供应商分类维护）+ 验收测试 + README
```

**不包含（PRD 第 3.2 节非 MVP + P2/P3）：**

```text
Web 看板、多人权限、外部系统同步、数据库持久化、
artifact.diff、stage.block/reopen、LLM 内容质量评分
```

### 1.3 关键决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 实现语言 | TypeScript (Node ≥ 22, ESM) | 本机 Node 24；OpenCode 为 Node 生态，利于 V1.0 插件化 |
| MCP SDK | @modelcontextprotocol/sdk（stdio） | PRD 15.1 指定本地 stdio |
| 参数校验 | zod | 每个工具都有输入输出 schema（PRD 20 要求 5） |
| 测试 | vitest | 快速、ESM 原生 |
| 构建 | tsup（打包 + 复制 config/templates 资源） | 便于 npx/本地命令启动 |
| 配置存放 | 内置模板随包发布，首次运行初始化到 `.delivery/config/` | 满足 PRD 10.1 目录结构 + 14.1 配置化、新增类型不改核心代码 |

---

## 2. 项目结构

代码库位于本仓库新建目录 `delivery-mcp-server/`（PRD 15.2）：

```text
delivery-mcp-server/
  src/
    server.ts                 # stdio MCP Server 入口，注册全部工具，.delivery 初始化
    tools/                    # MCP 工具薄层：zod schema + 调 core，不含业务逻辑
      task.ts                 # task.create / task.get / task.detect_type / task.get_flow / task.export_delivery_package
      stage.ts                # stage.get（含 readiness/blockers 输出）
      artifact.ts             # artifact.submit / artifact.get / artifact.list / artifact.update
      gate.ts                 # gate.check
      context.ts              # context.get_shared / context.update
      question.ts             # question.create / question.resolve
    core/
      types.ts                # Task/Stage/Artifact/Gate/Question 类型与全部枚举
      ids.ts                  # TASK-/ART-/Q-/GATE- ID 生成（日期 + 当日递增 NNN）
      paths.ts                # 路径沙箱：一切读写限定在 .delivery 根内（PRD 14.4）
      time.ts                 # ISO 8601 带时区偏移时间戳
      store/
        task-store.ts         # task.json / stages.json / questions.json 读写
        artifact-store.ts     # artifacts/**.md + index.json + 更新时历史版本保留
      flow-engine.ts          # 流程模板加载、阶段推进/回查、上游检查、缺失指派
      gate-engine.ts          # Markdown 章节解析 + 规则执行 + 评分 + 门禁记录
      type-detector.ts        # 规则化任务类型识别（PRD 8.2）
      context-manager.ts      # context.md 初始化/按章节读取替换
      exporter.ts             # delivery_package.md 汇总导出（PRD 8.9）
  config/                     # 内置模板（构建时复制进 dist）
    flows/
      crud-flow.json
      lightweight-ddd-flow.json
      full-ddd-flow.json
    gates/
      crud_spec_card.json
      product_requirement_card.json
      user_stories.json
      acceptance_criteria.json
      business_rules.json
      ubiquitous_language.json
      ux_interaction_card.json
      state_action_matrix.json
      ddd_applicability_review.json
      lightweight_domain_model.json
      bounded_context.json
      aggregate_design.json
      domain_events.json
      api_contract.json
      engineering_plan.json
      qa_test_plan.json
      release_checklist.json
  templates/
    context.md                # 17 节共享上下文初始模板（PRD 8.7）
    artifacts/                # 各 artifact_type 的 Markdown 骨架（PRD 附录 21-24 + 11.x）
      crud_spec_card.md
      ux_interaction_card.md
      ddd_applicability_review.md
      engineering_plan.md
      qa_test_plan.md
      release_checklist.md
      ...
  test/
    unit/                     # stores / flow-engine / gate-engine / type-detector
    e2e/                      # PRD 第 16 章五个验收场景（in-process 全流程）
  examples/
    supplier-category/        # 供应商分类维护：完整 CRUD 任务走查产物快照（PRD 20 要求 7）
  package.json
  tsconfig.json
  README.md                   # 能力说明 + OpenCode MCP 注册步骤 + 工具清单
```

运行时数据目录（任务状态中心）：

```text
{project}/.delivery/
  config/flows/*.json        # 首次运行从内置模板初始化，允许团队自定义覆盖
  config/gates/*.json
  tasks/{TASK-ID}/
    task.json stages.json context.md questions.json
    artifacts/index.json + artifacts/{stage}/{type}.md (+ history/)
    gates/{stage}.gate.json
    delivery_package.md
```

根目录解析：环境变量 `DELIVERY_ROOT` 优先，默认 `process.cwd()/.delivery`（OpenCode 以项目根启动 MCP，行为符合预期）。

---

## 3. 核心设计

### 3.1 实体与枚举（PRD 第 5 章）

- Task：`draft | in_progress | blocked | completed | cancelled | archived`
- Stage：`not_started | in_progress | blocked | submitted | validated | completed | needs_revision | skipped`
- Artifact：`draft | submitted | validated | needs_revision | deprecated`
- Gate：`passed | failed | warning | manual_review_required`
- Question：`open | answered | resolved | cancelled`

### 3.2 阶段状态机与完成前置条件（PRD 8.4）

```text
not_started → in_progress → submitted → validated → completed
                  │                          │
                  ├── blocked ←──────────────┤   （open question 阻塞）
                  └── needs_revision ←───────┘   （gate.check failed，回 12.3 返工流程）
```

`stage.complete` 仅当以下全部满足才成功：

```text
1. 当前阶段必需交付物存在（允许同阶段多交付物全部就位）
2. 交付物状态为 validated
3. 最近一次 gate.check = passed（或 manual_review_required 已被确认）
4. 没有 blocks_stage 指向当前阶段的 open question
```

成功后：阶段置 `completed`、`task.current_stage` 推进到下一阶段、返回 `next_stage / next_role`（PRD 9.6 输出）。

### 3.3 上游检查与缺失回退（PRD 7.3 / 7.4 / 12.2）

`stage.get` 返回值扩展 readiness 信息（不新增工具，保持 PRD 第 9 章工具面）：

```json
{
  "stage": "ux_design",
  "status": "blocked",
  "can_start": false,
  "missing_upstream": [
    {
      "stage": "product_requirement",
      "role": "product-manager",
      "missing_artifact_type": "crud_spec_card"
    }
  ],
  "suggested_action": "call_agent",
  "assigned_agent": "product-manager"
}
```

`artifact.submit` 在上游未完成时同样拒绝并返回同样的缺失信息（双保险，防止下游越权提交）。

### 3.4 门禁引擎（PRD 8.6 / 11.x）

门禁规则文件（每种 artifact_type 一个 JSON）：

```json
{
  "artifact_type": "crud_spec_card",
  "required_sections": ["功能名称", "维护对象", "使用角色", "业务目的", "页面类型",
    "查询条件", "列表字段", "新增规则", "编辑规则", "删除/停用规则",
    "权限规则", "数据校验", "审计要求", "验收标准"],
  "non_empty_sections": ["删除/停用规则"],
  "forbidden_patterns": [
    { "section": "权限规则", "pattern": "^按权限控制[。.]?$", "message": "权限规则不能只写『按权限控制』" },
    { "section": "验收标准", "pattern": "^功能正常[。.]?$", "message": "验收标准不能只写『功能正常』" }
  ],
  "min_list_items": { "section": "验收标准", "min": 3, "message": "至少包含 3 条可测试验收标准" }
}
```

检查器按 PRD 8.6 顺序执行：结构检查 → 必填项检查 → 内容空值检查（MVP 范围）；上下游衔接检查与问题检查由 stage.complete 前置条件承担。PRD 11.1 的 5 条规则（crud_spec_card）全部落在以上规则原语内。

Markdown 章节解析规则：

```text
1. 提取 #/##/### 标题行。
2. 归一化：去掉序号前缀（"## 11. 权限规则" → "权限规则"）、去空白。
3. 章节名精确匹配；规则文件可配 aliases 兼容同义写法。
4. 章节内容 = 该标题至下一同级/上级标题之间的文本。
```

评分与结果：

```text
score = 100 - 缺失章节数*15 - 空内容章节数*5 - 违规项数*10（下限 0）
result：存在缺失必填章节 → failed；仅 forbidden/min_items 违规 → warning（可配置为 failed）；
        score ≥ 阈值且无违规 → passed
每次 gate.check 结果写入 gates/{stage}.gate.json（含历史数组，满足 PRD 14.3 可追踪）。
gate.check 同时联动 artifact/stage 状态：passed → validated / failed → needs_revision（PRD 12.3）。
```

### 3.5 交付物存储（PRD 8.5 / 14.4）

```text
submit  → 写 artifacts/{stage}/{type}.md + index.json 追加 metadata，status=submitted
update  → version+1；旧版复制到 artifacts/{stage}/history/{type}.v{n}.md（保留历史）
get     → metadata + content
list    → index.json 过滤输出
路径规则：.delivery/tasks/{task_id}/artifacts/{stage}/{artifact_type}.md
```

### 3.6 任务类型识别（PRD 8.2）

规则引擎（关键词集合可配，放 type-detector 内置常量）：

```text
full_ddd 信号词优先：流程 / 履约 / 结算 / 库存 / 订单 / 审批链 / 领域事件 / 跨模块联动
lightweight_ddd 信号词：状态 / 审批 / 启用 / 停用 / 冻结 / 评级 / 规则
crud 信号词：维护 / 字典 / 分类 / 标签 / 参数 / 新增 / 编辑 / 删除 / 查询
打分：命中加权 - 高类型排除项，输出 task_type / confidence / reason / recommended_flow
```

### 3.7 上下文与问题

- `context.get_shared`：返回 context.md 全文。
- `context.update`：按 `## N. 章节名` 定位章节替换内容（归一化匹配，同门禁解析器）；不存在的章节拒绝并提示。
- `question.create`：写 questions.json；`blocks_stage` 存在时将对应 stage 置 `blocked`（PRD 7.9）。
- `question.resolve`：记录 answer/resolved_by；该 stage 无其他 open 问题时回到 `in_progress`。
- `task.get` 输出中始终携带 open_questions 摘要。

### 3.8 交付包导出（PRD 8.9）

`task.export_delivery_package` → 校验所有非 skipped 阶段 completed → 汇总：任务摘要、类型、流程阶段表、交付物清单（内联全文或相对链接）、门禁结果、待确认问题、关键决策（自 context.md 已确认决策节）、最终状态 → 写 `delivery_package.md`。

### 3.9 安全边界（PRD 14.4）

```text
paths.ts 统一封装：所有读写路径必须位于 .delivery 根内，resolve 后前缀校验，拒绝 .. 逃逸；
工具层不接受任意文件路径入参（artifact 路径全部由系统生成）。
```

---

## 4. MCP 工具清单（15 个）

| # | 工具 | 优先级 | 说明 |
|---|---|---|---|
| 1 | task.create | P0 | 建 task.json/stages.json/context.md/questions.json/artifacts//gates/，task_type 缺省时自动 detect |
| 2 | task.get | P0 | 任务 + 阶段 + 交付物摘要 + open questions |
| 3 | task.detect_type | P0 | 规则识别 + confidence + recommended_flow |
| 4 | task.get_flow | P0 | 返回流程模板 |
| 5 | stage.get | P0 | 阶段状态 + readiness + missing_upstream + assigned_agent |
| 6 | artifact.submit | P0 | 保存 md + metadata，status=submitted |
| 7 | artifact.get | P0 | metadata + content |
| 8 | gate.check | P0 | 结构/必填/空值检查，写门禁记录，联动状态 |
| 9 | stage.complete | P0 | 前置校验 + 推进 current_stage，返回 next_stage/next_role |
| 10 | artifact.list | P1 | 列出任务交付物 |
| 11 | artifact.update | P1 | 返工流程所需，版本+1 保历史 |
| 12 | context.get_shared | P1 | 读共享上下文 |
| 13 | context.update | P1 | 按章节更新 |
| 14 | question.create | P1 | 建问题 + 可选阶段阻塞 |
| 15 | question.resolve | P1 | 闭环问题 + 解除阻塞 |
| 16 | task.export_delivery_package | P1 | 导出交付包 |

（每个工具 zod 输入 schema + 结构化 JSON 输出；错误统一 `{ ok:false, code, message, details }`。）

---

## 5. 实施泳道与依赖

全部为无界面代码/配置工作，按 @fixer 泳道执行；单文件小改动由编排者直接处理。

```text
L0 脚手架 ──► L1 存储核心 ──┬─► L2 流程引擎 ──┬─► L5 工具层+Server ─► L6 E2E验收+examples ─► M4
                            │                  │
                            └─► L3 门禁引擎 ───┘
L4 模板资产（可与 L1 并行）──────────────────────┘（L5/L6 依赖模板文件存在）
L7 OpenCode Agent 配置（依赖工具清单=本文档第 4 章，可与 L1-L5 并行）──► 集成冒烟 ─► M4
```

### L0 项目脚手架（0.5d）

- 初始化 `delivery-mcp-server/`：package.json（type=module）、tsconfig、tsup、vitest、zod、@modelcontextprotocol/sdk
- 目录骨架 + npm scripts：build / test / dev（stdio 启动）
- 出口：`npm test` 空跑通过

### L1 存储核心（1d）

- core/types.ts、ids.ts、paths.ts、time.ts
- store/task-store.ts：task.json/stages.json/questions.json 原子读写；创建任务全套目录初始化；ID 生成（扫描当日已有任务取 max+1）
- store/artifact-store.ts：index.json 管理、md 写入、历史版本
- 单元测试：路径沙箱拒绝逃逸、ID 递增、读写回环
- 依赖：L0

### L2 流程引擎（1d）

- config/flows 三个模板 JSON（PRD 6.2/6.3/6.4：stage/role/required_artifact_type/required_previous_stages/gate_rules/allow_skip）
- flow-engine.ts：加载（`.delivery/config/flows` 优先，回退内置）、阶段序列、前后阶段查询、上游完成检查、缺失指派（missing → role → agent 名映射）
- type-detector.ts：三类型规则判定 + confidence/reason
- 单元测试：三种流程初始化、上游缺失阻塞、类型识别样本句（PRD 7.2 例句必须判为 crud）
- 依赖：L1。可与 L3 并行

### L3 门禁引擎（1d）

- Markdown 章节解析器（归一化/aliases/章节内容切片）
- gate-engine.ts：规则加载（`.delivery/config/gates` 优先）→ required/non_empty/forbidden/min_list_items 检查 → score/result → 写 gates/{stage}.gate.json（历史数组）→ 联动 artifact/stage 状态
- config/gates/*.json：17 种 artifact_type 规则；必填章节取 PRD 11.1-11.6 与设计稿对应模板；crud_spec_card 落实 PRD 11.1 全部 5 条规则；其余类型 MVP 仅 required_sections + non_empty
- 单元测试：通过/失败/警告三类样例、PRD 16.3 缺章节场景必须 failed 且 missing_sections 正确
- 依赖：L1。可与 L2 并行

### L4 模板资产（0.5d，与 L1 并行）

- templates/context.md（PRD 8.7 的 17 节）
- templates/artifacts/*.md：从 PRD 附录 21-24 与设计稿第 4-10 章输出模板转录
- 纯静态资产，无代码依赖

### L5 工具层 + Server（1d）

- tools/*.ts 六个模块（第 4 章 16 个工具）：zod schema、调 core、统一错误结构
- server.ts：McpServer 注册、stdio、启动时初始化 `.delivery/config`（仅目录不存在时复制内置模板）
- stage.get 内嵌 readiness；artifact.submit 内嵌上游校验；stage.complete 内嵌四项前置条件
- 冒烟：stdio 启动 + tools/list 返回 16 个工具
- 依赖：L1+L2+L3+L4

### L6 E2E 验收 + examples + README（1d）

PRD 第 16 章五个验收场景转为 in-process E2E 测试：

| 测试 | 对应 PRD | 要点 |
|---|---|---|
| CRUD 全流程闭环 | 16.1 | create→detect→submit crud_spec_card→gate pass→逐阶段→全部 completed |
| 缺失交付物阻塞 | 16.2 | 直接请求 engineering_design → blocked + 缺 ux_interaction_card + 指派 ux-designer |
| 门禁失败 | 16.3 | 缺权限规则/验收标准 → failed + missing_sections 正确 + 阶段不得 completed |
| 阶段完成推进 | 16.4 | passed 后 complete → completed + current_stage=ux_design |
| 交付包导出 | 16.5 | 全阶段 completed → delivery_package.md 含全部交付物与门禁结果 |

附加：返工流程测试（gate fail → update v2 → re-check pass → complete，PRD 12.3）；question 阻塞/解除测试。
`examples/supplier-category/`：走查产生的完整 .delivery 快照 + README 说明。
README：能力、工具表、OpenCode 注册 JSON 片段、DELIVERY_ROOT 说明。
- 依赖：L5

### L7 OpenCode Agent 配置（1d，与 L1-L5 并行）

落地位置：当前仓库 `.opencode/agent/*.md`（自定义 subagent）+ `opencode.json` 的 mcp 段注册 delivery-mcp-server。**动手前先核对当前 OpenCode 版本的 agent frontmatter 字段（description/mode/model/tools/permission）与 mcp 注册格式。**

8 个 Agent：

| Agent | mode | Prompt 来源 | 附加协议段 |
|---|---|---|---|
| delivery-orchestrator | primary | 设计稿 3.8 + PRD 13.1 | 编排协议（PRD 12.1-12.3 三步流程的工具调用序列） |
| domain-expert | subagent | 设计稿 4.8 | 工具协议 + 通用约束（设计稿 §13） |
| product-manager | subagent | 设计稿 5.8 | 同上，产出 crud_spec_card/product_requirement_card 等 |
| ux-designer | subagent | 设计稿 6.8 | 同上 |
| domain-architect | subagent | 设计稿 7.9 | 同上 |
| engineer | subagent | 设计稿 8.8 | 同上 |
| qa | subagent | 设计稿 9.8 | 同上 |
| platform-devops | subagent | 设计稿 10.8 | 同上 |

每个角色 Prompt 尾部统一注入（PRD 13.2）：

```text
执行前：task.get + context.get_shared + stage.get（确认 can_start，缺失则停止并报告）
生成后：artifact.submit → 等待 gate.check → failed 按 issues 修订 artifact.update → 通过后由 Orchestrator stage.complete
禁止：编造上游信息、越权决策；不确定必须 question.create
输出尾部：当前结论 / 风险点 / 待确认问题 / 下一步建议
```

- 依赖：仅需第 4 章工具清单（已冻结），可与后端并行；集成冒烟放 L6 之后

### 估时汇总

```text
关键路径：L0 → L1 → (L2 ∥ L3) → L5 → L6 ≈ 4.5 人日
L4 并行隐藏；L7 并行（1 人日）+ 集成冒烟 0.5 人日
总计约 5 人日（含测试），单人串行约 6-7 天，双泳道并行约 3 天
```

---

## 6. 验证策略

```text
1. 单元测试（vitest）：paths 沙箱、ids、task/artifact store、flow-engine 状态迁移、
   gate-engine 全规则、type-detector、context 章节替换、exporter。
2. E2E（in-process）：第 5 章 L6 表内 5+2 个场景，直接调用 core 组装全流程。
3. MCP 协议冒烟：构建后 node dist/server.js，stdio 脚本执行 initialize → tools/list →
   task.create → artifact.submit → gate.check → stage.complete 一轮真实协议调用。
4. 集成验收（人工）：在 OpenCode 注册 MCP + 8 Agent，输入「供应商分类维护」需求，
   由 delivery-orchestrator 驱动走通 crud 流程至少两个阶段，核对 .delivery 落盘。
```

验收出口（Definition of Done）：

```text
- npm test 全绿，PRD 第 16 章五场景全部通过
- stdio 冒烟 tools/list = 16 工具且一轮调用成功
- examples/supplier-category 快照完整
- README 注册步骤照做即可在 OpenCode 跑通
```

---

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 中文章节标题匹配脆弱（序号、全角符号、别名） | 解析器归一化 + gate 规则支持 aliases；测试覆盖 PRD 附录原始模板 |
| crud_spec_card 内容级规则（≥3 条验收标准等）误伤合理写法 | 规则全部配置化（config/gates JSON），可现场调参，不改代码 |
| OpenCode agent frontmatter / mcp 注册格式随版本变化 | L7 动手前先行核对当前版本文档，冒烟不通过则调整配置而非改 Server |
| .delivery 与代码内置模板不同步 | 初始化只在目录不存在时复制；README 说明升级时保留用户自定义 |
| MCP server 的 cwd 与预期项目根不一致 | DELIVERY_ROOT 环境变量显式指定 + README 显著说明 |
| 并发写入（多 OpenCode 会话） | MVP 单会话假设；store 层写入用临时文件+rename 原子替换，降低损坏概率 |

---

## 8. 里程碑

```text
M1（L0+L1 完成）：存储核心可用——创建任务即落盘全套文件，单测通过
M2（L2+L3+L4 完成）：引擎与模板就绪——三种流程可初始化，门禁可判 pass/fail/warning
M3（L5 完成）：MCP Server 可用——16 工具注册，stdio 冒烟通过
M4（L6+L7 完成）：闭环验收——PRD 第 16 章场景全过，OpenCode 内真需求试跑成功
```

## 9. 后续演进（不在本期）

V0.2：artifact.diff、question 全闭环增强、context.update_glossary、更多门禁规则（上下游衔接、LLM 辅助审查）；V0.3：SQLite 存储（store 层接口已隔离，切换面小）；V1.0：OpenCode 插件封装一键安装。
