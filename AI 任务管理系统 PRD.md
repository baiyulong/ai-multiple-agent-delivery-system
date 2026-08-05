# PRD：AI Delivery Task System + MCP 交付物门禁与七角色 Agent 工作流

> 文档版本：v1.0  
> 目标读者：AI 开发 Agent、架构师、工程师、产品经理、QA  
> 适用范围：OpenCode 自定义 Agent、MCP Server、AI 项目交付流程、DDD/CRUD/轻量 DDD 工作流  
> 当前日期：2026-08-04  

---

## 1. 背景与问题

团队希望借助 AI 提升项目交付效率，并已经形成一套 **七角色 AI 协作模型**：

1. 业务专家 / 领域专家
2. 产品经理
3. UI/UX 设计
4. 领域架构师 / 解决方案架构师
5. 工程师
6. QA / 质量工程
7. 平台 / DevOps / 工程效率

当前希望进一步将七个角色落地为多个 Subagent，并让它们不仅能生成内容，还能按照清晰流程接力交付。

核心设想是：

```text
每个角色 Agent 在执行前，先检查当前任务是否已经具备上游角色交付物。
如果上游交付物缺失，则自动回退到对应角色 Agent，协助用户补齐该交付物。
当前角色完成自己的交付物后，通过 MCP 提交、校验并标记完成。
只有当前阶段交付物通过门禁后，下一个角色才可以接力。
```

这需要一个 **AI Delivery Task System** 作为状态源，并通过 **MCP Server** 暴露工具能力给 Agent 读写任务状态、提交交付物、检查门禁和推进流程。

---

## 2. 产品目标

### 2.1 总体目标

构建一个面向 AI 辅助项目交付的轻量任务管理与交付物门禁系统，使 OpenCode 中的七角色 Agent 能够围绕任务进行有序协作。

系统应支持：

```text
任务创建
任务类型识别
流程模板匹配
阶段状态管理
上游交付物检查
角色交付物提交
交付物结构校验
门禁检查
阶段完成标记
缺失交付物回退补齐
共享上下文读取与更新
最终交付包导出
```

### 2.2 产品价值

1. **减少 AI 生成内容的随意性**  
   Agent 不再随便输出，而是围绕当前角色的标准交付物工作。

2. **保证角色之间可衔接**  
   下游 Agent 必须基于上游已完成并通过门禁的交付物继续工作。

3. **避免越权和假设**  
   工程师 Agent 不能自行编造产品规则，架构师 Agent 不能自行假设业务约束。

4. **支持不同复杂度任务流程**  
   简单 CRUD、轻量 DDD、完整 DDD 走不同流程，避免过度设计。

5. **形成团队可复用资产**  
   交付物、模板、统一语言、领域模型、测试用例和发布清单可以持续沉淀。

---

## 3. 产品范围

### 3.1 MVP 范围

MVP 采用本地文件系统作为任务与交付物存储，提供 MCP Server 供 OpenCode Agent 调用。

MVP 包含：

```text
1. 本地 .delivery 目录作为任务状态中心
2. 任务创建、读取、类型识别
3. CRUD / 轻量 DDD / 完整 DDD 三类流程模板
4. 阶段状态管理
5. 交付物提交和读取
6. 基于模板的交付物结构校验
7. 阶段完成标记
8. 缺失交付物检测
9. 共享上下文读取
10. Markdown 格式交付物存储
```

### 3.2 非 MVP 范围

MVP 暂不包含：

```text
1. Web UI 看板
2. 多人权限体系
3. 企业任务系统双向同步
4. 数据库持久化
5. 复杂自然语言质量评分模型
6. 自动创建代码 Pull Request
7. 自动发布生产环境
8. 完整插件市场发布
```

这些能力可作为后续版本演进。

---

## 4. 用户与角色

### 4.1 人类用户角色

| 用户 | 诉求 |
|---|---|
| 产品经理 | 希望 AI 协助生成需求、CRUD 规格卡、验收标准 |
| 架构师 | 希望 AI 基于需求检查 DDD 适用性并生成领域设计 |
| 工程师 | 希望 AI 基于已完成交付物生成实现方案和代码结构 |
| QA | 希望 AI 基于需求、UI、领域模型和接口生成测试用例 |
| 团队负责人 | 希望任务状态、交付物和流程进展可追踪 |

### 4.2 AI Agent 角色

| Agent | 类型 | 主要职责 |
|---|---|---|
| Delivery Orchestrator Agent | Primary Agent | 判断流程、检查状态、调度角色 Agent |
| Domain Expert Agent | Subagent | 业务规则、术语、异常场景 |
| Product Manager Agent | Subagent | 产品需求、CRUD 规格卡、验收标准 |
| UI/UX Designer Agent | Subagent | 页面流程、交互说明、状态按钮矩阵 |
| Domain Architect Agent | Subagent | DDD 适用性、领域模型、接口契约 |
| Engineer Agent | Subagent | 工程方案、模块结构、接口和实现建议 |
| QA Agent | Subagent | 测试策略、测试用例、质量风险 |
| Platform DevOps Agent | Subagent | 流水线、发布清单、监控和质量门禁 |

---

## 5. 核心概念定义

