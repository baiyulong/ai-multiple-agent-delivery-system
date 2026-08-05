import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { initDeliveryRoot } from '../../src/core/init.js';
import { registerTaskTools } from '../../src/tools/task.js';
import { registerStageTools } from '../../src/tools/stage.js';
import { registerArtifactTools } from '../../src/tools/artifact.js';
import { registerGateTools } from '../../src/tools/gate.js';
import { registerContextTools } from '../../src/tools/context.js';
import { registerQuestionTools } from '../../src/tools/question.js';
import { registerTeamTools } from '../../src/tools/team.js';
import { registerUserTools } from '../../src/tools/user.js';
import { registerEmailTools } from '../../src/tools/email.js';
import { upsertMember } from '../../src/core/store/team-store.js';
import { writeCurrentUser } from '../../src/core/store/user-store.js';

export interface TestHarness {
  root: string;
  client: Client;
  call: (name: string, args: Record<string, unknown>) => Promise<Record<string, any>>;
  cleanup: () => Promise<void>;
}

/** 创建测试脚手架：临时 root + 内存传输的 MCP client */
export async function createHarness(): Promise<TestHarness> {
  const root = await mkdtemp(join(tmpdir(), 'delivery-e2e-'));
  await initDeliveryRoot(root);

  // 将当前人配置指向本 harness 独立文件，避免并行测试竞争写机器级 user.json（Windows rename 锁）
  const prevUserEnv = process.env.DELIVERY_USER_CONFIG;
  process.env.DELIVERY_USER_CONFIG = join(root, 'user.json');

  const server = new McpServer({ name: 'test-delivery', version: '0.0.0' });
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

  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  // 首次使用强制校验：先配置当前人 + 一名团队成员，否则 task.create 会被拦截
  await writeCurrentUser({ name: 'Test User', email: 'test@example.com' });
  await upsertMember(root, { name: 'Test User', email: 'test@example.com', roles: ['product-manager', 'engineer'] });

  return {
    root,
    client,
    call: async (name, args) => {
      const res = await client.callTool({ name, arguments: args });
      return JSON.parse((res.content as Array<{ type: string; text: string }>)[0]!.text);
    },
    cleanup: async () => {
      await client.close();
      if (prevUserEnv !== undefined) process.env.DELIVERY_USER_CONFIG = prevUserEnv;
      else delete process.env.DELIVERY_USER_CONFIG;
      await rm(root, { recursive: true, force: true });
    },
  };
}

/** CRUD 功能规格卡：满足门禁的完整内容（PRD 附录 21） */
export function validCrudSpecCard(): string {
  return [
    '# CRUD 功能规格卡',
    '',
    '## 1. 功能名称',
    '供应商分类维护',
    '',
    '## 2. 维护对象',
    '供应商分类',
    '',
    '## 3. 使用角色',
    '采购管理员',
    '',
    '## 4. 业务目的',
    '支持采购管理员统一维护供应商分类，保证采购数据分类一致。',
    '',
    '## 5. 页面类型',
    '列表页 + 新增/编辑弹窗 + 停用确认',
    '',
    '## 6. 查询条件',
    '分类名称（模糊）、状态（启用/停用）',
    '',
    '## 7. 列表字段',
    '分类名称、上级分类、状态、创建人、创建时间、操作（编辑/停用）',
    '',
    '## 8. 新增规则',
    '分类名称必填且唯一；最多支持三级层级；上级分类可选。',
    '',
    '## 9. 编辑规则',
    '仅可编辑分类名称与上级分类；已被引用的分类不可变更层级。',
    '',
    '## 10. 删除/停用规则',
    '停用需二次确认；已被供应商引用的分类不可停用，系统给出提示。',
    '',
    '## 11. 权限规则',
    '仅采购管理员角色可新增、编辑、停用；普通采购员只读。',
    '',
    '## 12. 数据校验',
    '名称唯一性后端校验；名称长度 1-50 字符；不允许空格开头。',
    '',
    '## 13. 审计要求',
    '新增/编辑/停用操作记录操作人、时间与变更内容。',
    '',
    '## 14. 验收标准',
    '- Given 采购管理员，When 输入唯一分类名称新增，Then 列表出现新分类',
    '- Given 分类已被供应商引用，When 尝试停用，Then 系统提示不可停用',
    '- Given 普通采购员，When 尝试新增分类，Then 按钮不可见',
  ].join('\n');
}

