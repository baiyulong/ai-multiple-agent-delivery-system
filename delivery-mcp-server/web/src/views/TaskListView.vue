<script setup lang="ts">
/**
 * 任务列表页：使用 Ant Design Vue Table 组件。
 * 支持范围/状态筛选、任务卡片、导出。
 */
import { computed, onMounted, ref, h } from 'vue';
import { useRouter } from 'vue-router';
import { Table, Tag, Card, Select, Space, message } from 'ant-design-vue';
import type { ColumnsType } from 'ant-design-vue/es/table';
import { api } from '@/api/api';
import { useTeamUser } from '@/composables/useTeamUser';
import { STATUS_MAP, TASK_TYPE_MAP } from '@/utils/constants';
import { formatTime, stageDisplayName } from '@/utils/helpers';
import { t } from '@/utils/i18n';
import type { TaskListItem, TaskStatus } from '@/api/types';

const router = useRouter();
const { user } = useTeamUser();

const loading = ref(false);
const errorMsg = ref('');
const taskList = ref<TaskListItem[]>([]);
const taskScope = ref<'all' | 'mine'>('all');
const taskStatus = ref<string>('all');

const statusOptions = [
  { value: 'all', label: t('taskList.allStatuses') },
  { value: 'draft', label: t('status.draft') },
  { value: 'in_progress', label: t('status.in_progress') },
  { value: 'blocked', label: t('status.blocked') },
  { value: 'completed', label: t('status.completed') },
  { value: 'cancelled', label: t('status.cancelled') },
  { value: 'archived', label: t('status.archived') },
];

function isMyTask(task: TaskListItem): boolean {
  const email = user.value?.configured ? user.value.user?.email : null;
  if (!email) return false;
  const me = email.toLowerCase();
  if (task.created_by && task.created_by.toLowerCase() === me) return true;
  for (const e of Object.values(task.assignees ?? {})) {
    if (e && e.toLowerCase() === me) return true;
  }
  return false;
}

const filteredTasks = computed(() => {
  let tasks = taskList.value.slice();
  if (taskScope.value === 'mine') {
    tasks = tasks.filter(isMyTask);
  }
  if (taskStatus.value !== 'all') {
    tasks = tasks.filter((t) => t.status === taskStatus.value);
  }
  return tasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
    customRender: ({ record }: { record: TaskListItem }) =>
      h('a', { onClick: () => openDetail(record.task_id) }, record.title),
  },
  {
    title: t('col.status'),
    dataIndex: 'status',
    key: 'status',
    width: 100,
    customRender: ({ record }: { record: TaskListItem }) =>
      h(Tag, { color: statusColor(record.status) }, () => STATUS_MAP[record.status] || record.status),
  },
  {
    title: t('col.type'),
    dataIndex: 'task_type',
    key: 'task_type',
    width: 120,
    customRender: ({ record }: { record: TaskListItem }) => TASK_TYPE_MAP[record.task_type] || record.task_type,
  },
  {
    title: t('col.currentStage'),
    dataIndex: 'current_stage',
    key: 'current_stage',
    width: 120,
    customRender: ({ record }: { record: TaskListItem }) => stageDisplayName(record.current_stage ?? ''),
  },
  {
    title: t('col.progress'),
    key: 'progress',
    width: 120,
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
    width: 160,
    customRender: ({ record }: { record: TaskListItem }) => formatTime(record.updated_at),
  },
];

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const data = await api.listTasks();
    taskList.value = data.tasks ?? [];
  } catch (err: unknown) {
    errorMsg.value = t('taskList.loadFailed') + (err instanceof Error ? err.message : String(err));
    message.error(errorMsg.value);
  } finally {
    loading.value = false;
  }
}

function openDetail(taskId: string) {
  router.push({ name: 'task-detail', params: { id: taskId } });
}

onMounted(load);
</script>

<template>
  <Card :title="t('taskList.title')" :bordered="false">
    <Space style="margin-bottom: 16px">
      <span>{{ t('taskList.scope') }}</span>
      <Select v-model:value="taskScope" style="width: 120px">
        <Select.Option value="all">{{ t('taskList.scopeAll') }}</Select.Option>
        <Select.Option value="mine">{{ t('taskList.scopeMine') }}</Select.Option>
      </Select>
      <span>{{ t('taskList.status') }}</span>
      <Select v-model:value="taskStatus" style="width: 120px">
        <Select.Option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </Select.Option>
      </Select>
      <span style="margin-left: 16px; color: var(--color-text-muted)">
        {{ t('taskList.count', { shown: filteredTasks.length, total: taskList.length }) }}
      </span>
    </Space>

    <Table
      :columns="columns"
      :data-source="filteredTasks"
      :loading="loading"
      row-key="task_id"
      :pagination="{ pageSize: 20, showTotal: (total: number) => t('taskList.total', { total }) }"
    >
      <template #emptyText>
        <span v-if="errorMsg">{{ errorMsg }}</span>
        <span v-else>{{ t('taskList.empty') }}</span>
      </template>
    </Table>
  </Card>
</template>