### 5.1 Task

Task 表示一个需求、变更、缺陷、技术改造或交付项。

示例：

```json
{
  "task_id": "TASK-20260804-001",
  "title": "供应商分类维护",
  "description": "支持采购管理员维护供应商分类，包括新增、编辑、停用和查询。",
  "task_type": "crud",
  "status": "in_progress",
  "current_stage": "product_requirement",
  "created_by": "Yulong",
  "created_at": "2026-08-04T21:11:00+08:00",
  "updated_at": "2026-08-04T21:28:00+08:00"
}
```

### 5.2 Stage

Stage 表示任务在某个角色阶段的推进状态。

```json
{
  "task_id": "TASK-20260804-001",
  "stage": "product_requirement",
  "role": "product-manager",
  "required_artifact_type": "crud_spec_card",
  "status": "completed",
  "artifact_id": "ART-20260804-001"
}
```

阶段状态枚举：

```text
not_started
in_progress
blocked
submitted
validated
completed
needs_revision
skipped
```

### 5.3 Artifact

Artifact 表示某个角色在某阶段生成的正式交付物。

```json
{
  "artifact_id": "ART-20260804-001",
  "task_id": "TASK-20260804-001",
  "stage": "product_requirement",
  "role": "product-manager",
  "artifact_type": "crud_spec_card",
  "title": "供应商分类维护 CRUD 功能规格卡",
  "status": "validated",
  "version": 1,
  "path": "artifacts/product_requirement/crud_spec_card.md"
}
```

交付物状态枚举：

```text
draft
submitted
validated
needs_revision
deprecated
```

### 5.4 Gate

Gate 表示阶段交付物是否满足必填结构、质量要求和衔接要求。

```json
{
  "gate_id": "GATE-20260804-001",
  "task_id": "TASK-20260804-001",
  "stage": "product_requirement",
  "artifact_id": "ART-20260804-001",
  "result": "passed",
  "score": 92,
  "issues": []
}
```

门禁结果枚举：

```text
passed
failed
warning
manual_review_required
```

### 5.5 Open Question

Open Question 表示 Agent 不能自行假设、必须由人类或上游角色确认的问题。

```json
{
  "question_id": "Q-20260804-001",
  "task_id": "TASK-20260804-001",
  "raised_by": "domain-architect",
  "assigned_to_role": "product-manager",
  "question": "已被供应商引用的分类是否允许删除？",
  "status": "open"
}
```

问题状态枚举：

```text
open
answered
resolved
cancelled
```

---

## 6. 任务类型与流程模板

### 6.1 任务类型

系统至少支持以下任务类型：

```text
crud
lightweight_ddd
full_ddd
ui_only
tech_refactor
qa_only
release_only
```

MVP 阶段优先支持：

```text
crud
lightweight_ddd
full_ddd
```

---

### 6.2 CRUD 流程

适用场景：

```text
字典维护
分类维护
标签维护
参数配置
简单基础资料维护
```

流程：

```text
product_requirement
    ↓
ux_design
    ↓
domain_review
    ↓
engineering_design
    ↓
qa_validation
```

阶段与交付物：

| 阶段 | 角色 | 必需交付物 |
|---|---|---|
| product_requirement | Product Manager Agent | crud_spec_card |
| ux_design | UI/UX Designer Agent | ux_interaction_card |
| domain_review | Domain Architect Agent | ddd_applicability_review |
| engineering_design | Engineer Agent | engineering_plan |
| qa_validation | QA Agent | qa_test_plan |

不强制交付：

```text
完整用户故事
复杂领域模型
领域事件
边界上下文图
ADR
```

---

### 6.3 轻量 DDD 流程

适用场景：

```text
重要主数据
少量业务规则
简单状态流转
未来可能演进的业务对象
```

流程：

```text
product_requirement
    ↓
ux_design
    ↓
domain_design
    ↓
engineering_design
    ↓
qa_validation
    ↓
devops_release
```

阶段与交付物：

| 阶段 | 角色 | 必需交付物 |
|---|---|---|
| product_requirement | Product Manager Agent | product_requirement_card |
| ux_design | UI/UX Designer Agent | ux_interaction_card, state_action_matrix |
| domain_design | Domain Architect Agent | lightweight_domain_model, api_contract |
| engineering_design | Engineer Agent | engineering_plan |
| qa_validation | QA Agent | qa_test_plan |
| devops_release | Platform DevOps Agent | release_checklist |

---

### 6.4 完整 DDD 流程

适用场景：

```text
核心业务流程
复杂规则
状态流转
多角色协作
跨上下文联动
```

流程：

```text
business_discovery
    ↓
product_requirement
    ↓
ux_design
    ↓
domain_design
    ↓
engineering_design
    ↓
qa_validation
    ↓
devops_release
```

阶段与交付物：

| 阶段 | 角色 | 必需交付物 |
|---|---|---|
| business_discovery | Domain Expert Agent | business_rules, ubiquitous_language |
| product_requirement | Product Manager Agent | product_requirement_card, user_stories, acceptance_criteria |
| ux_design | UI/UX Designer Agent | ux_interaction_card, state_action_matrix |
| domain_design | Domain Architect Agent | bounded_context, aggregate_design, domain_events, api_contract |
| engineering_design | Engineer Agent | engineering_plan |
| qa_validation | QA Agent | qa_test_plan |
| devops_release | Platform DevOps Agent | release_checklist |