/** 页面交互说明卡：满足门禁的完整内容（PRD 附录 22） */
export function validUxInteractionCard(): string {
  return [
    '# 页面交互说明卡',
    '',
    '## 1. 页面名称',
    '供应商分类管理页',
    '',
    '## 2. 面向用户角色',
    '采购管理员、采购员',
    '',
    '## 3. 用户目标',
    '维护分类结构，为供应商挂接分类',
    '',
    '## 4. 入口路径',
    '采购管理 → 基础资料 → 供应商分类',
    '',
    '## 5. 前置条件',
    '用户已登录并拥有采购管理菜单权限',
    '',
    '## 6. 页面结构',
    '顶部查询区 + 左侧层级树 + 右侧分类列表 + 操作按钮',
    '',
    '## 7. 主操作流程',
    '进入页面 → 查询分类 → 新增/编辑 → 保存 → 刷新列表',
    '',
    '## 8. 异常流程',
    '名称重复 → 后端返回错误 → 表单标红并提示',
    '',
    '## 9. 页面字段',
    '| 字段 | 含义 | 是否必填 | 校验规则 | 展示方式 |',
    '|---|---|---|---|---|',
    '| 分类名称 | 分类唯一名称 | 是 | 1-50 字符唯一 | 输入框 |',
    '| 上级分类 | 父级分类 | 否 | 最多三级 | 树选择器 |',
    '| 状态 | 启用/停用 | 是 | 枚举 | 标签 |',
    '',
    '## 10. 按钮与操作',
    '| 按钮 | 触发条件 | 点击后行为 | 成功提示 | 失败提示 |',
    '|---|---|---|---|---|',
    '| 新增 | 有新增权限 | 打开新增弹窗 | 新增成功 | 保存失败 |',
    '| 停用 | 状态为启用 | 二次确认 | 停用成功 | 不可停用提示 |',
    '',
    '## 11. 状态与按钮矩阵',
    '| 状态 | 可见按钮 | 禁止操作 | 说明 |',
    '|---|---|---|---|',
    '| 启用 | 编辑、停用 | 启用 | 正常可用 |',
    '| 停用 | 编辑、启用 | 停用 | 不可挂接新供应商 |',
    '',
    '## 12. 权限规则',
    '新增/编辑/停用按钮按采购管理员角色控制，普通采购员隐藏。',
    '',
    '## 13. 错误提示',
    '名称重复、层级超限、被引用不可停用均给出明确错误提示。',
    '',
    '## 14. 空状态',
    '无分类时展示空状态插画与"新建第一个分类"按钮。',
    '',
    '## 15. 加载状态',
    '列表与树加载时展示骨架屏。',
    '',
    '## 16. 给工程师的实现建议',
    '前端使用表单校验 + 后端唯一性校验双保险；停用操作前后端均校验引用。',
    '',
    '## 17. 给 QA 的测试建议',
    '覆盖新增/编辑/停用、重复名称、层级超限、被引用停用等场景。',
  ].join('\n');
}

/** DDD 适用性审核（PRD 附录 23） */
export function validDddReview(): string {
  return [
    '# DDD 适用性审核',
    '',
    '## 1. 需求类型判断',
    '简单 CRUD',
    '',
    '## 2. 判断依据',
    '| 判断项 | 是否满足 | 说明 |',
    '|---|---|---|',
    '| 业务规则是否复杂 | 否 | 仅名称唯一性 |',
    '| 是否存在状态流转 | 是 | 启用/停用 |',
    '| 是否存在多角色协作 | 是 | 采购管理员/采购员 |',
    '| 是否存在跨模块联动 | 否 | 仅供应商引用 |',
    '| 是否存在业务不变量 | 否 | - |',
    '| 是否未来变化频繁 | 否 | 结构稳定 |',
    '',
    '## 3. 推荐架构方式',
    '简单分层（Controller/Service/Repository），不引入领域模型。',
    '',
    '## 4. 是否需要领域模型',
    '否',
    '',
    '## 5. 是否需要领域事件',
    '否',
    '',
    '## 6. 是否存在隐藏业务规则',
    '已引用分类不可停用需后端强校验。',
    '',
    '## 7. 风险说明',
    '命名与字段需统一语言；防止未来演化。',
    '',
    '## 8. 给工程师的建议',
    'CRUD 走标准三层，校验集中在 Service。',
    '',
    '## 9. 给 QA 的建议',
    '重点测权限与停用规则。',
  ].join('\n');
}

