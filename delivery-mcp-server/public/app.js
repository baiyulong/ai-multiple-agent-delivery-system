/**
 * AI 交付任务看板 - 前端应用
 * 纯原生 JS，无框架依赖
 */

(function () {
  'use strict';

  // ==================== 常量 ====================

  const API_BASE = '/api';

  const TASK_TYPE_MAP = {
    crud: 'CRUD',
    lightweight_ddd: '轻量 DDD',
    full_ddd: '完整 DDD',
    ui_only: 'UI',
    tech_refactor: '技术重构',
    qa_only: '仅测试',
    release_only: '仅发布',
  };

  const STATUS_MAP = {
    draft: '草稿',
    in_progress: '进行中',
    blocked: '已阻塞',
    completed: '已完成',
    cancelled: '已取消',
    archived: '已归档',
  };

  const STAGE_STATUS_MAP = {
    not_started: '未开始',
    in_progress: '进行中',
    submitted: '已提交',
    validated: '已验证',
    completed: '已完成',
    blocked: '已阻塞',
    needs_revision: '需修改',
    skipped: '已跳过',
  };

  const STAGE_NAME_MAP = {
    product_requirement: '产品需求',
    ux_design: '交互设计',
    domain_review: '领域评审',
    engineering_design: '工程设计',
    qa_validation: 'QA 验证',
  };

  const ROLE_NAME_MAP = {
    'product-manager': '产品经理',
    'ux-designer': 'UX 设计师',
    'domain-architect': '领域架构师',
    'engineer': '工程师',
    'qa': 'QA',
    'platform-devops': '平台运维',
    'domain-expert': '领域专家',
  };

  const ARTIFACT_TYPE_MAP = {
    crud_spec_card: 'CRUD 规格卡',
    product_requirement_card: '产品需求卡',
    ux_interaction_card: '交互设计卡',
    ddd_applicability_review: 'DDD 适用性评审',
    engineering_plan: '工程方案',
    qa_test_plan: '测试方案',
    release_checklist: '发布清单',
    user_stories: '用户故事',
    acceptance_criteria: '验收标准',
    business_rules: '业务规则',
    ubiquitous_language: '统一语言',
    state_action_matrix: '状态动作矩阵',
    lightweight_domain_model: '轻量领域模型',
    bounded_context: '限界上下文',
    aggregate_design: '聚合设计',
    domain_events: '领域事件',
    api_contract: '接口契约',
    ubiquitous_language_code_map: '业务统一语言·代码映射',
    technical_architecture: '技术架构文档',
  };

  const PUBLIC_DOCUMENT_TYPES = ['ubiquitous_language_code_map', 'technical_architecture'];

  const GATE_RESULT_MAP = {
    passed: '通过',
    failed: '未通过',
    warning: '警告',
    manual_review_required: '待人工审核',
  };

  // ==================== 工具函数 ====================

  /** 格式化 ISO 时间为友好显示 */
  function formatTime(iso) {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return iso;
    }
  }

  /** 简易 HTML 转义 */
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 获取状态对应的 badge class */
  function statusBadgeClass(status) {
    const map = {
      completed: 'badge-success',
      validated: 'badge-success',
      passed: 'badge-success',
      in_progress: 'badge-primary',
      submitted: 'badge-primary',
      draft: 'badge-muted',
      not_started: 'badge-muted',
      skipped: 'badge-muted',
      manual_review_required: 'badge-muted',
      warning: 'badge-warning',
      blocked: 'badge-danger',
      failed: 'badge-danger',
      needs_revision: 'badge-warning',
      cancelled: 'badge-muted',
      archived: 'badge-muted',
      open: 'badge-warning',
      answered: 'badge-success',
      resolved: 'badge-success',
    };
    return map[status] || 'badge-muted';
  }

  /** 阶段名称翻译 */
  function stageDisplayName(name) {
    return STAGE_NAME_MAP[name] || name;
  }

  /** 角色名称翻译 */
  function roleName(role) {
    return ROLE_NAME_MAP[role] || role;
  }

  /** 该阶段的负责人（团队名册中认领该角色的成员），未配置/无人认领返回空数组 */
  function stageAssignees(role) {
    const team = state.teamData;
    if (!team || !team.configured || !team.members || team.members.length === 0) return [];
    return team.members.filter((m) => (m.roles || []).includes(role));
  }

  /** 当前操作人是否负责该角色 */
  function currentUserOwnsRole(role) {
    const user = state.userData;
    return !!(user && user.configured && (user.roles || []).includes(role));
  }

  /** 该阶段负责人 HTML：有认领显示成员名（当前人加"当前"徽章），否则弱化"未指派" */
  function stageAssigneeHtml(role) {
    const assignees = stageAssignees(role);
    if (assignees.length === 0) {
      // 团队未配置但当前人已认领该角色：提示当前人负责
      if (currentUserOwnsRole(role) && state.userData && state.userData.user) {
        const me = state.userData.user;
        return '<span class="stage-assignee stage-assignee-me">'
          + '<span class="stage-assignee-badge">当前</span>'
          + esc(me.name || me.email)
          + '</span>';
      }
      return '<span class="stage-assignee stage-assignee-empty">未指派</span>';
    }
    const currentUserEmail = (state.userData && state.userData.configured && state.userData.user)
      ? state.userData.user.email
      : null;
    return assignees.map((m) => {
      const isMe = currentUserEmail && m.email
        && m.email.toLowerCase() === String(currentUserEmail).toLowerCase();
      return '<span class="stage-assignee' + (isMe ? ' stage-assignee-me' : '') + '">'
        + (isMe ? '<span class="stage-assignee-badge">当前</span>' : '')
        + esc(m.name || m.email)
        + '</span>';
    }).join('');
  }

  /** 交付物类型翻译 */
  function artifactTypeName(type) {
    return ARTIFACT_TYPE_MAP[type] || type;
  }

  // ==================== 极简 Markdown 渲染 ====================

  /**
   * 简易 Markdown → HTML 转换
   * 支持：标题、粗体、斜体、行内代码、代码块、列表、表格、链接、引用、水平线
   * 不引入第三方库，满足看板展示需求
   */
  function renderMarkdown(md) {
    if (!md) return '<p class="text-muted">暂无内容</p>';

    let html = md;

    // 代码块（先提取，避免内部被解析）
    const codeBlocks = [];
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      const idx = codeBlocks.length;
      codeBlocks.push('<pre><code class="lang-' + esc(lang) + '">' + esc(code.trimEnd()) + '</code></pre>');
      return '\x00CB' + idx + '\x00';
    });

    // 行内代码
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // 表格（逐行处理）
    html = html.replace(/^((?:\|.+\|\n)+)/gm, function (tableBlock) {
      const lines = tableBlock.trim().split('\n');
      if (lines.length < 2) return tableBlock;

      const parseRow = (line) =>
        line.split('|').slice(1, -1).map((c) => c.trim());

      const headerCells = parseRow(lines[0]);
      // 检查分隔行
      const sepIdx = lines.findIndex((l) => /^\|[\s\-:|]+\|$/.test(l));
      const dataStart = sepIdx >= 0 ? sepIdx + 1 : 1;

      let out = '<table><thead><tr>';
      headerCells.forEach((c) => {
        out += '<th>' + inlineMarkdown(c) + '</th>';
      });
      out += '</tr></thead><tbody>';
      for (let i = dataStart; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cells = parseRow(lines[i]);
        out += '<tr>';
        cells.forEach((c) => {
          out += '<td>' + inlineMarkdown(c) + '</td>';
        });
        out += '</tr>';
      }
      out += '</tbody></table>';
      return out;
    });

    // 标题
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // 水平线
    html = html.replace(/^---+$/gm, '<hr>');

    // 引用
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // 无序列表
    html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // 有序列表
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    // 避免重复包裹：仅处理不在 <ul> 内的连续 <li>
    html = html.replace(/(?<!<\/ul>)((?:<li>.*<\/li>\n?)+)(?!<\/ul>)/g, function (match) {
      if (match.startsWith('<ul>')) return match;
      return '<ol>' + match + '</ol>';
    });

    // 行内格式
    html = inlineMarkdown(html);

    // 段落：连续非标签行包裹 <p>
    html = html
      .split('\n\n')
      .map((block) => {
        block = block.trim();
        if (!block) return '';
        // 已经是块级元素则跳过
        if (/^<(h[1-6]|ul|ol|li|table|pre|blockquote|hr|div)/.test(block)) return block;
        // 多行文本包裹
        if (block.includes('\n') && !block.startsWith('<')) {
          return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
        }
        return '<p>' + block + '</p>';
      })
      .join('\n');

    // 还原代码块
    html = html.replace(/\x00CB(\d+)\x00/g, (_, idx) => codeBlocks[parseInt(idx)]);

    return html;
  }

  /** 行内 Markdown 处理 */
  function inlineMarkdown(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  // ==================== API 请求 ====================

  async function apiFetch(path) {
    const url = API_BASE + path;
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error('HTTP ' + resp.status + ': ' + (text || resp.statusText));
    }
    return resp.json();
  }

  // ==================== 应用状态 ====================

  const state = {
    currentView: 'list', // 'list' | 'detail' | 'documents'
    currentTaskId: null,
    taskList: [],
    taskDetail: null,
    documents: [],
    artifactCache: {}, // artifactId → markdown content
    teamData: null, // { configured, members, role_labels, updated_at }
    userData: null, // { configured, user, roles, role_labels, in_team, team_configured }
  };

  // ==================== DOM 引用 ====================

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    viewList: $('#view-list'),
    viewDetail: $('#view-detail'),
    viewDocuments: $('#view-documents'),
    viewTabs: $('#view-tabs'),
    headerBrand: $('#header-brand'),
    headerTeam: $('#header-team'),
    headerStatus: $('#header-status'),
    teamBanner: $('#team-banner'),
    teamBannerMsg: $('#team-banner-msg'),
    taskCount: $('#task-count'),
    listLoading: $('#list-loading'),
    listError: $('#list-error'),
    listErrorMsg: $('#list-error-msg'),
    listEmpty: $('#list-empty'),
    detailLoading: $('#detail-loading'),
    detailError: $('#detail-error'),
    detailErrorMsg: $('#detail-error-msg'),
    detailContent: $('#detail-content'),
    documentsCount: $('#documents-count'),
    documentsLoading: $('#documents-loading'),
    documentsError: $('#documents-error'),
    documentsErrorMsg: $('#documents-error-msg'),
    documentsEmpty: $('#documents-empty'),
    documentsList: $('#documents-list'),
  };

  // ==================== 视图切换 ====================

  function showView(name) {
    state.currentView = name;
    dom.viewList.classList.toggle('active', name === 'list');
    dom.viewDetail.classList.toggle('active', name === 'detail');
    dom.viewDocuments.classList.toggle('active', name === 'documents');

    // 标签栏在列表 / 公共文档视图显示
    if (dom.viewTabs) {
      dom.viewTabs.style.display = (name === 'list' || name === 'documents') ? 'flex' : 'none';
    }
    // 高亮当前标签
    dom.viewTabs.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === name);
    });
  }

  function showLoading(view) {
    if (view === 'list') {
      dom.listLoading.classList.remove('hidden');
      dom.listError.classList.add('hidden');
      dom.listEmpty.classList.add('hidden');
    } else if (view === 'documents') {
      dom.documentsLoading.classList.remove('hidden');
      dom.documentsError.classList.add('hidden');
      dom.documentsEmpty.classList.add('hidden');
    } else {
      dom.detailLoading.classList.remove('hidden');
      dom.detailError.classList.add('hidden');
      dom.detailContent.classList.add('hidden');
    }
  }

  function showError(view, msg) {
    if (view === 'list') {
      dom.listLoading.classList.add('hidden');
      dom.listError.classList.remove('hidden');
      dom.listErrorMsg.textContent = msg;
      dom.listEmpty.classList.add('hidden');
    } else if (view === 'documents') {
      dom.documentsLoading.classList.add('hidden');
      dom.documentsError.classList.remove('hidden');
      dom.documentsErrorMsg.textContent = msg;
      dom.documentsEmpty.classList.add('hidden');
    } else {
      dom.detailLoading.classList.add('hidden');
      dom.detailError.classList.remove('hidden');
      dom.detailErrorMsg.textContent = msg;
      dom.detailContent.classList.add('hidden');
    }
  }

  function showEmpty() {
    dom.listLoading.classList.add('hidden');
    dom.listError.classList.add('hidden');
    dom.listEmpty.classList.remove('hidden');
  }

  // ==================== 团队 & 用户配置 ====================

  async function loadTeamAndUser() {
    // 并行拉取团队与用户配置，任一失败不影响另一个
    const [teamResult, userResult] = await Promise.allSettled([
      apiFetch('/team'),
      apiFetch('/user'),
    ]);

    if (teamResult.status === 'fulfilled') {
      state.teamData = teamResult.value;
    }
    if (userResult.status === 'fulfilled') {
      state.userData = userResult.value;
    }

    renderTeamHeader();
    renderTeamBanner();

    // 团队/用户数据到达后，若详情已渲染则重绘阶段进度（补上负责人信息）
    if (state.currentTaskId && state.taskDetail) {
      renderStageProgress(state.taskDetail.stages, state.taskDetail.task.current_stage);
    }
  }

  function renderTeamHeader() {
    const container = dom.headerTeam;
    if (!container) return;

    const team = state.teamData;
    const user = state.userData;
    const roleLabels = (team && team.role_labels) || (user && user.role_labels) || {};

    // 无团队数据且无用户数据 → 清空
    if ((!team || !team.configured || !team.members || team.members.length === 0)
        && (!user || !user.configured)) {
      container.innerHTML = '';
      return;
    }

    const members = (team && team.configured) ? (team.members || []) : [];
    const currentUserEmail = (user && user.configured && user.user) ? user.user.email : null;
    const currentUserRoles = (user && user.configured) ? (user.roles || []) : [];

    // 找到当前用户在团队名册中的记录
    let currentMember = null;
    let otherMembers = members;
    if (currentUserEmail) {
      const idx = members.findIndex((m) => m.email === currentUserEmail);
      if (idx >= 0) {
        currentMember = members[idx];
        otherMembers = members.filter((_, i) => i !== idx);
      }
    }

    let html = '';

    // 1. 当前操作人（最前，显著）
    if (user && user.configured && user.user) {
      const name = user.user.name || currentUserEmail || '未知';
      const email = user.user.email || '';
      // 优先用 user API 返回的角色，若无则用团队名册中匹配到的
      const roles = currentUserRoles.length > 0
        ? currentUserRoles
        : (currentMember ? (currentMember.roles || []) : []);
      const rolesHtml = roles
        .map((r) => '<span class="team-role-tag">' + esc(roleLabels[r] || r) + '</span>')
        .join('');

      html += '<span class="team-member team-member-current">'
        + '<span class="team-current-badge">当前</span>'
        + '<span class="team-member-name">' + esc(name) + '</span>'
        + (email ? '<span class="team-member-email">&lt;' + esc(email) + '&gt;</span>' : '')
        + (rolesHtml ? '<span class="team-member-roles">' + rolesHtml + '</span>' : '')
        + '</span>';
    }

    // 2. 其他团队成员
    otherMembers.forEach((m) => {
      const roles = (m.roles || [])
        .map((r) => '<span class="team-role-tag">' + esc(roleLabels[r] || r) + '</span>')
        .join('');

      html += '<span class="team-member">'
        + '<span class="team-member-name">' + esc(m.name) + '</span>'
        + (m.email ? '<span class="team-member-email">&lt;' + esc(m.email) + '&gt;</span>' : '')
        + (roles ? '<span class="team-member-roles">' + roles + '</span>' : '')
        + '</span>';
    });

    // 3. 未配置当前人的弱化提示
    if (user && !user.configured) {
      html += '<span class="team-user-hint">尚未设置当前人（user.set）</span>';
    }

    container.innerHTML = html;
  }

  function renderTeamBanner() {
    const banner = dom.teamBanner;
    const msgEl = dom.teamBannerMsg;
    if (!banner || !msgEl) return;

    const user = state.userData;
    const team = state.teamData;

    const userOk = user && user.configured;
    const teamOk = team && team.configured;

    if (userOk && teamOk) {
      banner.classList.add('hidden');
      return;
    }

    // 构建提示文案
    const parts = [];
    if (!userOk) parts.push('user.set（当前人姓名/邮箱）');
    if (!teamOk) parts.push('team.set（团队名册）');

    msgEl.textContent = '请通过 MCP 调用 ' + parts.join(' 与 ') + ' 后再创建任务。';
    banner.classList.remove('hidden');
  }

  // ==================== 任务列表 ====================

  async function loadTaskList() {
    showLoading('list');
    try {
      const data = await apiFetch('/tasks');
      const tasks = data.tasks || [];
      state.taskList = tasks;
      dom.taskCount.textContent = tasks.length + ' 个任务';
      renderTaskList(tasks);
    } catch (err) {
      showError('list', '加载任务列表失败：' + err.message);
    }
  }

  function renderTaskList(tasks) {
    // 清空现有卡片（保留 loading/error/empty 节点）
    const container = dom.viewList.querySelector('.task-list');
    container.querySelectorAll('.task-card').forEach((el) => el.remove());

    if (tasks.length === 0) {
      showEmpty();
      return;
    }

    dom.listLoading.classList.add('hidden');
    dom.listError.classList.add('hidden');
    dom.listEmpty.classList.add('hidden');

    // 按创建时间倒序
    tasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    tasks.forEach((task) => {
      const card = document.createElement('div');
      card.className = 'task-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.onclick = () => navigateToDetail(task.task_id);
      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigateToDetail(task.task_id);
        }
      };

      const completed = task.completed_stages || 0;
      const total = task.total_stages || 1;
      const pct = Math.round((completed / total) * 100);
      const progressClass = pct >= 100 ? 'complete' : '';

      card.innerHTML = `
        <div class="task-card-top">
          <span class="task-card-title">${esc(task.title)}</span>
          <span class="badge ${statusBadgeClass(task.status)}">${STATUS_MAP[task.status] || task.status}</span>
        </div>
        <div class="task-card-meta">
          <span class="meta-item">
            <span class="meta-label">ID</span>
            <span class="mono">${esc(task.task_id)}</span>
          </span>
          <span class="meta-item">
            <span class="meta-label">类型</span>
            <span>${esc(TASK_TYPE_MAP[task.task_type] || task.task_type)}</span>
          </span>
          <span class="meta-item">
            <span class="meta-label">当前阶段</span>
            <span>${esc(stageDisplayName(task.current_stage))}</span>
          </span>
          <span class="meta-item">
            <span class="meta-label">更新</span>
            <span>${formatTime(task.updated_at)}</span>
          </span>
        </div>
        <div class="task-card-progress">
          <div class="progress-bar">
            <div class="progress-bar-fill ${progressClass}" style="width:${pct}%"></div>
          </div>
          <span class="progress-text">${completed}/${total}</span>
        </div>
      `;

      container.appendChild(card);
    });
  }

  // ==================== 公共文档 ====================

  async function loadDocuments() {
    showLoading('documents');
    try {
      const data = await apiFetch('/documents');
      const docs = data.documents || [];
      state.documents = docs;
      dom.documentsCount.textContent = docs.length + ' 篇文档';
      renderDocuments(docs);
    } catch (err) {
      showError('documents', '加载公共文档失败：' + err.message);
    }
  }

  function renderDocuments(docs) {
    const container = dom.documentsList;
    // 清空现有卡片（保留 loading/error/empty 节点）
    container.querySelectorAll('.doc-group').forEach((el) => el.remove());

    if (docs.length === 0) {
      dom.documentsLoading.classList.add('hidden');
      dom.documentsError.classList.add('hidden');
      dom.documentsEmpty.classList.remove('hidden');
      return;
    }

    dom.documentsLoading.classList.add('hidden');
    dom.documentsError.classList.add('hidden');
    dom.documentsEmpty.classList.add('hidden');

    // 按类型分组（公共文档类型优先，其余排后）
    const groups = {};
    docs.forEach((d) => {
      const type = d.artifact_type || 'other';
      (groups[type] = groups[type] || []).push(d);
    });

    const typeOrder = Object.keys(groups).sort((a, b) => {
      const ia = PUBLIC_DOCUMENT_TYPES.indexOf(a);
      const ib = PUBLIC_DOCUMENT_TYPES.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    let html = '';
    typeOrder.forEach((type) => {
      const typeName = artifactTypeName(type);
      const items = groups[type];

      html += '<div class="doc-group">';
      html += '<div class="doc-group-header">'
        + '<h3 class="doc-group-title">' + esc(typeName) + '</h3>'
        + '<span class="doc-group-count">' + items.length + ' 篇</span>'
        + '</div>';

      items.forEach((d) => {
        const statusBadge = d.status
          ? '<span class="badge ' + statusBadgeClass(d.status) + '">' + esc(d.status) + '</span>'
          : '';

        html += `
          <div class="doc-card" data-artifact-id="${esc(d.artifact_id)}" data-task-id="${esc(d.task_id)}">
            <div class="doc-card-header" role="button" tabindex="0" onclick="App.togglePublicDocument(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.togglePublicDocument(this);}">
              <svg class="doc-expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <div class="doc-card-main">
                <div class="doc-card-title-row">
                  <span class="doc-card-title">${esc(d.title)}</span>
                  ${statusBadge}
                </div>
                <div class="doc-card-meta">
                  <span class="doc-card-task" title="${esc(d.task_id)}">所属任务：${esc(d.task_title || d.task_id)}</span>
                  <span>版本：<span class="mono">v${esc(d.version)}</span></span>
                  <span>更新：${formatTime(d.updated_at)}</span>
                </div>
              </div>
            </div>
            <div class="doc-body" id="doc-body-${esc(d.artifact_id)}">
              <div class="doc-loading">点击展开查看正文</div>
            </div>
          </div>
        `;
      });

      html += '</div>';
    });

    container.insertAdjacentHTML('beforeend', html);
  }

  async function loadPublicDocumentContent(taskId, artifactId) {
    const bodyEl = document.getElementById('doc-body-' + artifactId);
    if (!bodyEl) return;

    // 检查缓存
    if (state.artifactCache[artifactId]) {
      bodyEl.innerHTML = '<div class="markdown-body">' + renderMarkdown(state.artifactCache[artifactId]) + '</div>';
      return;
    }

    bodyEl.innerHTML = '<div class="doc-loading"><div class="spinner" style="width:20px;height:20px;border-width:2px"></div> 加载中...</div>';

    try {
      const data = await apiFetch('/tasks/' + encodeURIComponent(taskId) + '/artifacts/' + encodeURIComponent(artifactId));
      const content = data.content || '';
      state.artifactCache[artifactId] = content;
      bodyEl.innerHTML = '<div class="markdown-body">' + renderMarkdown(content) + '</div>';
    } catch (err) {
      bodyEl.innerHTML = '<div class="doc-loading" style="color:var(--color-danger)">加载失败：' + esc(err.message) + '</div>';
    }
  }

  // ==================== 任务详情 ====================

  async function loadTaskDetail() {
    if (!state.currentTaskId) return;
    showLoading('detail');
    try {
      const data = await apiFetch('/tasks/' + encodeURIComponent(state.currentTaskId));
      state.taskDetail = data;
      renderTaskDetail(data);
    } catch (err) {
      showError('detail', '加载任务详情失败：' + err.message);
    }
  }

  function renderTaskDetail(data) {
    dom.detailLoading.classList.add('hidden');
    dom.detailError.classList.add('hidden');
    dom.detailContent.classList.remove('hidden');

    const { task, stages, artifacts, open_questions, gate_summary } = data;

    // 基本信息
    $('#detail-title').textContent = task.title;
    $('#detail-status').textContent = STATUS_MAP[task.status] || task.status;
    $('#detail-status').className = 'badge ' + statusBadgeClass(task.status);
    $('#detail-desc').textContent = task.description || '暂无描述';
    $('#detail-id').textContent = task.task_id;
    $('#detail-type').textContent = TASK_TYPE_MAP[task.task_type] || task.task_type;
    $('#detail-created').textContent = formatTime(task.created_at);
    $('#detail-updated').textContent = formatTime(task.updated_at);

    // 阶段进度
    renderStageProgress(stages, task.current_stage);

    // 门禁摘要
    renderGateSummary(gate_summary, stages);

    // 交付物
    renderArtifacts(artifacts);

    // 问题
    renderQuestions(open_questions);

    // 共享上下文（先隐藏内容，异步加载）
    if (task.status === 'completed') {
      $('#card-delivery').classList.remove('hidden');
    } else {
      $('#card-delivery').classList.add('hidden');
    }
    loadContextContent(state.currentTaskId);
  }

  // ==================== 阶段进度 ====================

  function renderStageProgress(stages, currentStage) {
    const container = $('#stage-progress');
    if (!stages || stages.length === 0) {
      container.innerHTML = '<p style="color:var(--color-text-muted)">暂无阶段数据</p>';
      return;
    }

    let html = '';
    stages.forEach((s, idx) => {
      const isCurrent = s.stage === currentStage;
      let stepClass = '';
      if (s.status === 'completed') stepClass = 'completed';
      else if (isCurrent) stepClass = 'current';
      else if (s.status === 'blocked') stepClass = 'blocked';
      else if (s.status === 'in_progress') stepClass = 'in_progress';

      const statusLabel = STAGE_STATUS_MAP[s.status] || s.status;
      const icon = s.status === 'completed' ? '&#10003;' : (idx + 1);

      html += `
        <div class="stage-step ${stepClass}">
          <div class="stage-dot">${icon}</div>
          <div class="stage-info">
            <div class="stage-name">${esc(stageDisplayName(s.stage))}</div>
            <div class="stage-role">${esc(roleName(s.role))}</div>
            <div class="stage-assignee-row">${stageAssigneeHtml(s.role)}</div>
            <div class="stage-status-label">${statusLabel}</div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  // ==================== 门禁摘要 ====================

  function renderGateSummary(gateSummary, stages) {
    const card = $('#card-gates');
    const container = $('#gate-grid');

    if (!gateSummary || Object.keys(gateSummary).length === 0) {
      card.classList.add('hidden');
      return;
    }

    card.classList.remove('hidden');
    let html = '';

    Object.entries(gateSummary).forEach(([stageName, gate]) => {
      const result = gate.result || 'unknown';
      const badgeClass = statusBadgeClass(result);
      const label = GATE_RESULT_MAP[result] || result;

      html += `
        <div class="gate-item">
          <span class="gate-stage-name">${esc(stageDisplayName(stageName))}</span>
          <span class="badge ${badgeClass}">${label}</span>
          <span class="gate-score">${gate.score != null ? gate.score + '分' : '-'}</span>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  // ==================== 交付物 ====================

  function renderArtifacts(artifacts) {
    const card = $('#card-artifacts');
    const container = $('#artifact-list');

    if (!artifacts || artifacts.length === 0) {
      card.classList.add('hidden');
      return;
    }

    card.classList.remove('hidden');
    let html = '';

    artifacts.forEach((a) => {
      const badgeClass = statusBadgeClass(a.status);
      const typeName = artifactTypeName(a.artifact_type);

      html += `
        <div class="artifact-item" data-artifact-id="${esc(a.artifact_id)}">
          <div class="artifact-header" onclick="App.toggleArtifact(this)">
            <svg class="artifact-expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span class="artifact-type">${esc(typeName)}</span>
            <div class="artifact-meta-right">
              <span class="badge ${badgeClass}">${a.status}</span>
              <span class="artifact-version">v${a.version}</span>
              <span>${esc(a.submitted_by || a.role || '')}</span>
            </div>
          </div>
          <div class="artifact-body" id="artifact-body-${esc(a.artifact_id)}">
            <div class="artifact-loading">点击加载内容...</div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  async function loadArtifactContent(taskId, artifactId) {
    const bodyEl = document.getElementById('artifact-body-' + artifactId);
    if (!bodyEl) return;

    // 检查缓存
    if (state.artifactCache[artifactId]) {
      bodyEl.innerHTML = '<div class="markdown-body">' + renderMarkdown(state.artifactCache[artifactId]) + '</div>';
      return;
    }

    bodyEl.innerHTML = '<div class="artifact-loading"><div class="spinner" style="width:20px;height:20px;border-width:2px"></div> 加载中...</div>';

    try {
      const data = await apiFetch('/tasks/' + encodeURIComponent(taskId) + '/artifacts/' + encodeURIComponent(artifactId));
      const content = data.content || '';
      state.artifactCache[artifactId] = content;
      bodyEl.innerHTML = '<div class="markdown-body">' + renderMarkdown(content) + '</div>';
    } catch (err) {
      bodyEl.innerHTML = '<div class="artifact-loading" style="color:var(--color-danger)">加载失败：' + esc(err.message) + '</div>';
    }
  }

  // ==================== 问题 ====================

  function renderQuestions(questions) {
    const card = $('#card-questions');
    const container = $('#question-list');

    if (!questions || questions.length === 0) {
      card.classList.add('hidden');
      return;
    }

    card.classList.remove('hidden');
    let html = '';

    questions.forEach((q) => {
      const statusBadge = `<span class="badge ${statusBadgeClass(q.status)}">${q.status}</span>`;
      const blocks = q.blocks_stage ? `<span>阻塞阶段：${esc(stageDisplayName(q.blocks_stage))}</span>` : '';

      html += `
        <div class="question-item">
          <div class="question-text">${esc(q.question)}</div>
          <div class="question-meta">
            ${statusBadge}
            <span>提出人：${esc(q.raised_by)}</span>
            <span>指派：${esc(roleName(q.assigned_to_role))}</span>
            ${blocks}
            <span>${formatTime(q.created_at)}</span>
          </div>
          ${q.answer ? '<div class="question-answer"><strong>回答：</strong>' + esc(q.answer) + (q.resolved_by ? ' <span style="color:var(--color-text-muted)">— ' + esc(q.resolved_by) + '</span>' : '') + '</div>' : ''}
        </div>
      `;
    });

    container.innerHTML = html;
  }

  // ==================== 共享上下文 ====================

  async function loadContextContent(taskId) {
    const card = $('#card-context');
    const contentEl = $('#context-content');
    const bodyEl = $('#context-body');

    card.classList.remove('hidden');
    bodyEl.classList.remove('expanded');
    bodyEl.style.maxHeight = '0';
    $('#btn-toggle-context').textContent = '展开';
    contentEl.innerHTML = '<div style="color:var(--color-text-muted);padding:var(--space-md)">加载中...</div>';

    try {
      const data = await apiFetch('/tasks/' + encodeURIComponent(taskId) + '/context');
      const content = data.content || '';
      contentEl.innerHTML = '<div class="markdown-body">' + renderMarkdown(content) + '</div>';
    } catch (err) {
      contentEl.innerHTML = '<div style="color:var(--color-danger);padding:var(--space-md)">加载失败：' + esc(err.message) + '</div>';
    }
  }

  function toggleContext() {
    const body = $('#context-body');
    const btn = $('#btn-toggle-context');
    const isExpanded = body.classList.contains('expanded');

    if (isExpanded) {
      body.classList.remove('expanded');
      body.style.maxHeight = '0';
      btn.textContent = '展开';
    } else {
      body.classList.add('expanded');
      body.style.maxHeight = '2000px';
      btn.textContent = '收起';
    }
  }

  // ==================== 交付包 ====================

  async function loadDeliveryPackage() {
    const taskId = state.currentTaskId;
    if (!taskId) return;

    const btn = $('#btn-view-delivery');
    const contentEl = $('#delivery-content');
    const mdEl = $('#delivery-markdown');

    btn.disabled = true;
    btn.textContent = '加载中...';

    try {
      const data = await apiFetch('/tasks/' + encodeURIComponent(taskId) + '/delivery_package');
      const content = data.content || '';
      mdEl.innerHTML = '<div class="markdown-body">' + renderMarkdown(content) + '</div>';
      contentEl.classList.remove('hidden');
      btn.textContent = '已加载';
    } catch (err) {
      if (err.message.includes('404')) {
        btn.textContent = '交付包尚未生成';
      } else {
        btn.textContent = '加载失败';
      }
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = '查看交付包';
      }, 3000);
    }
  }

  // ==================== 路由 ====================

  function parseHash() {
    const hash = location.hash || '#/';
    if (hash === '#/documents') {
      return { view: 'documents', taskId: null };
    }
    const match = hash.match(/^#\/tasks\/(.+)$/);
    if (match) {
      return { view: 'detail', taskId: decodeURIComponent(match[1]) };
    }
    return { view: 'list', taskId: null };
  }

  function navigateToDetail(taskId) {
    location.hash = '#/tasks/' + encodeURIComponent(taskId);
  }

  function navigateToList() {
    location.hash = '#/';
  }

  function navigateToDocuments() {
    location.hash = '#/documents';
  }

  function handleRoute() {
    const route = parseHash();

    if (route.view === 'detail' && route.taskId) {
      state.currentTaskId = route.taskId;
      showView('detail');
      loadTaskDetail();
    } else if (route.view === 'documents') {
      state.currentTaskId = null;
      state.taskDetail = null;
      showView('documents');
      loadDocuments();
    } else {
      state.currentTaskId = null;
      state.taskDetail = null;
      showView('list');
      loadTaskList();
    }
  }

  // ==================== 初始化 ====================

  function init() {
    // 品牌点击回到列表
    dom.headerBrand.addEventListener('click', navigateToList);

    // 监听 hash 变化
    window.addEventListener('hashchange', handleRoute);

    // 加载团队与用户配置（全局，只拉取一次）
    loadTeamAndUser();

    // 初始路由
    handleRoute();

    // 更新状态指示
    dom.headerStatus.innerHTML = '<span class="status-dot"></span> 已连接';
  }

  // ==================== 公开 API ====================

  window.App = {
    loadTaskList,
    loadTaskDetail,
    loadDocuments,
    loadTeamAndUser,
    navigateToList,
    navigateToDocuments,
    toggleContext,
    loadDeliveryPackage,
    refreshDetail() {
      if (!state.currentTaskId) return;
      const btn = document.getElementById('btn-refresh-detail');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '刷新中...';
      }
      loadTaskDetail().finally(() => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> 刷新';
        }
      });
    },
    toggleArtifact(headerEl) {
      const item = headerEl.closest('.artifact-item');
      const wasExpanded = item.classList.contains('expanded');

      // 折叠所有
      $$('.artifact-item.expanded').forEach((el) => el.classList.remove('expanded'));

      if (!wasExpanded) {
        item.classList.add('expanded');
        const artifactId = item.getAttribute('data-artifact-id');
        if (state.currentTaskId && artifactId) {
          loadArtifactContent(state.currentTaskId, artifactId);
        }
      }
    },
    togglePublicDocument(headerEl) {
      const card = headerEl.closest('.doc-card');
      const wasExpanded = card.classList.contains('expanded');

      // 同一分组内互斥展开
      card.closest('.doc-group').querySelectorAll('.doc-card.expanded').forEach((el) => {
        if (el !== card) el.classList.remove('expanded');
      });

      if (!wasExpanded) {
        card.classList.add('expanded');
        const artifactId = card.getAttribute('data-artifact-id');
        const taskId = card.getAttribute('data-task-id');
        if (taskId && artifactId) {
          loadPublicDocumentContent(taskId, artifactId);
        }
      } else {
        card.classList.remove('expanded');
      }
    },
  };

  // DOM 就绪后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