---

## 7. 核心用户故事与需求说明

> 注：这里的“用户故事”用于描述系统本身的能力，不是业务 CRUD 功能的需求写法。

### 7.1 创建 AI 交付任务

```text
作为交付编排 Agent，
我希望能根据用户输入创建一个 AI 交付任务，
以便后续所有角色 Agent 都能围绕同一个任务状态协作。
```

验收标准：

```gherkin
Given 用户输入一个新需求
When Orchestrator 调用 task.create
Then 系统应创建 task.json
And 初始化任务状态为 in_progress
And 根据任务类型初始化 stages.json
```

---

### 7.2 自动识别任务类型

```text
作为交付编排 Agent，
我希望系统能根据任务描述判断任务类型，
以便选择 CRUD、轻量 DDD 或完整 DDD 流程。
```

验收标准：

```gherkin
Given 用户输入“维护供应商分类，支持新增、编辑、停用和查询”
When 调用 task.detect_type
Then 系统应返回 task_type = crud
And 返回推荐流程 product_requirement → ux_design → domain_review → engineering_design → qa_validation
```

---

### 7.3 检查上游交付物

```text
作为下游角色 Agent，
我希望在执行前检查上游角色交付物是否存在并通过门禁，
以便避免基于不完整输入继续工作。
```

验收标准：

```gherkin
Given 当前阶段为 ux_design
And product_requirement 阶段未完成
When UI/UX Agent 请求开始工作
Then 系统应返回 blocked
And 指出缺少 crud_spec_card
And 建议调用 Product Manager Agent 补齐
```

---

### 7.4 缺失交付物自动回退补齐

```text
作为交付编排 Agent，
我希望当发现缺少上游交付物时，自动调度对应角色 Agent，
以便用户不需要理解完整流程也能逐步补齐交付物。
```

验收标准：

```gherkin
Given 当前任务缺少 product_requirement 阶段交付物
When Orchestrator 调用 gate 或 stage 检查
Then 系统应阻塞后续阶段
And 返回 assigned_agent = product-manager
And 返回需要生成 crud_spec_card 的指令
```

---

### 7.5 提交交付物

```text
作为角色 Agent，
我希望能将生成的交付物提交到任务系统，
以便后续 Agent 可以读取和复用。
```

验收标准：

```gherkin
Given Product Manager Agent 已生成 CRUD 功能规格卡
When 调用 artifact.submit
Then 系统应保存 Markdown 文件
And 创建 artifact metadata
And 将 artifact 状态设置为 submitted
```

---

### 7.6 校验交付物

```text
作为交付编排 Agent，
我希望能对交付物执行结构和质量校验，
以便只有合格交付物才能进入下一阶段。
```

验收标准：

```gherkin
Given 已提交 crud_spec_card
When 调用 gate.check
Then 系统应检查是否包含功能名称、维护对象、字段定义、权限规则、验收标准等必填章节
And 如果缺失必填章节，应返回 failed
And 给出缺失项列表
```

---

### 7.7 标记阶段完成

```text
作为交付编排 Agent，
我希望在交付物通过门禁后标记阶段完成，
以便流程推进到下一个角色。
```

验收标准：

```gherkin
Given product_requirement 阶段交付物通过 gate.check
When 调用 stage.complete
Then product_requirement 阶段状态应变为 completed
And task.current_stage 应更新为 ux_design
```

---

### 7.8 读取共享上下文

```text
作为角色 Agent，
我希望能读取任务共享上下文，
以便使用统一语言、业务规则、领域状态和已确认决策。
```

验收标准：

```gherkin
Given 任务存在 context.md
When Agent 调用 context.get_shared
Then 系统应返回项目背景、业务规则、统一语言、已确认决策和待确认问题
```

---

### 7.9 创建待确认问题

```text
作为角色 Agent，
我希望当发现不能自行假设的问题时创建待确认问题，
以便对应角色或人类用户补充确认。
```

验收标准：

```gherkin
Given Domain Architect Agent 发现删除规则不明确
When 调用 question.create
Then 系统应创建 open question
And 阻塞当前阶段或将当前阶段标记为 blocked
And 指定 assigned_to_role = product-manager
```

---

### 7.10 导出交付包

```text
作为团队负责人，
我希望能导出某个任务的完整交付包，
以便用于评审、归档或交给开发团队执行。
```

验收标准：

```gherkin
Given 任务所有必需阶段都 completed
When 调用 task.export_delivery_package
Then 系统应生成一个 Markdown 文件
And 包含任务摘要、交付物列表、关键决策、待确认问题和最终状态
```

---

## 8. 功能需求

### 8.1 任务管理

#### 8.1.1 创建任务

系统应支持创建任务，并生成：

```text
task.json
stages.json
context.md
questions.md
artifacts/ 目录
gates/ 目录
```

任务 ID 规则：

```text
TASK-YYYYMMDD-NNN
```

示例：

```text
TASK-20260804-001
```

#### 8.1.2 获取任务

系统应支持通过 task_id 获取：