/** 工程实现方案（PRD 11.4） */
export function validEngineeringPlan(): string {
  return [
    '# 工程实现方案',
    '',
    '## 1. 技术背景与约束',
    'Vue3 + Spring Boot + MySQL；现有权限中心提供角色接口。',
    '',
    '## 2. 推荐模块结构',
    'frontend/src/views/supplier/category + backend/src/main/java/.../supplier/category',
    '',
    '## 3. 前端实现设计',
    '列表页组件 + 分类弹窗组件 + 状态管理（Pinia）',
    '',
    '## 4. 后端实现设计',
    'CategoryController / CategoryService / CategoryRepository',
    '',
    '## 5. API 设计',
    '| API | 方法 | 说明 | 请求 | 响应 |',
    '|---|---|---|---|---|',
    '| /api/categories | GET | 分页查询 | page,size,name | PageResult |',
    '| /api/categories | POST | 新增 | CategoryDTO | CategoryVO |',
    '| /api/categories/{id} | PUT | 编辑 | CategoryDTO | CategoryVO |',
    '| /api/categories/{id}/disable | POST | 停用 | - | 200/409 |',
    '',
    '## 6. 数据模型建议',
    'supplier_category(id, name, parent_id, status, created_by, created_at, updated_at)',
    '',
    '## 7. 核心业务逻辑实现建议',
    '名称唯一性、层级校验、被引用停用校验在 Service 层实现。',
    '',
    '## 8. 单元测试建议',
    'Service 单测覆盖校验逻辑。',
    '',
    '## 9. 集成测试建议',
    '接口集成测试覆盖 CRUD 全流程。',
    '',
    '## 10. 技术风险',
    '分类被引用数据的清理策略。',
    '',
    '## 11. 给 QA 的测试输入',
    '接口清单与状态流转见上文。',
    '',
    '## 12. 给平台/DevOps 的部署输入',
    'MySQL 建表脚本与迁移说明。',
  ].join('\n');
}

/** QA 测试方案（PRD 附录 24 / 11.5） */
export function validQaTestPlan(): string {
  return [
    '# QA 测试方案',
    '',
    '## 1. 测试范围',
    '供应商分类的增删改查、权限、停用规则。',
    '',
    '## 2. 不测试范围',
    '其他模块功能。',
    '',
    '## 3. 测试策略',
    '功能测试 + 接口测试 + 权限测试。',
    '',
    '## 4. 功能测试用例',
    '- T1 新增分类：有权限用户输入唯一名称保存，列表新增成功',
    '- T2 重复名称：输入已存在名称，系统提示名称重复',
    '- T3 停用被引用分类：点击停用，系统提示不可停用',
    '- T4 编辑分类：修改名称保存，列表更新成功',
    '',
    '## 5. 业务规则测试',
    '| 规则 | 测试场景 | 预期结果 |',
    '|---|---|---|',
    '| 名称唯一 | 重复新增 | 拒绝 |',
    '| 被引用不可停用 | 停用已引用分类 | 拒绝并提示 |',
    '',
    '## 6. 状态流转测试',
    '| 初始状态 | 操作 | 目标状态 | 预期结果 |',
    '|---|---|---|---|',
    '| 启用 | 停用 | 停用 | 成功 |',
    '| 停用 | 启用 | 启用 | 成功 |',
    '',
    '## 7. 权限测试',
    '普通采购员不可见新增/编辑/停用按钮。',
    '',
    '## 8. 接口测试',
    '接口幂等与参数校验测试。',
    '',
    '## 9. 异常和边界测试',
    '名称 50 字符边界、空值、超长。',
    '',
    '## 10. 回归测试清单',
    '分类 CRUD 全流程回归。',
    '',
    '## 11. 自动化测试建议',
    '接口自动化 + 关键 UI 用例。',
    '',
    '## 12. 质量风险',
    '停用规则前端后端不一致。',
    '',
    '## 13. 是否满足验收标准',
    '覆盖全部验收标准。',
  ].join('\n');
}
