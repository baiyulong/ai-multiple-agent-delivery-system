<script setup lang="ts">
/**
 * 任务详情页 — 完整复刻旧版 app.js 841-1128 行的所有行为。
 * 加载三态（spinner / 错误+重试 / 正常），与旧版一致。
 */
import { ref, watch, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api/client';
import { useTeamUser } from '@/composables/useTeamUser';
import {
  formatTime,
  statusBadgeClass,
} from '@/utils/helpers';
import { STATUS_MAP, TASK_TYPE_MAP } from '@/utils/constants';
import type { TaskDetailResponse } from '@/api/types';
import StageProgress from '@/components/StageProgress.vue';
import GateSummary from '@/components/GateSummary.vue';
import ArtifactItem from '@/components/ArtifactItem.vue';
import QuestionItem from '@/components/QuestionItem.vue';
import MarkdownView from '@/components/MarkdownView.vue';

const route = useRoute();
const { team, user } = useTeamUser();

const loading = ref(true);
const errorMsg = ref('');
const detail = ref<TaskDetailResponse | null>(null);

const taskId = computed(() => route.params.id as string);

/** 获取任务详情 */
async function fetchDetail() {
  loading.value = true;
  errorMsg.value = '';
  detail.value = null;
  try {
    const data = await api.getTaskDetail(taskId.value);
    detail.value = data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errorMsg.value = '加载任务详情失败：' + msg;
  } finally {
    loading.value = false;
  }
}

function retry() {
  void fetchDetail();
}

onMounted(() => {
  void fetchDetail();
});

// 路由变化时重新加载
watch(
  () => route.params.id,
  (val) => {
    if (val) void fetchDetail();
  },
);

// ——— 基本信息 ———
const task = computed(() => detail.value?.task ?? null);
const taskTitle = computed(() => task.value?.title ?? '');
const taskStatusText = computed(() => {
  const s = task.value?.status ?? '';
  return STATUS_MAP[s] || s;
});
const taskStatusClass = computed(() =>
  statusBadgeClass(task.value?.status ?? ''),
);
const taskDesc = computed(() => task.value?.description || '暂无描述');
const taskTypeText = computed(() => {
  const t = task.value?.task_type ?? '';
  return TASK_TYPE_MAP[t] || t;
});
const taskIdText = computed(() => task.value?.task_id ?? '');
const taskCreated = computed(() => formatTime(task.value?.created_at));
const taskUpdated = computed(() => formatTime(task.value?.updated_at));

// ——— 阶段进度 ———
const stages = computed(() => detail.value?.stages ?? []);
const currentStage = computed(() => task.value?.current_stage ?? null);

// ——— 门禁摘要 ———
const gateSummary = computed(() => detail.value?.gate_summary ?? null);

// ——— 交付物 ———
const artifacts = computed(() => detail.value?.artifacts ?? []);

// ——— 问题 ———
const questions = computed(() => detail.value?.open_questions ?? []);

// ——— 共享上下文（可折叠） ———
// 旧版 loadContextContent 对所有状态的任务都显示该卡（无条件移除 hidden），
// 仅当任务存在即显示；展开/收起由用户控制。
const contextExpanded = ref(false);
const contextLoading = ref(false);
const contextError = ref('');
const contextContent = ref('');
const contextLoaded = ref(false);
const contextVisible = computed(() => !!task.value);

watch(
  detail,
  (d) => {
    if (d && d.task.status === 'completed') {
      // 加载共享上下文
      void loadContext();
    }
    // 重置
    contextExpanded.value = false;
  },
  { immediate: true },
);

async function loadContext() {
  contextLoading.value = true;
  contextError.value = '';
  try {
    const data = await api.getContext(taskId.value);
    contextContent.value = data.content || '';
    contextLoaded.value = true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    contextError.value = '加载失败：' + msg;
  } finally {
    contextLoading.value = false;
  }
}

function toggleContext() {
  contextExpanded.value = !contextExpanded.value;
}

// ——— 交付包 ———
const deliveryVisible = computed(() => task.value?.status === 'completed');
const deliveryContent = ref('');
const deliveryShown = ref(false);
const deliveryBtnDisabled = ref(false);
const deliveryBtnText = ref('查看交付包');
const deliveryError = ref('');

async function loadDeliveryPackage() {
  if (!taskId.value) return;
  deliveryBtnDisabled.value = true;
  deliveryBtnText.value = '加载中...';
  deliveryError.value = '';
  try {
    const data = await api.getDeliveryPackage(taskId.value);
    deliveryContent.value = data.content || '';
    deliveryShown.value = true;
    deliveryBtnText.value = '已加载';
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('404')) {
      deliveryBtnText.value = '交付包尚未生成';
    } else {
      deliveryBtnText.value = '加载失败';
    }
    deliveryError.value = msg;
    setTimeout(() => {
      deliveryBtnDisabled.value = false;
      deliveryBtnText.value = '查看交付包';
    }, 3000);
  }
}