```text
任务基本信息
任务类型
当前阶段
阶段状态
交付物摘要
待确认问题
```

#### 8.1.3 更新任务状态

任务状态枚举：

```text
draft
in_progress
blocked
completed
cancelled
archived
```

---

### 8.2 任务类型识别

系统应支持根据任务描述识别任务类型。

MVP 可采用规则判断：

```text
如果描述包含“维护、字典、分类、标签、参数、新增、编辑、删除、查询”，且缺少复杂状态流转和跨模块协作，则判断为 crud。

如果描述包含“状态、审批、启用、停用、冻结、评级、规则”，但不涉及复杂跨上下文，则判断为 lightweight_ddd。

如果描述包含“流程、履约、结算、库存、订单、审批链、领域事件、跨模块联动”，则判断为 full_ddd。
```

返回字段：

```json
{
  "task_type": "crud",
  "confidence": 0.86,
  "reason": "该需求主要是数据维护，没有明显复杂业务规则或状态流转",
  "recommended_flow": [
    "product_requirement",
    "ux_design",
    "domain_review",
    "engineering_design",
    "qa_validation"
  ]
}
```

---

### 8.3 流程模板管理

系统应内置流程模板：

```text
crud-flow.json
lightweight-ddd-flow.json
full-ddd-flow.json
```

流程模板包括：

```text
stage
role
required_artifact_type
required_previous_stages
gate_rules
allow_skip
```

示例：

```json
{
  "task_type": "crud",
  "flow": [
    {
      "stage": "product_requirement",
      "role": "product-manager",
      "required_artifact_type": "crud_spec_card",
      "required_previous_stages": [],
      "allow_skip": false
    },
    {
      "stage": "ux_design",
      "role": "ux-designer",
      "required_artifact_type": "ux_interaction_card",
      "required_previous_stages": ["product_requirement"],
      "allow_skip": false
    }
  ]
}
```

---

### 8.4 阶段状态管理

系统应支持：

```text
stage.get
stage.start
stage.block
stage.complete
stage.skip
stage.reopen
stage.get_previous
stage.get_next
```

阶段完成前必须满足：

```text
1. 当前阶段必需交付物存在
2. 交付物状态为 validated
3. gate.check 结果为 passed 或 manual approved
4. 没有阻塞当前阶段的 open question
```

---

### 8.5 交付物管理

系统应支持：

```text
artifact.submit
artifact.get
artifact.list
artifact.validate
artifact.update
artifact.mark_deprecated
artifact.diff
```

交付物必须以 Markdown 存储。

目录规则：

```text
.delivery/tasks/{task_id}/artifacts/{stage}/{artifact_type}.md
```

交付物 metadata 存储位置：

```text
.delivery/tasks/{task_id}/artifacts/index.json
```

---

### 8.6 门禁检查

系统应支持按 artifact_type 执行门禁检查。

门禁类型：

```text
1. 结构检查
2. 必填项检查
3. 内容空值检查
4. 上下游衔接检查
5. 待确认问题检查
```

MVP 先实现结构检查和必填项检查。

---

### 8.7 共享上下文管理

系统应提供共享上下文文件：

```text
.delivery/tasks/{task_id}/context.md
```

包含：

```markdown
# 项目共享上下文

## 1. 项目背景

## 2. 当前阶段

## 3. 用户角色

## 4. 业务目标

## 5. 统一语言表

## 6. 业务规则清单

## 7. 边界上下文

## 8. 领域状态模型

## 9. 页面清单

## 10. 接口清单

## 11. 技术栈

## 12. 代码规范

## 13. 测试规范

## 14. 发布规范

## 15. 已确认决策

## 16. 待确认问题

## 17. 已知风险
```

---

### 8.8 待确认问题管理

系统应支持：

```text
question.create
question.list_open
question.answer
question.resolve
```

当存在阻塞当前阶段的 open question 时，stage.complete 应失败。

---

### 8.9 交付包导出

系统应支持导出完整交付包。

输出路径：

```text
.delivery/tasks/{task_id}/delivery_package.md
```

交付包内容：

```text
任务摘要
任务类型
流程阶段
交付物列表
每个交付物内容或链接
门禁结果
待确认问题
关键决策
最终状态
```

---

## 9. MCP 工具需求

MCP Server 名称建议：

```text
delivery-mcp-server
```

---

### 9.1 task.create

用途：创建 AI 交付任务。

输入：

```json
{
  "title": "string",
  "description": "string",
  "created_by": "string",
  "task_type": "string | optional"
}
```

输出：

```json
{
  "task_id": "TASK-20260804-001",
  "status": "in_progress",
  "current_stage": "product_requirement",
  "task_path": ".delivery/tasks/TASK-20260804-001"
}
```

---

### 9.2 task.get

用途：获取任务详情。

输入：

```json
{
  "task_id": "string"
}
```

输出：

```json
{
  "task": {},
  "stages": [],
  "artifacts": [],
  "open_questions": []
}
```

---

### 9.3 task.detect_type

用途：判断任务类型。

输入：

```json
{
  "task_description": "string",
  "context": {}
}
```

输出：

```json
{
  "task_type": "crud",
  "confidence": 0.86,
  "reason": "string",
  "recommended_flow": []
}
```

