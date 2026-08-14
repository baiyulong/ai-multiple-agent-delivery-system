<script setup lang="ts">
/**
 * Home 概览页：多 Agent 协作交付任务的概览门户。
 * 展示欢迎区、统计卡片、快速入口、最近更新任务简表。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Card, Row, Col, Statistic, Table, Tag, Spin, Button, Empty } from 'ant-design-vue';
import type { ColumnsType } from 'ant-design-vue/es/table';
import { api } from '@/api/api';
import { useTeamUser } from '@/composables/useTeamUser';
import { STATUS_MAP, TASK_TYPE_MAP } from '@/utils/constants';
import { formatTime, stageDisplayName } from '@/utils/helpers';
import { t } from '@/utils/i18n';
import type { TaskListItem, TaskStatus } from '@/api/types';

const router = useRouter();
const { user } = useTeamUser();

const loading = ref(true);
const errorMsg = ref('');
const taskList = ref<TaskListItem[]>([]);
const docCount = ref(0);

const userName = computed(() => {
  if (user.value?.configured && user.value.user?.name) {
    return user.value.user.name;
  }
  return '';
});

const stats = computed(() => {
  const all = taskList.value;
  const inProgress = all.filter((t) => t.status === 'in_progress').length;
  const completed = all.filter((t) => t.status === 'completed').length;
  const draft = all.filter((t) => t.status === 'draft').length;
  const blocked = all.filter((t) => t.status === 'blocked').length;
  return { total: all.length, inProgress, completed, draft, blocked, docs: docCount.value };
});

const recentTasks = computed(() => {
  return taskList.value
    .slice()
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8);
});

const statusColor = (status: TaskStatus): string => {
  const map: Record<string, string> = {
    completed: 'success',
    in_progress: 'processing',
    blocked: 'error',
    draft: 'default',
    cancelled: 'default',
    archived: 'default',
  };
  return map[status] || 'default';
};

const columns: ColumnsType<TaskListItem> = [
  {
    title: t('col.title'),
    dataIndex: 'title',
    key: 'title',
  },
  {
    title: t('col.status'),
    dataIndex: 'status',
    key: 'status',
    width: 100,
  },
  {
    title: t('col.type'),
    dataIndex: 'task_type',
    key: 'task_type',
    width: 120,
    customRender: ({ record }: { record: TaskListItem }) =>
      TASK_TYPE_MAP[record.task_type] || record.task_type,
  },
  {
    title: t('col.stage'),
    dataIndex: 'current_stage',
    key: 'current_stage',
    width: 120,
    customRender: ({ record }: { record: TaskListItem }) =>
      stageDisplayName(record.current_stage ?? ''),
  },
  {
    title: t('col.progress'),
    key: 'progress',
    width: 100,
    customRender: ({ record }: { record: TaskListItem }) => {
      const total = record.total_stages || 1;
      const pct = Math.round(((record.completed_stages || 0) / total) * 100);
      return `${record.completed_stages || 0}/${record.total_stages || 0} (${pct}%)`;
    },
  },
  {
    title: t('col.updatedAt'),
    dataIndex: 'updated_at',
    key: 'updated_at',
    width: 150,
    customRender: ({ record }: { record: TaskListItem }) =>
      formatTime(record.updated_at),
  },
];

function openDetail(taskId: string) {
  router.push({ name: 'task-detail', params: { id: taskId } });
}

function onRowClick(record: TaskListItem) {
  openDetail(record.task_id);
}

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const [taskData, docData] = await Promise.allSettled([
      api.listTasks(),
      api.listDocuments(),
    ]);
    if (taskData.status === 'fulfilled') {
      taskList.value = taskData.value.tasks ?? [];
    } else {
      errorMsg.value = t('home.loadTasksFailed') + (taskData.reason instanceof Error ? taskData.reason.message : String(taskData.reason));
    }
    if (docData.status === 'fulfilled') {
      docCount.value = (docData.value.documents ?? []).length;
    }
  } catch (err: unknown) {
    errorMsg.value = t('home.loadDataFailed') + (err instanceof Error ? err.message : String(err));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="home-view">
    <!-- 加载态 -->
    <div v-if="loading" class="home-loading">
      <Spin size="large" :tip="t('loading')" />
    </div>

    <!-- 错误态 -->
    <div v-else-if="errorMsg && taskList.length === 0" class="home-error">
      <p>{{ errorMsg }}</p>
      <Button type="primary" @click="load">{{ t('retry') }}</Button>
    </div>

    <!-- 正常内容 -->
    <template v-else>
      <!-- 欢迎区 -->
      <div class="home-welcome">
        <div class="home-welcome-text">
          <h1 class="home-title">
            <span class="home-logo-icon">
              <svg viewBox="0 0 40 40" width="36" height="36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="20" r="4.5" fill="#63ACFF" />
                <circle cx="20" cy="6" r="3" fill="#63ACFF" opacity="0.7" />
                <circle cx="32" cy="13" r="3" fill="#63ACFF" opacity="0.6" />
                <circle cx="32" cy="27" r="3" fill="#63ACFF" opacity="0.7" />
                <circle cx="20" cy="34" r="3" fill="#63ACFF" opacity="0.6" />
                <circle cx="8" cy="27" r="3" fill="#63ACFF" opacity="0.7" />
                <circle cx="8" cy="13" r="3" fill="#63ACFF" opacity="0.6" />
                <line x1="20" y1="20" x2="20" y2="9" stroke="#63ACFF" stroke-width="1.2" opacity="0.5" />
                <line x1="20" y1="20" x2="30" y2="14" stroke="#63ACFF" stroke-width="1.2" opacity="0.5" />
                <line x1="20" y1="20" x2="30" y2="26" stroke="#63ACFF" stroke-width="1.2" opacity="0.5" />
                <line x1="20" y1="20" x2="20" y2="31" stroke="#63ACFF" stroke-width="1.2" opacity="0.5" />
                <line x1="20" y1="20" x2="10" y2="26" stroke="#63ACFF" stroke-width="1.2" opacity="0.5" />
                <line x1="20" y1="20" x2="10" y2="14" stroke="#63ACFF" stroke-width="1.2" opacity="0.5" />
              </svg>
            </span>
            {{ t('home.title') }}
          </h1>
          <p class="home-subtitle" v-if="userName">{{ t('home.welcomeBack', { name: userName }) }}</p>
          <p class="home-subtitle" v-else>{{ t('home.subtitle') }}</p>
        </div>
      </div>

      <!-- 统计卡片 -->
      <Row :gutter="[16, 16]" class="home-stats">
        <Col :xs="12" :sm="8" :md="6">
          <Card class="stat-card stat-card-total" :bordered="false" :body-style="{ padding: '20px' }">
            <Statistic :title="t('home.statTotal')" :value="stats.total" :value-style="{ fontSize: '28px', fontWeight: 700 }" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card class="stat-card stat-card-progress" :bordered="false" :body-style="{ padding: '20px' }">
            <Statistic :title="t('home.statInProgress')" :value="stats.inProgress" :value-style="{ fontSize: '28px', fontWeight: 700, color: '#63ACFF' }" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card class="stat-card stat-card-done" :bordered="false" :body-style="{ padding: '20px' }">
            <Statistic :title="t('home.statCompleted')" :value="stats.completed" :value-style="{ fontSize: '28px', fontWeight: 700, color: '#52c41a' }" />
          </Card>
        </Col>
        <Col :xs="12" :sm="8" :md="6">
          <Card class="stat-card stat-card-docs" :bordered="false" :body-style="{ padding: '20px' }">
            <Statistic :title="t('home.statDocs')" :value="stats.docs" :value-style="{ fontSize: '28px', fontWeight: 700, color: '#b37feb' }" />
          </Card>
        </Col>
      </Row>

      <!-- 快速入口 -->
      <Row :gutter="[16, 16]" class="home-shortcuts">
        <Col :xs="24" :sm="12">
          <Card class="shortcut-card" :bordered="false" :body-style="{ padding: '0' }" hoverable>
            <div class="shortcut-inner" @click="router.push('/')">
              <div class="shortcut-icon shortcut-icon-tasks">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" />
                </svg>
              </div>
              <div class="shortcut-body">
                <div class="shortcut-label">{{ t('home.shortcutTasks') }}</div>
                <div class="shortcut-desc">{{ t('home.shortcutTasksDesc') }}</div>
              </div>
              <div class="shortcut-arrow">&rarr;</div>
            </div>
          </Card>
        </Col>
        <Col :xs="24" :sm="12">
          <Card class="shortcut-card" :bordered="false" :body-style="{ padding: '0' }" hoverable>
            <div class="shortcut-inner" @click="router.push('/documents')">
              <div class="shortcut-icon shortcut-icon-docs">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="8" y1="13" x2="16" y2="13" />
                  <line x1="8" y1="17" x2="16" y2="17" />
                  <line x1="8" y1="9" x2="10" y2="9" />
                </svg>
              </div>
              <div class="shortcut-body">
                <div class="shortcut-label">{{ t('home.shortcutDocs') }}</div>
                <div class="shortcut-desc">{{ t('home.shortcutDocsDesc') }}</div>
              </div>
              <div class="shortcut-arrow">&rarr;</div>
            </div>
          </Card>
        </Col>
      </Row>

      <!-- 最近更新任务 -->
      <Card :title="t('home.recentTitle')" :bordered="false" class="home-recent">
        <template #extra>
          <Button type="link" @click="router.push('/')">{{ t('home.viewAll') }}</Button>
        </template>

        <Table
          v-if="recentTasks.length > 0"
          :columns="columns"
          :data-source="recentTasks"
          :pagination="false"
          row-key="task_id"
          size="small"
          :custom-row="(record: TaskListItem) => ({
            onClick: () => onRowClick(record),
            style: { cursor: 'pointer' },
          })"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'title'">
              <a class="task-link">{{ record.title }}</a>
            </template>
            <template v-if="column.key === 'status'">
              <Tag :color="statusColor(record.status)">
                {{ STATUS_MAP[record.status] || record.status }}
              </Tag>
            </template>
          </template>
        </Table>

        <Empty v-else :description="t('home.noTasks')" />
      </Card>
    </template>
  </div>
</template>

<style scoped>
.home-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 加载 & 错误 */
.home-loading,
.home-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  gap: 16px;
}