function refreshDetail() {
  void fetchDetail();
}
</script>

<template>
  <section class="view active">
    <!-- 视图头部 -->
    <div class="view-header">
      <RouterLink class="btn btn-back" to="/">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          width="18"
          height="18"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        返回列表
      </RouterLink>
      <button class="btn btn-sm" type="button" @click="refreshDetail">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          width="14"
          height="14"
        >
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path
            d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"
          />
        </svg>
        刷新
      </button>
    </div>

    <!-- 加载态 -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <span>加载任务详情...</span>
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

    <!-- 正常内容 -->
    <template v-else-if="task">
      <!-- 基本信息 -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">{{ taskTitle }}</h2>
          <span class="badge" :class="taskStatusClass">{{ taskStatusText }}</span>
        </div>
        <div class="card-body">
          <p class="detail-desc">{{ taskDesc }}</p>
          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-label">任务 ID</span>
              <span class="meta-value mono">{{ taskIdText }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">类型</span>
              <span class="meta-value">{{ taskTypeText }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">创建时间</span>
              <span class="meta-value">{{ taskCreated }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">更新时间</span>
              <span class="meta-value">{{ taskUpdated }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 阶段进度 -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">阶段进度</h2>
        </div>
        <div class="card-body">
          <StageProgress
            :stages="stages"
            :current-stage="currentStage"
            :team="team"
            :user="user"
          />
        </div>
      </div>

      <!-- 门禁摘要 -->
      <GateSummary :gate-summary="gateSummary" />

      <!-- 交付物 -->
      <div v-if="artifacts.length > 0" class="card">
        <div class="card-header">
          <h2 class="card-title">交付物</h2>
        </div>
        <div class="card-body">
          <div class="artifact-list">
            <ArtifactItem
              v-for="a in artifacts"
              :key="a.artifact_id"
              :artifact="a"
              :task-id="taskId"
            />
          </div>
        </div>
      </div>

      <!-- 待确认问题 -->
      <div v-if="questions.length > 0" class="card">
        <div class="card-header">
          <h2 class="card-title">待确认问题</h2>
        </div>
        <div class="card-body">
          <div class="question-list">
            <QuestionItem
              v-for="q in questions"
              :key="q.question_id"
              :question="q"
            />
          </div>
        </div>
      </div>

      <!-- 共享上下文 -->
      <div v-if="contextVisible" class="card">
        <div class="card-header">
          <h2 class="card-title">共享上下文</h2>
          <button class="btn btn-sm btn-toggle" @click="toggleContext">
            {{ contextExpanded ? '收起' : '展开' }}
          </button>
        </div>
        <div
          class="card-body collapsible"
          :class="{ expanded: contextExpanded }"
        >
          <template v-if="contextExpanded">
            <div v-if="contextLoading" style="color: var(--color-text-muted); padding: var(--space-md)">
              加载中...
            </div>
            <div v-else-if="contextError" style="color: var(--color-danger); padding: var(--space-md)">
              {{ contextError }}
            </div>
            <MarkdownView v-else :source="contextContent" />
          </template>
        </div>
      </div>

      <!-- 交付包 -->
      <div v-if="deliveryVisible" class="card">
        <div class="card-header">
          <h2 class="card-title">交付包</h2>
        </div>
        <div class="card-body">
          <button
            class="btn btn-primary"
            :disabled="deliveryBtnDisabled"
            @click="loadDeliveryPackage"
          >
            {{ deliveryBtnText }}
          </button>
          <div v-if="deliveryShown" style="margin-top: var(--space-md)">
            <MarkdownView :source="deliveryContent" />
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