---

### 9.4 task.get_flow

用途：获取任务对应流程模板。

输入：

```json
{
  "task_type": "crud"
}
```

输出：

```json
{
  "task_type": "crud",
  "flow": []
}
```

---

### 9.5 stage.get

用途：获取阶段状态。

输入：

```json
{
  "task_id": "string",
  "stage": "string"
}
```

输出：

```json
{
  "stage": "product_requirement",
  "role": "product-manager",
  "status": "completed",
  "artifact_id": "ART-001"
}
```

---

### 9.6 stage.complete

用途：标记阶段完成。

输入：

```json
{
  "task_id": "string",
  "stage": "string",
  "artifact_id": "string",
  "completed_by": "string"
}
```

输出：

```json
{
  "stage": "product_requirement",
  "status": "completed",
  "next_stage": "ux_design",
  "next_role": "ux-designer"
}
```

---

### 9.7 artifact.submit

用途：提交交付物。

输入：

```json
{
  "task_id": "string",
  "stage": "string",
  "role": "string",
  "artifact_type": "string",
  "content": "string",
  "summary": "string"
}
```

输出：

```json
{
  "artifact_id": "ART-20260804-001",
  "status": "submitted",
  "path": "string"
}
```

---

### 9.8 artifact.get

用途：读取交付物。

输入：

```json
{
  "task_id": "string",
  "artifact_id": "string"
}
```

输出：

```json
{
  "metadata": {},
  "content": "string"
}
```

---

### 9.9 artifact.list

用途：列出任务交付物。

输入：

```json
{
  "task_id": "string"
}
```

输出：

```json
{
  "artifacts": []
}
```

---

### 9.10 gate.check

用途：对交付物进行门禁检查。

输入：

```json
{
  "task_id": "string",
  "stage": "string",
  "artifact_id": "string"
}
```

输出：

```json
{
  "result": "passed",
  "score": 92,
  "missing_sections": [],
  "issues": []
}
```

---

### 9.11 context.get_shared

用途：读取共享上下文。

输入：

```json
{
  "task_id": "string"
}
```

输出：

```json
{
  "content": "markdown string"
}
```

---

### 9.12 context.update

用途：更新共享上下文。

输入：

```json
{
  "task_id": "string",
  "section": "string",
  "content": "string",
  "updated_by": "string"
}
```

输出：

```json
{
  "status": "updated"
}
```

---

### 9.13 question.create

用途：创建待确认问题。

输入：

```json
{
  "task_id": "string",
  "raised_by": "string",
  "assigned_to_role": "string",
  "question": "string",
  "blocks_stage": "string"
}
```

输出：

```json
{
  "question_id": "Q-20260804-001",
  "status": "open"
}
```

---

### 9.14 question.resolve

用途：关闭待确认问题。

输入：

```json
{
  "task_id": "string",
  "question_id": "string",
  "answer": "string",
  "resolved_by": "string"
}
```

输出：

```json
{
  "question_id": "Q-20260804-001",
  "status": "resolved"
}
```

---

### 9.15 task.export_delivery_package

用途：导出完整交付包。

输入：

```json
{
  "task_id": "string"
}
```

输出：

```json
{
  "path": ".delivery/tasks/TASK-20260804-001/delivery_package.md",
  "status": "exported"
}
```

---

## 10. 存储设计

### 10.1 目录结构

```text
.delivery/
  config/
    flows/
      crud-flow.json
      lightweight-ddd-flow.json
      full-ddd-flow.json
    gates/
      crud_spec_card.json
      ux_interaction_card.json
      ddd_applicability_review.json
      engineering_plan.json
      qa_test_plan.json
  tasks/
    TASK-20260804-001/
      task.json
      stages.json
      context.md
      questions.json
      artifacts/
        index.json
        product_requirement/
          crud_spec_card.md
        ux_design/
          ux_interaction_card.md
        domain_review/
          ddd_applicability_review.md
        engineering_design/
          engineering_plan.md
        qa_validation/
          qa_test_plan.md
      gates/
        product_requirement.gate.json
        ux_design.gate.json
        domain_review.gate.json
      delivery_package.md
```

---

### 10.2 task.json

```json
{
  "task_id": "TASK-20260804-001",
  "title": "供应商分类维护",
  "description": "支持采购管理员维护供应商分类，包括新增、编辑、停用和查询。",
  "task_type": "crud",
  "status": "in_progress",
  "current_stage": "product_requirement",
  "created_by": "Yulong",
  "created_at": "2026-08-04T21:11:00+08:00",
  "updated_at": "2026-08-04T21:28:00+08:00"
}
```

---

### 10.3 stages.json

```json
[
  {
    "stage": "product_requirement",
    "role": "product-manager",
    "required_artifact_type": "crud_spec_card",
    "status": "not_started",
    "artifact_id": null
  },
  {
    "stage": "ux_design",
    "role": "ux-designer",
    "required_artifact_type": "ux_interaction_card",
    "status": "not_started",
    "artifact_id": null
  }
]
```

---

### 10.4 artifacts/index.json

