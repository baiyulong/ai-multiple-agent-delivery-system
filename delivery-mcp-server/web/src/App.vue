<script setup lang="ts">
/**
 * 应用壳：使用 makeit-admin-pro 的 Layout 组件。
 * 配置菜单（任务列表 / 公共文档）、团队/用户信息、路由出口。
 */
import { onMounted, computed, h } from 'vue';
import { Alert } from 'ant-design-vue';
import { useStoreMenu } from '@miitvip/admin-pro';
import { HomeOutlined, DashboardOutlined, FileTextOutlined, UserOutlined } from '@ant-design/icons-vue';
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

const headerMembers = computed(() => {
  const members = team.value?.configured ? team.value.members : [];
  if (!currentMember.value) {
    return { current: null, others: members };
  }
  return {
    current: currentMember.value,
    others: members.filter((m) => m !== currentMember.value),
  };
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

// 团队/用户信息渲染函数（用于 headerSetting.extra）
const teamInfoExtra = computed(() => {
  return h('div', { class: 'header-team-info' }, [
    user.value?.configured
      ? h('span', { class: 'team-member team-member-current' }, [
          h('span', { class: 'team-current-badge' }, '当前'),
          h('span', { class: 'team-member-name' }, user.value.user?.name || user.value.user?.email || '未知'),
          user.value.user?.email ? h('span', { class: 'team-member-email' }, `<${user.value.user.email}>`) : null,
          currentRoles().length > 0
            ? h('span', { class: 'team-member-roles' }, currentRoles().map((r) => h('span', { class: 'team-role-tag' }, roleLabels.value[r] || r)))
            : null,
        ])
      : null,
    ...headerMembers.value.others.map((m) =>
      h('span', { class: 'team-member', key: m.email }, [
        h('span', { class: 'team-member-name' }, m.name),
        m.email ? h('span', { class: 'team-member-email' }, `<${m.email}>`) : null,
        (m.roles || []).length > 0
          ? h('span', { class: 'team-member-roles' }, m.roles.map((r) => h('span', { class: 'team-role-tag' }, roleLabels.value[r] || r)))
          : null,
      ])
    ),
    user.value && !user.value.configured ? h('span', { class: 'team-user-hint' }, '尚未设置当前人（user.set）') : null,
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
.team-member-email {
  color: var(--color-text-muted);
}
.team-role-tag {
  background: rgba(96, 165, 250, 0.2);
  color: #93c5fd;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  margin-left: 4px;
}
.team-user-hint {
  color: var(--color-text-muted);
  font-size: 12px;
}
</style>
