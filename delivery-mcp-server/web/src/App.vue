<script setup lang="ts">
/**
 * 应用壳：使用 makeit-admin-pro 的 Layout 组件。
 * 配置菜单（任务列表 / 公共文档）、团队/用户信息、路由出口。
 */
import { onMounted, computed, h } from 'vue';
import { Alert, Popover } from 'ant-design-vue';
import { useStoreMenu } from '@miitvip/admin-pro';
import { HomeOutlined, DashboardOutlined, FileTextOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons-vue';
import { useTeamUser } from '@/composables/useTeamUser';

const { team, user } = useTeamUser();
const menuStore = useStoreMenu();

// 头像下拉菜单：仅保留「个人设置」
// 注意：必须在 setup 阶段设置（Header 组件的 dropdownData 在 setup 时一次性捕获
// useMenu.dropdowns，onMounted 里设置太晚会回退到框架默认项）
menuStore.updateDropdownMenus([
  {
    name: 'settings',
    title: '个人设置',
    path: '/settings',
    icon: UserOutlined,
  },
]);

// 配置菜单项（Home 为默认落地页，排在首位）
onMounted(() => {
  menuStore.updateMenus([
    {
      name: 'home',
      path: '/',
      meta: {
        title: 'Home',
        icon: HomeOutlined,
      },
    },
    {
      name: 'tasks',
      path: '/tasks',
      meta: {
        title: '任务列表',
        icon: DashboardOutlined,
      },
    },
    {
      name: 'documents',
      path: '/documents',
      meta: {
        title: '公共文档',
        icon: FileTextOutlined,
      },
    },
  ]);
});

const roleLabels = computed(() => team.value?.role_labels ?? user.value?.role_labels ?? {});

const currentMember = computed(() => {
  const email = user.value?.configured ? user.value.user?.email : null;
  if (!email) return null;
  return (team.value?.members ?? []).find((m) => m.email === email) ?? null;
});

function currentRoles(): string[] {
  if (user.value?.configured && user.value.roles.length > 0) return user.value.roles;
  return currentMember.value?.roles ?? [];
}

const bannerMessage = computed(() => {
  const userOk = user.value?.configured;
  const teamOk = team.value?.configured;
  if (userOk && teamOk) return '';
  const parts: string[] = [];
  if (!userOk) parts.push('user.set（当前人姓名/邮箱）');
  if (!teamOk) parts.push('team.set（团队名册）');
  return '请通过 MCP 调用 ' + parts.join(' 与 ') + ' 后再创建任务。';
});

/** 团队成员弹层内容：全部成员（姓名 / 邮箱 / 角色标签），标记当前人 */
function renderTeamRoster() {
  const members = team.value?.configured ? team.value.members : [];
  const currentEmail = currentMember.value?.email;
  if (!team.value?.configured) {
    return h('div', { class: 'team-roster-empty' }, '尚未配置团队名册（team.set）');
  }
  return h(
    'div',
    { class: 'team-roster' },
    members.map((m) =>
      h('div', { class: 'team-roster-item', key: m.email }, [
        h('div', { class: 'team-roster-item-head' }, [
          h('span', { class: 'team-member-name' }, m.name),
          m.email ? h('span', { class: 'team-member-email' }, `<${m.email}>`) : null,
          m.email && m.email === currentEmail ? h('span', { class: 'team-current-badge' }, '当前') : null,
        ]),
        (m.roles || []).length > 0
          ? h('div', { class: 'team-roster-item-roles' }, m.roles.map((r) => h('span', { class: 'team-role-tag' }, roleLabels.value[r] || r)))
          : null,
      ]),
    ),
  );
}

/** 顶部右侧信息：仅当前用户 + 团队图标（点击弹出团队成员） */
const teamInfoExtra = computed(() => {
  return h('div', { class: 'header-team-info' }, [
    user.value?.configured
      ? h('span', { class: 'team-member team-member-current' }, [
          h('span', { class: 'team-member-name' }, user.value.user?.name || user.value.user?.email || '未知'),
          user.value.user?.email ? h('span', { class: 'team-member-email' }, `<${user.value.user.email}>`) : null,
          currentRoles().length > 0
            ? h('span', { class: 'team-member-roles' }, currentRoles().map((r) => h('span', { class: 'team-role-tag' }, roleLabels.value[r] || r)))
            : null,
        ])
      : h('span', { class: 'team-user-hint' }, '尚未设置当前人（user.set）'),
    h(
      Popover,
      {
        placement: 'bottomRight',
        trigger: 'click',
        overlayClassName: 'team-roster-popover',
        title: '团队成员',
        content: renderTeamRoster(),
        // 默认挂到 body 会脱离 .mi-theme-dark 容器，导致主题 CSS 变量不级联；
        // 让弹层渲染进带主题类的布局容器内，深/浅色文字颜色均正确。
        getPopupContainer: () =>
          (document.querySelector('.mi-theme-dark, .mi-theme-light') as HTMLElement | null) || document.body,
      },
      {
        default: () =>
          h(
            'button',
            { class: 'team-icon-btn', type: 'button', 'aria-label': '团队成员' },
            [h(TeamOutlined)],
          ),
      },
    ),
  ]);
});

const headerSetting = computed(() => ({
  extra: teamInfoExtra.value,
  // 隐藏右上角搜索框（保留头像下拉菜单，通过 updateDropdownMenus 配置单项）
  search: false,
}));
</script>

<template>
  <mi-layout :show-breadcrumbs="false" :header-setting="headerSetting">
    <!-- 侧边栏：默认渲染（logo + 菜单），不覆写 sider slot -->
    <!-- 主内容区 -->
    <template #content>
      <!-- 团队配置警告 banner -->
      <Alert
        v-if="bannerMessage"
        type="warning"
        show-icon
        :message="bannerMessage"
        style="margin-bottom: 16px"
      />
      <router-view />
    </template>
  </mi-layout>
</template>

<style scoped>
.header-team-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.team-member {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.team-member-current {
  font-weight: 500;
}
.team-current-badge {
  background: #1677ff;
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
}
.team-member-name {
  color: var(--color-text);
}
/* 邮箱用次级色而非 muted：浅色模式下更清晰，深色模式下仍可读 */
.team-member-email {
  color: var(--color-text-secondary);
}
/* 角色标签：跟随主题变量，浅色模式加深、深色模式提亮 */
.team-role-tag {
  background: var(--color-primary-bg);
  border: 1px solid var(--color-primary-border);
  color: var(--color-primary-light);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  margin-left: 4px;
  white-space: nowrap;
}
.team-user-hint {
  color: var(--color-text-secondary);
  font-size: 12px;
}
/* 团队图标按钮 */
.team-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  font-size: 16px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.team-icon-btn:hover {
  background: rgba(22, 119, 255, 0.1);
  color: #1677ff;
}
.team-icon-btn:focus-visible {
  outline: 2px solid rgba(22, 119, 255, 0.4);
  outline-offset: 1px;
}
</style>

<style>
/* 团队成员弹层（非 scoped，需穿透到 Popover 根） */
.team-roster-popover .ant-popover-inner {
  max-width: 320px;
}
.team-roster {
  display: flex;
  flex-direction: column;
  max-height: 320px;
  overflow-y: auto;
}
.team-roster-item {
  padding: 6px 4px;
  border-bottom: 1px solid var(--color-border);
}
.team-roster-item:last-child {
  border-bottom: none;
}
.team-roster-item-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.team-roster-item-roles {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.team-roster-empty {
  color: var(--color-text-secondary, #888);
  font-size: 12px;
  padding: 8px 4px;
}
/* 弹层内文字颜色显式跟随主题容器变量（getPopupContainer 已挂到 .mi-theme-dark/.mi-theme-light 内） */
.team-roster-popover .team-member-name {
  color: var(--color-text);
}
.team-roster-popover .team-member-email {
  color: var(--color-text-secondary);
}
</style>