```json
[
  {
    "artifact_id": "ART-20260804-001",
    "task_id": "TASK-20260804-001",
    "stage": "product_requirement",
    "role": "product-manager",
    "artifact_type": "crud_spec_card",
    "status": "validated",
    "version": 1,
    "path": "artifacts/product_requirement/crud_spec_card.md",
    "created_at": "2026-08-04T21:20:00+08:00"
  }
]
```

---

### 10.5 questions.json

```json
[
  {
    "question_id": "Q-20260804-001",
    "task_id": "TASK-20260804-001",
    "raised_by": "domain-architect",
    "assigned_to_role": "product-manager",
    "question": "已被供应商引用的分类是否允许删除？",
    "blocks_stage": "domain_review",
    "status": "open",
    "created_at": "2026-08-04T21:25:00+08:00"
  }
]
```

---

## 11. 交付物模板与门禁规则

### 11.1 CRUD 功能规格卡必填章节

```text
功能名称
维护对象
使用角色
业务目的
页面类型
查询条件
列表字段
新增规则
编辑规则
删除/停用规则
权限规则
数据校验
审计要求
验收标准
```

门禁规则：

```text
1. 所有必填章节必须存在。
2. 删除/停用规则不能为空。
3. 权限规则不能只写“按权限控制”。
4. 验收标准不能只写“功能正常”。
5. 至少包含 3 条可测试验收标准。
```

---

### 11.2 页面交互说明卡必填章节

```text
页面名称
面向用户角色
用户目标
入口路径
前置条件
页面结构
主操作流程
异常流程
页面字段
按钮与操作
状态与按钮矩阵
权限规则
错误提示
空状态
加载状态
给工程师的实现建议
给 QA 的测试建议
```

---

### 11.3 DDD 适用性审核必填章节

```text
需求类型判断
判断依据
推荐架构方式
是否需要领域模型
是否需要领域事件
是否存在隐藏业务规则
风险说明
给工程师的建议
给 QA 的建议
```

---

### 11.4 工程实现方案必填章节

```text
技术背景与约束
推荐模块结构
前端实现设计
后端实现设计
API 设计
数据模型建议
核心业务逻辑实现建议
单元测试建议
集成测试建议
技术风险
给 QA 的测试输入
给平台/DevOps 的部署输入
```

---

### 11.5 QA 测试方案必填章节

```text
测试范围
不测试范围
测试策略
功能测试用例
业务规则测试
状态流转测试
权限测试
接口测试
异常和边界测试
回归测试清单
自动化测试建议
质量风险
是否满足验收标准
```

---

### 11.6 发布检查清单必填章节

```text
环境规划
CI/CD 流水线
质量门禁
自动化测试集成
部署策略
回滚策略
配置管理
日志规范
监控告警
安全检查
发布检查清单
AI 工具链建议
研发度量指标
```

---

## 12. Orchestrator 工作逻辑

### 12.1 正常流程

```text
1. 用户输入任务。
2. Orchestrator 调用 task.create 或 task.get。
3. 调用 task.detect_type 判断任务类型。
4. 调用 task.get_flow 获取流程模板。
5. 检查当前阶段的上游阶段是否 completed。
6. 如果上游缺失，调用对应 Agent 补齐。
7. 当前阶段 Agent 生成交付物。
8. Agent 调用 artifact.submit。
9. Orchestrator 调用 gate.check。
10. 如果通过，调用 stage.complete。
11. 更新 task.current_stage。
12. 进入下一阶段。
13. 全部完成后导出 delivery_package.md。
```

---

### 12.2 缺失交付物流程

```text
1. 当前 Agent 请求开始任务。
2. MCP 检查上游阶段。
3. 发现上游阶段未 completed 或交付物未 validated。
4. 当前阶段状态变为 blocked。
5. Orchestrator 生成说明：当前缺少某角色交付物。
6. 调用对应角色 Agent。
7. 对应 Agent 协助用户补齐交付物。
8. 提交、校验、完成。
9. 返回原阶段继续执行。
```

---

### 12.3 返工流程

```text
1. gate.check 返回 failed。
2. 当前阶段状态变为 needs_revision。
3. 返回缺失章节和问题列表。
4. 调用当前角色 Agent 修订交付物。
5. artifact.update 保存新版本。
6. 再次 gate.check。
7. 通过后 stage.complete。
```

---

## 13. Agent 行为要求

### 13.1 Delivery Orchestrator Agent

必须做到：

```text
1. 不直接生成所有角色交付物。
2. 每次先检查 task 状态和流程。
3. 明确指出当前阶段、缺失交付物和下一步。
4. 发现缺失时调用对应角色 Agent。
5. 不允许跳过必需门禁。
```

---

### 13.2 角色 Agent 通用行为

每个角色 Agent 必须做到：

```text
1. 执行前读取 task.get 和 context.get_shared。
2. 检查上游交付物是否存在。
3. 不编造上游角色应确认的信息。
4. 输出符合本角色 artifact_type 的交付物。
5. 交付物最后包含：当前结论、风险点、待确认问题、下一步建议。
6. 生成后调用 artifact.submit。
7. 如果被 gate.check 驳回，应根据问题修订。
```

---

## 14. 非功能需求

### 14.1 可维护性

