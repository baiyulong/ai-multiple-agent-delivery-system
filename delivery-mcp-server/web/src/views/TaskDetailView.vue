<script setup lang="ts">
/**
 * 任务详情页：使用 Ant Design Vue 组件（Descriptions, Card, Tabs, Tag, Collapse）。
 */
import { ref, watch, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { Card, Descriptions, Tag, Button, Collapse, Space, message } from 'ant-design-vue';
import { api, exportUrl } from '@/api/api';
import { useTeamUser } from '@/composables/useTeamUser';
import { formatTime } from '@/utils/helpers';
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
    message.error(errorMsg.value);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void fetchDetail();
});

watch(
  () => route.params.id,
  (val) => {
    if (val) void fetchDetail();
  },
);

const task = computed(() => detail.value?.task ?? null);
const stages = computed(() => detail.value?.stages ?? []);
const currentStage = computed(() => task.value?.current_stage ?? null);
const gateSummary = computed(() => detail.value?.gate_summary ?? null);
const artifacts = computed(() => detail.value?.artifacts ?? []);
const questions = computed(() => detail.value?.open_questions ?? []);

// 共享上下文
const contextExpanded = ref(false);
const contextLoading = ref(false);
const contextError = ref('');
const contextContent = ref('');
const contextLoaded = ref(false);

watch(
  detail,
  (d) => {
    if (d && d.task.status === 'completed') {
      void loadContext();
    }
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
    contextError.value = '加载失败：' + (err instanceof Error ? err.message : String(err));
  } finally {
    contextLoading.value = false;
  }
}

// 交付包
const deliveryVisible = computed(() => task.value?.status === 'completed');
const deliveryContent = ref('');
const deliveryShown = ref(false);
const deliveryLoading = ref(false);
const deliveryError = ref('');

async function loadDeliveryPackage() {
  deliveryLoading.value = true;
  deliveryError.value = '';
  try {
    const data = await api.getDeliveryPackage(taskId.value);
    deliveryContent.value = data.content || '';
    deliveryShown.value = true;
  } catch (err: unknown) {
    deliveryError.value = err instanceof Error ? err.message : String(err);
  } finally {
    deliveryLoading.value = false;
  }
}

/** 下载交付包（md / html，走 <a download> 触发浏览器下载） */
function downloadPackage(format: 'md' | 'html') {
  const url = format === 'html' ? exportUrl.deliveryPackageHtml(taskId.value) : exportUrl.deliveryPackageMd(taskId.value);
  const a = document.createElement('a');
  a.href = url;
  a.download = `delivery_package_${taskId.value}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

</script>

<template>
  <div v-if="loading" style="text-align: center; padding: 60px">
    <div>加载任务详情...</div>
  </div>

  <div v-else-if="errorMsg" style="text-align: center; padding: 60px">
    <p style="color: #ff4d4f">{{ errorMsg }}</p>
    <Button type="primary" @click="fetchDetail">重试</Button>
  </div>

  <div v-else-if="task">
    <!-- 基本信息 -->
    <Card :bordered="false" style="margin-bottom: 16px">
      <template #title>
        <Space>
          <span>{{ task.title }}</span>
          <Tag :color="task.status === 'completed' ? 'success' : task.status === 'blocked' ? 'error' : 'processing'">
            {{ STATUS_MAP[task.status] || task.status }}
          </Tag>
        </Space>
      </template>
      <Descriptions :column="2" bordered>
        <Descriptions.Item label="任务 ID">{{ task.task_id }}</Descriptions.Item>
        <Descriptions.Item label="类型">{{ TASK_TYPE_MAP[task.task_type] || task.task_type }}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{{ formatTime(task.created_at) }}</Descriptions.Item>
        <Descriptions.Item label="更新时间">{{ formatTime(task.updated_at) }}</Descriptions.Item>
        <Descriptions.Item label="描述" :span="2">{{ task.description || '暂无描述' }}</Descriptions.Item>
      </Descriptions>
    </Card>

    <!-- 阶段进度 -->
    <Card title="阶段进度" :bordered="false" style="margin-bottom: 16px">
      <StageProgress :stages="stages" :current-stage="currentStage" :team="team" :user="user" />
    </Card>

    <!-- 门禁摘要 -->
    <GateSummary :gate-summary="gateSummary" />

    <!-- 交付物 -->
    <Card v-if="artifacts.length > 0" title="交付物" :bordered="false" style="margin-bottom: 16px">
      <Collapse>
        <Collapse.Panel v-for="a in artifacts" :key="a.artifact_id">
          <template #header>
            <Space>
              <span>{{ a.artifact_type }}</span>
              <Tag>{{ a.status }}</Tag>
              <span>v{{ a.version }}</span>
            </Space>
          </template>
          <ArtifactItem :artifact="a" :task-id="taskId" />
        </Collapse.Panel>
      </Collapse>
    </Card>

    <!-- 待确认问题 -->
    <Card v-if="questions.length > 0" title="待确认问题" :bordered="false" style="margin-bottom: 16px">
      <QuestionItem v-for="q in questions" :key="q.question_id" :question="q" />
    </Card>

    <!-- 共享上下文 -->
    <Card v-if="task" title="共享上下文" :bordered="false" style="margin-bottom: 16px">
      <Button size="small" @click="contextExpanded = !contextExpanded">
        {{ contextExpanded ? '收起' : '展开' }}
      </Button>
      <div v-if="contextExpanded" style="margin-top: 16px">
        <div v-if="contextLoading">加载中...</div>
        <div v-else-if="contextError" style="color: #ff4d4f">{{ contextError }}</div>
        <MarkdownView v-else :source="contextContent" />
      </div>
    </Card>

    <!-- 交付包 -->
    <Card v-if="deliveryVisible" title="交付包" :bordered="false">
      <Space>
        <Button type="primary" :loading="deliveryLoading" @click="loadDeliveryPackage">
          {{ deliveryShown ? '已加载' : '查看交付包' }}
        </Button>
        <Button @click="downloadPackage('md')">下载 Markdown</Button>
        <Button @click="downloadPackage('html')">下载 HTML</Button>
      </Space>
      <div v-if="deliveryError" style="color: #ff4d4f; margin-top: 8px">{{ deliveryError }}</div>
      <div v-if="deliveryShown" style="margin-top: 16px">
        <MarkdownView :source="deliveryContent" />
      </div>
    </Card>
  </div>
</template>