.home-error {
  color: #ff4d4f;
}

/* 欢迎区 */
.home-welcome {
  padding: 32px 28px 24px;
  background: linear-gradient(135deg, rgba(99, 172, 255, 0.08) 0%, rgba(99, 172, 255, 0.02) 100%);
  border: 1px solid rgba(99, 172, 255, 0.12);
  border-radius: 12px;
}

.home-welcome-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.home-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
  line-height: 1.3;
}

.home-logo-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.home-subtitle {
  font-size: 14px;
  color: var(--color-text-muted);
  margin: 0;
  padding-left: 48px;
}

/* 统计卡片 */
.home-stats {
  /* gap handled by Row gutter */
}

.stat-card {
  border-radius: 10px;
  transition: box-shadow 0.25s ease, transform 0.25s ease;
}

.stat-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  transform: translateY(-2px);
}

.stat-card :deep(.ant-statistic-title) {
  font-size: 13px;
  color: var(--color-text-muted);
}

.stat-card-total {
  border-left: 3px solid var(--color-text-secondary);
}

.stat-card-progress {
  border-left: 3px solid #63ACFF;
}

.stat-card-done {
  border-left: 3px solid #52c41a;
}

.stat-card-docs {
  border-left: 3px solid #722ed1;
}

/* 快速入口 */
.shortcut-card {
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.25s ease, transform 0.25s ease;
}

