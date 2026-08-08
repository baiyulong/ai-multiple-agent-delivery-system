<script setup lang="ts">
/**
 * 任务列表页：三态 + 范围/状态筛选 + 任务卡片 + 导出。
 * 行为与旧版 app.js 586-702 行保真一致（含「我的任务」邮箱匹配逻辑）。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, exportUrl } from '@/api/client';
import { useTeamUser } from '@/composables/useTeamUser';
import { STATUS_MAP, TASK_TYPE_MAP } from '@/utils/constants';
import { formatTime, stageDisplayName, statusBadgeClass } from '@/utils/helpers';
import type { TaskListItem } from '@/api/types';

const router = useRouter();
const { user } = useTeamUser();

const loading = ref(true);
const errorMsg = ref('');
const taskList = ref<TaskListItem[]>([]);
const taskScope = ref<'all' | 'mine'>('all');
const taskStatus = ref('all');

/** 是否属于当前用户：创建者或参与者（邮箱不区分大小写，isMyTask） */
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
  // 按创建时间倒序（与旧版一致）
  return tasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
});

const isFiltered = computed(() => taskScope.value !== 'all' || taskStatus.value !== 'all');
const countText = computed(() => `${filteredTasks.value.length} / ${taskList.value.length} 个任务`);
const emptyMessage = computed(() => (isFiltered.value ? '没有匹配的任务' : '暂无任务'));

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const data = await api.listTasks();
    taskList.value = data.tasks ?? [];
  } catch (err: unknown) {
    errorMsg.value = '加载任务列表失败：' + (err instanceof Error ? err.message : String(err));
  } finally {
    loading.value = false;
  }
}

function retry() {
  void load();
}

function openDetail(taskId: string) {
  router.push({ name: 'task-detail', params: { id: taskId } });
}

function onCardKeydown(e: KeyboardEvent, taskId: string) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    openDetail(taskId);
  }
}

/** 进度百分比：total 为 0 时按 1 算（与旧版一致） */
function progressPct(task: TaskListItem): number {
  const total = task.total_stages || 1;
  return Math.round(((task.completed_stages || 0) / total) * 100);
}

onMounted(load);
</script>

<template>
  <section class="view active">
    <div class="view-header">
      <div class="view-header-left">
        <h2 class="view-title">任务列表</h2>
        <span v-if="!loading && !errorMsg" class="task-count">{{ countText }}</span>
      </div>
      <a class="btn btn-sm" :href="exportUrl.tasks" download="tasks.md" title="导出当前任务列表为 Markdown">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        导出 Markdown
      </a>
    </div>

    <div class="list-filters">
      <div class="scope-tabs">
        <button
          class="scope-btn"
          :class="{ active: taskScope === 'all' }"
          type="button"
          @click="taskScope = 'all'"
        >全部任务</button>
        <button
          class="scope-btn"
          :class="{ active: taskScope === 'mine' }"
          type="button"
          @click="taskScope = 'mine'"
        >我的任务</button>
      </div>
      <select class="status-filter" v-model="taskStatus" title="按状态筛选">
        <option value="all">全部状态</option>
        <option value="draft">草稿</option>
        <option value="in_progress">进行中</option>
        <option value="blocked">已阻塞</option>
        <option value="completed">已完成</option>
        <option value="cancelled">已取消</option>
        <option value="archived">已归档</option>
      </select>
    </div>

    <!-- 加载态 -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <span>加载任务列表...</span>
    </div>

    <!-- 错误态 -->
    <div v-else-if="errorMsg" class="error-state">
      <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      <p>{{ errorMsg }}</p>
      <button class="btn btn-sm" @click="retry">重试</button>
    </div>

    <!-- 空态 -->
    <div v-else-if="filteredTasks.length === 0" class="empty-state">
      <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="9" y1="9" x2="15" y2="15" />
        <line x1="15" y1="9" x2="9" y2="15" />
      </svg>
      <p>{{ emptyMessage }}</p>
    </div>

    <!-- 任务卡片 -->
    <div v-else class="task-list">
      <div
        v-for="task in filteredTasks"
        :key="task.task_id"
        class="task-card"
        role="button"
        tabindex="0"
        @click="openDetail(task.task_id)"
        @keydown="onCardKeydown($event, task.task_id)"
      >
        <div class="task-card-top">
          <span class="task-card-title">{{ task.title }}</span>
          <span class="badge" :class="statusBadgeClass(task.status)">{{ STATUS_MAP[task.status] || task.status }}</span>
        </div>
        <div class="task-card-meta">
          <span class="meta-item">
            <span class="meta-label">ID</span>
            <span class="mono">{{ task.task_id }}</span>
          </span>
          <span class="meta-item">
            <span class="meta-label">类型</span>
            <span>{{ TASK_TYPE_MAP[task.task_type] || task.task_type }}</span>
          </span>
          <span class="meta-item">
            <span class="meta-label">当前阶段</span>
            <span>{{ stageDisplayName(task.current_stage ?? '') }}</span>
          </span>
          <span class="meta-item">
            <span class="meta-label">更新</span>
            <span>{{ formatTime(task.updated_at) }}</span>
          </span>
        </div>
        <div class="task-card-progress">
          <div class="progress-bar">
            <div
              class="progress-bar-fill"
              :class="{ complete: progressPct(task) >= 100 }"
              :style="{ width: progressPct(task) + '%' }"
            ></div>
          </div>
          <span class="progress-text">{{ task.completed_stages || 0 }}/{{ task.total_stages || 0 }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
