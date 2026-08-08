<script setup lang="ts">
/**
 * 应用壳：header（品牌/团队/状态）+ 团队警告 banner + tab 导航 + 路由出口。
 * 行为与旧版 index.html + app.js renderTeamHeader/renderTeamBanner 保真一致。
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useTeamUser } from '@/composables/useTeamUser';

const route = useRoute();
const { team, user } = useTeamUser();

/** 详情页隐藏 tab 栏（旧 showView：仅 list/documents 显示） */
const showTabs = computed(() => route.name !== 'task-detail');

const roleLabels = computed(() => team.value?.role_labels ?? user.value?.role_labels ?? {});

/** 当前用户在团队名册中的记录（按邮箱精确匹配） */
const currentMember = computed(() => {
  const email = user.value?.configured ? user.value.user?.email : null;
  if (!email) return null;
  return (team.value?.members ?? []).find((m) => m.email === email) ?? null;
});

/** 团队区渲染数据：当前人 + 其他成员 */
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

/** 当前人角色：优先 user.roles，否则名册匹配成员的角色 */
function currentRoles(): string[] {
  if (user.value?.configured && user.value.roles.length > 0) return user.value.roles;
  return currentMember.value?.roles ?? [];
}

/** 团队警告 banner 文案（renderTeamBanner） */
const bannerMessage = computed(() => {
  const userOk = user.value?.configured;
  const teamOk = team.value?.configured;
  if (userOk && teamOk) return '';
  const parts: string[] = [];
  if (!userOk) parts.push('user.set（当前人姓名/邮箱）');
  if (!teamOk) parts.push('team.set（团队名册）');
  return '请通过 MCP 调用 ' + parts.join(' 与 ') + ' 后再创建任务。';
});
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <div class="header-brand" @click="$router.push('/')">
        <svg class="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        <h1 class="brand-title">AI 交付任务看板</h1>
      </div>
      <div class="header-team">
        <!-- 当前操作人 -->
        <span v-if="user?.configured" class="team-member team-member-current">
          <span class="team-current-badge">当前</span>
          <span class="team-member-name">{{ user.user?.name || user.user?.email || '未知' }}</span>
          <span v-if="user.user?.email" class="team-member-email">&lt;{{ user.user.email }}&gt;</span>
          <span v-if="currentRoles().length > 0" class="team-member-roles">
            <span
              v-for="r in currentRoles()"
              :key="r"
              class="team-role-tag"
            >{{ roleLabels[r] || r }}</span>
          </span>
        </span>
        <!-- 其他团队成员 -->
        <span
          v-for="m in headerMembers.others"
          :key="m.email"
          class="team-member"
        >
          <span class="team-member-name">{{ m.name }}</span>
          <span v-if="m.email" class="team-member-email">&lt;{{ m.email }}&gt;</span>
          <span v-if="(m.roles || []).length > 0" class="team-member-roles">
            <span
              v-for="r in m.roles || []"
              :key="r"
              class="team-role-tag"
            >{{ roleLabels[r] || r }}</span>
          </span>
        </span>
        <!-- 未配置当前人的弱化提示 -->
        <span v-if="user && !user.configured" class="team-user-hint">尚未设置当前人（user.set）</span>
      </div>
      <div class="header-status" v-if="user?.configured">
        <span class="status-dot"></span>
        {{ user.user?.name }}
      </div>
    </div>
  </header>

  <!-- 团队配置警告 banner -->
  <div v-if="bannerMessage" class="team-banner">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
    <span>{{ bannerMessage }}</span>
  </div>

  <main class="app-main">
    <nav v-if="showTabs" class="view-tabs">
      <RouterLink class="tab-btn" to="/" active-class="active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
        任务列表
      </RouterLink>
      <RouterLink class="tab-btn" to="/documents" active-class="active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
        </svg>
        公共文档
      </RouterLink>
    </nav>

    <RouterView />
  </main>

  <footer class="app-footer">
    <span>AI 交付任务看板</span>
  </footer>
</template>

<style scoped>
/* <a> 形态的 tab 按钮与旧版 <button> 视觉一致：去掉链接默认下划线 */
.view-tabs :deep(.tab-btn) {
  text-decoration: none;
}
</style>