```text
1. 流程模板和门禁规则应配置化。
2. 新增任务类型不应修改核心代码。
3. 新增 artifact_type 只需增加模板和 gate rule。
```

### 14.2 可扩展性

```text
1. MVP 使用文件系统。
2. 后续可切换为 SQLite。
3. 再后续可对接 Azure DevOps、Jira、GitHub Issues。
```

### 14.3 可追踪性

```text
1. 每个任务有 task_id。
2. 每个交付物有 artifact_id 和 version。
3. 每次 gate.check 有记录。
4. 每个待确认问题有 question_id。
```

### 14.4 安全性

```text
1. MCP 工具只允许访问 .delivery 目录。
2. 不允许任意文件写入。
3. 后续接入外部任务系统时必须支持凭证隔离。
4. 删除和覆盖 artifact 必须保留历史版本。
```

### 14.5 可移植性

```text
1. 所有交付物使用 Markdown。
2. 所有 metadata 使用 JSON。
3. 不绑定特定数据库。
4. 不绑定特定企业任务系统。
```

---

## 15. MVP 技术建议

### 15.1 推荐技术栈

```text
语言：TypeScript 或 Python
MCP Server：对应语言 MCP SDK
存储：本地文件系统
配置：JSON
交付物：Markdown
运行方式：本地 stdio MCP Server
集成对象：OpenCode
```

### 15.2 推荐目录

```text
ai-delivery-mcp/
  src/
    server.ts
    tools/
      task.ts
      stage.ts
      artifact.ts
      gate.ts
      context.ts
      question.ts
    core/
      task-store.ts
      flow-engine.ts
      gate-engine.ts
      artifact-store.ts
    config/
      flows/
      gates/
    templates/
  package.json
  README.md
```

如果使用 Python：

```text
ai_delivery_mcp/
  server.py
  tools/
  core/
  config/
  templates/
```

---

## 16. 验收标准

### 16.1 MVP 总体验收

```gherkin
Given 用户输入一个简单 CRUD 需求
When Orchestrator 启动交付流程
Then 系统应创建任务
And 判断任务类型为 crud
And 初始化 CRUD 流程阶段
And 引导 Product Manager Agent 生成 crud_spec_card
And 保存交付物
And 执行 gate.check
And 门禁通过后进入 ux_design 阶段
```

---

### 16.2 缺失交付物验收

```gherkin
Given 当前任务试图进入 engineering_design 阶段
And ux_design 阶段未完成
When Engineer Agent 请求开始工作
Then 系统应阻塞工程阶段
And 返回缺少 ux_interaction_card
And 建议调用 UI/UX Designer Agent 补齐
```

---

### 16.3 门禁失败验收

```gherkin
Given Product Manager Agent 提交 crud_spec_card
And 交付物缺少权限规则和验收标准
When gate.check 执行
Then 系统应返回 failed
And missing_sections 包含 权限规则 和 验收标准
And stage 状态不应变为 completed
```

---

### 16.4 阶段完成验收

```gherkin
Given crud_spec_card 已提交
And gate.check 返回 passed
When stage.complete 被调用
Then product_requirement 阶段状态应为 completed
And task.current_stage 应更新为 ux_design
```

---

### 16.5 交付包导出验收

```gherkin
Given CRUD 任务所有阶段 completed
When 调用 task.export_delivery_package
Then 系统应生成 delivery_package.md
And 内容包含所有阶段交付物和门禁结果
```

---

## 17. 版本规划

### 17.1 V0.1 MVP

```text
本地 .delivery 文件系统
CRUD / 轻量 DDD / 完整 DDD 流程模板
核心 MCP 工具
Markdown 交付物提交
基础 gate.check
阶段完成标记
```

### 17.2 V0.2 增强版

```text
交付物版本管理
question 问题闭环
artifact.diff
context.update_glossary
delivery_package 导出增强
更多门禁规则
```

### 17.3 V0.3 团队协作版

```text
SQLite 存储
任务列表查询
多人协作字段
角色负责人映射
基础 Web 看板
```

### 17.4 V1.0 插件化版本

```text
OpenCode 插件封装
一键初始化七角色 Agent
一键安装 MCP Server
内置交付模板和门禁规则
支持团队级配置
```

### 17.5 V1.5 企业集成版

```text
对接 Azure DevOps / Jira / GitHub Issues
权限和审计
企业模板库
研发度量报表
```

---

## 18. 风险与应对

### 18.1 Agent 越权生成内容

风险：工程师 Agent 可能自行补业务规则。  
应对：角色 Agent Prompt 中明确禁止越权；缺失内容必须创建 question 或回退上游 Agent。

### 18.2 门禁规则过于机械

风险：只检查标题存在，无法判断内容质量。  
应对：MVP 先做结构校验，后续增加内容质量规则和 LLM 辅助审查。

### 18.3 流程过重影响简单任务效率

风险：简单 CRUD 走完整 DDD 流程导致效率下降。  
应对：任务类型决定流程，CRUD 不强制完整用户故事和完整 DDD。

### 18.4 状态和文件不一致

风险：artifact 文件存在，但 metadata 未更新。  
应对：所有写入必须通过 MCP 工具完成，不建议人工直接改文件。

### 18.5 后续与企业任务系统冲突