.shortcut-card:hover {
  box-shadow: 0 6px 20px rgba(99, 172, 255, 0.12);
  transform: translateY(-2px);
}

.shortcut-inner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 24px;
}

.shortcut-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.shortcut-icon-tasks {
  background: rgba(99, 172, 255, 0.1);
  color: #63ACFF;
}

.shortcut-icon-docs {
  background: rgba(114, 46, 209, 0.08);
  color: #722ed1;
}

.shortcut-body {
  flex: 1;
  min-width: 0;
}

.shortcut-label {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 2px;
}

.shortcut-desc {
  font-size: 13px;
  color: var(--color-text-muted);
}

.shortcut-arrow {
  font-size: 20px;
  color: var(--color-text-muted);
  transition: color 0.2s ease, transform 0.2s ease;
  flex-shrink: 0;
}

.shortcut-card:hover .shortcut-arrow {
  color: #63ACFF;
  transform: translateX(3px);
}

/* 最近更新 */
.home-recent {
  border-radius: 10px;
}

.home-recent :deep(.ant-table-wrapper) .ant-table {
  cursor: pointer;
}

.task-link {
  color: var(--color-text);
  font-weight: 500;
  transition: color 0.2s ease;
}

.task-link:hover {
  color: #63ACFF;
}

/* "查看全部" link button — antd .ant-btn-link defaults to a dim blue
   (#1668dc ≈ rgb(22,104,220)) that is too dark on our dark bg. */
.home-recent :deep(.ant-btn-link) {
  color: #93c5fd;
}

.home-recent :deep(.ant-btn-link:hover) {
  color: #63ACFF;
}

/* 响应式 */
@media (max-width: 576px) {
  .home-welcome {
    padding: 24px 20px 18px;
  }

  .home-title {
    font-size: 20px;
  }

  .home-subtitle {
    padding-left: 0;
    margin-top: 4px;
  }

  .shortcut-inner {
    padding: 18px 16px;
  }

  .shortcut-icon {
    width: 40px;
    height: 40px;
  }

  .shortcut-icon svg {
    width: 22px;
    height: 22px;
  }
}
</style>