风险：AI Delivery Task System 和现有项目管理系统重复。  
应对：定位为 AI 交付物门禁系统，不替代 Jira/ADO，只做补充。

---

## 19. 开发优先级

### P0

```text
task.create
task.get
task.detect_type
task.get_flow
artifact.submit
artifact.get
gate.check
stage.complete
本地目录结构
CRUD 流程模板
CRUD 功能规格卡门禁
```

### P1

```text
lightweight_ddd 流程
full_ddd 流程
context.get_shared
question.create
question.resolve
artifact.list
task.export_delivery_package
```

### P2

```text
artifact.version
artifact.diff
stage.block
stage.reopen
context.update
更多 artifact_type 门禁
SQLite 存储
```

### P3

```text
Web 看板
外部任务系统集成
OpenCode 插件封装
团队配置管理
```

---

## 20. 给 AI 开发 Agent 的实现指令建议

如果将本 PRD 交给 AI 开发，可以使用以下指令：

```text
请基于本 PRD 实现一个 MVP 版本的 Delivery MCP Server。

优先实现：
1. 本地 .delivery 文件系统存储
2. task.create
3. task.get
4. task.detect_type
5. task.get_flow
6. artifact.submit
7. artifact.get
8. gate.check
9. stage.complete
10. CRUD flow 和 crud_spec_card gate rule

要求：
1. 所有 metadata 使用 JSON。
2. 所有交付物使用 Markdown。
3. 不允许写入 .delivery 目录之外的路径。
4. 代码结构清晰，便于后续扩展到 SQLite。
5. 每个工具都要有输入输出 schema。
6. 提供 README，说明如何在 OpenCode 中注册 MCP Server。
7. 提供一个 examples 目录，包含供应商分类维护的示例任务。
```

---

## 21. 附录：CRUD 功能规格卡模板

```markdown
# CRUD 功能规格卡

## 1. 功能名称

## 2. 维护对象

## 3. 使用角色

## 4. 业务目的

## 5. 页面类型

## 6. 查询条件

## 7. 列表字段

## 8. 新增规则

## 9. 编辑规则

## 10. 删除/停用规则

## 11. 权限规则

## 12. 数据校验

## 13. 审计要求

## 14. 验收标准
```

---

## 22. 附录：页面交互说明卡模板

```markdown
# 页面交互说明卡

## 1. 页面名称

## 2. 面向用户角色

## 3. 用户目标

## 4. 入口路径

## 5. 前置条件

## 6. 页面结构

## 7. 主操作流程

## 8. 异常流程

## 9. 页面字段

| 字段 | 含义 | 是否必填 | 校验规则 | 展示方式 |
|---|---|---|---|---|

## 10. 按钮与操作

| 按钮 | 触发条件 | 点击后行为 | 成功提示 | 失败提示 |
|---|---|---|---|---|

## 11. 状态与按钮矩阵

| 状态 | 可见按钮 | 禁止操作 | 说明 |
|---|---|---|---|

## 12. 权限规则

## 13. 错误提示

## 14. 空状态

## 15. 加载状态

## 16. 给工程师的实现建议

## 17. 给 QA 的测试建议
```

---

## 23. 附录：DDD 适用性审核模板

```markdown
# DDD 适用性审核

## 1. 需求类型判断

- 简单 CRUD
- 轻量 DDD
- 完整 DDD

## 2. 判断依据

| 判断项 | 是否满足 | 说明 |
|---|---|---|
| 业务规则是否复杂 |  |  |
| 是否存在状态流转 |  |  |
| 是否存在多角色协作 |  |  |
| 是否存在跨模块联动 |  |  |
| 是否存在业务不变量 |  |  |
| 是否未来变化频繁 |  |  |

## 3. 推荐架构方式

## 4. 是否需要领域模型

## 5. 是否需要领域事件

## 6. 是否存在隐藏业务规则

## 7. 风险说明

## 8. 给工程师的建议

## 9. 给 QA 的建议
```

---

## 24. 附录：QA 测试方案模板

```markdown
# QA 测试方案

## 1. 测试范围

## 2. 不测试范围

## 3. 测试策略

## 4. 功能测试用例

| 编号 | 场景 | 前置条件 | 操作步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|

## 5. 业务规则测试

| 规则 | 测试场景 | 预期结果 |
|---|---|---|

## 6. 状态流转测试

| 初始状态 | 操作 | 目标状态 | 预期结果 |
|---|---|---|---|

## 7. 权限测试

## 8. 接口测试

## 9. 异常和边界测试

## 10. 回归测试清单

## 11. 自动化测试建议

## 12. 质量风险

## 13. 是否满足验收标准
```

---

## 25. 总结

本产品的核心不是做一个传统任务管理系统，而是做一个 **AI 角色协作的交付物状态中心**。

它通过 MCP 向 Agent 暴露任务、阶段、交付物、门禁和上下文工具，让七个角色 Agent 能够按照以下机制协作：

```text
检查上游交付物
缺失则回退补齐
生成当前角色交付物
提交并校验
通过后标记完成
再进入下一角色
```

最终目标是形成一套可复制、可追踪、可验收、可演进的 AI 辅助项目交付体系。
